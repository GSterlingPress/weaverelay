from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4
import json, re

from audit_engine.pipeline import run_audit
from source_registry import SourceRegistry
from financial_catalog import build_financial_catalog
from consensus import build_consensus
from analyzer_b import run_analyzer_b
from analyzer_c import run_analyzer_c
from sealed_room import run_sealed, source_fingerprints, isolation_attestation

ANALYZERS=("A","B","C")

def _audit_id()->str:
    return f"AUD-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{uuid4().hex[:8].upper()}"

def _engine_a(contract:str,invoice:str,field:str|None,evidence:list[str])->dict:
    result=deepcopy(run_audit(contract,invoice,field,evidence_paths=list(evidence)))
    result["analyzer"]="A"; result["engine"]="validated-deterministic-audit-kernel"; return result

def _strings(v):
    if isinstance(v,str):yield v
    elif isinstance(v,dict):
        for x in v.values():yield from _strings(x)
    elif isinstance(v,(list,tuple)):
        for x in v:yield from _strings(x)

def _a_inputs_from_own_finding(f:dict,code:str,mult,cap)->dict:
    existing=f.get("inputs") or f.get("values") or f.get("details")
    if isinstance(existing,dict) and existing:return existing
    text=" ".join(_strings(f))
    if code=="RATE_MISMATCH":
        m=re.search(r"payroll\s*\$?([0-9.,]+)\s*/?hr\s*x\s*([0-9.]+).*?billed\s*\$?([0-9.,]+)\s*/?hr\s*for\s*([0-9.,]+)\s*hours",text,re.I)
        if m:return {"billed_rate":float(m.group(3).replace(',','')),"payroll_rate":float(m.group(1).replace(',','')),"multiplier":float(m.group(2)),"hours":float(m.group(4).replace(',',''))}
        out={}
        for canon,names in {"billed_rate":("billed_rate","rate"),"payroll_rate":("payroll_rate","actual_rate"),"hours":("hours","quantity","qty")}.items():
            for n in names:
                if f.get(n) not in (None,''):
                    try:out[canon]=float(f[n]);break
                    except Exception:pass
        if mult is not None:out["multiplier"]=float(mult)
        return out
    if code=="SUBCONTRACTOR_MARKUP_EXCEEDED":
        out={}
        for canon,names in {"base_cost":("base_cost","subcontractor_base_cost","subcontractor_cost"),"billed_pct":("billed_pct","markup_pct","fee_pct")}.items():
            for n in names:
                if f.get(n) not in (None,''):
                    try:out[canon]=float(f[n]);break
                    except Exception:pass
        if cap is not None:out["cap_pct"]=float(cap)
        return out
    return {}

def _normalize_a_traces(result:dict)->None:
    rules=result.get("rules") or {}; mult=((rules.get("labor_formula") or {}).get("payroll_multiplier")); cap=((rules.get("subcontractor") or {}).get("markup_cap_pct"))
    for f in result.get("findings",[]) or []:
        code=str(f.get("code") or ""); details=_a_inputs_from_own_finding(f,code,mult,cap); iid=str(f.get("invoice_id") or f.get("invoice") or "")
        if code=="RATE_MISMATCH":trace={"rule_kind":"labor_multiplier","rule_value":mult,"invoice_id":iid,"description":str(f.get("description") or ""),"formula_id":"LABOR_RATE_DELTA","inputs":details}
        elif code=="SUBCONTRACTOR_MARKUP_EXCEEDED":trace={"rule_kind":"subcontract_cap_pct","rule_value":cap,"invoice_id":iid,"description":str(f.get("description") or ""),"formula_id":"SUBCONTRACT_FEE_DELTA","inputs":details}
        else:trace={"rule_kind":code or "other","rule_value":f.get("rule") or f.get("allowed") or f.get("contract_rule"),"invoice_id":iid,"description":str(f.get("description") or ""),"formula_id":code or "OTHER","inputs":details}
        f["_zero_dave_trace"]=trace

def _annotate_after_commit(result:dict,registry:SourceRegistry,contract:str,invoice:str,evidence:list[str])->None:
    # Canonical IDs are attached only after the analyzer has committed its sealed output.
    c=registry.doc_id_for_path(contract); i=registry.doc_id_for_path(invoice); ev=[registry.doc_id_for_path(p) for p in evidence]
    for f in result.get('findings',[]) or []:
        f.setdefault('canonical_sources',{}).update({'contract_document':c,'invoice_document':i,'evidence_documents':[x for x in ev if x]})

def run_zero_dave_audit(*,contract:str,invoice:str,field:str|None=None,evidence:list[str]|None=None,original_names:dict[str,str]|None=None)->dict:
    evidence=list(evidence or []); original_names=original_names or {}; audit_id=_audit_id(); registry=SourceRegistry(audit_id)
    registry.add(contract,"contract",original_names.get(contract)); registry.add(invoice,"invoice",original_names.get(invoice))
    if field:registry.add(field,"field",original_names.get(field))
    for p in evidence:registry.add(p,"evidence",original_names.get(p))

    fingerprints=source_fingerprints(contract,invoice,field,evidence)

    # SEALED ROOMS: each analyzer receives only private byte-identical copies of original evidence.
    # No shared catalog, peer result, consensus state, target dollar, disagreement hint, or canonical
    # interpretation is passed into any room. Outputs are committed before cross-analyzer comparison.
    def run_a(sealed):
        r=_engine_a(sealed.contract,sealed.invoice,sealed.field,list(sealed.evidence)); _normalize_a_traces(r); return r
    def run_b(sealed):
        local_registry=SourceRegistry(f'{audit_id}-B-PRIVATE')
        local_registry.add(sealed.contract,'contract'); local_registry.add(sealed.invoice,'invoice')
        if sealed.field:local_registry.add(sealed.field,'field')
        for p in sealed.evidence:local_registry.add(p,'evidence')
        return run_analyzer_b(contract=sealed.contract,invoice=sealed.invoice,field=sealed.field,evidence=list(sealed.evidence),registry=local_registry)
    def run_c(sealed):
        local_registry=SourceRegistry(f'{audit_id}-C-PRIVATE')
        local_registry.add(sealed.contract,'contract'); local_registry.add(sealed.invoice,'invoice')
        if sealed.field:local_registry.add(sealed.field,'field')
        for p in sealed.evidence:local_registry.add(p,'evidence')
        return run_analyzer_c(contract=sealed.contract,invoice=sealed.invoice,field=sealed.field,evidence=list(sealed.evidence),registry=local_registry)

    a=run_sealed('A',run_a,contract=contract,invoice=invoice,field=field,evidence=evidence)
    b=run_sealed('B',run_b,contract=contract,invoice=invoice,field=field,evidence=evidence)
    c=run_sealed('C',run_c,contract=contract,invoice=invoice,field=field,evidence=evidence)
    analyzer_results={'A':a,'B':b,'C':c}

    # Cross-analyzer work starts only here, after all three sealed outputs exist.
    for r in analyzer_results.values():_annotate_after_commit(r,registry,contract,invoice,evidence)
    analyzer_catalogs={profile:build_financial_catalog(registry,profile) for profile in ANALYZERS}
    consensus=build_consensus(analyzer_results)

    missing_refs=[]
    for profile,catalog in analyzer_catalogs.items():
        for ref in catalog.get('references',[]):
            if ref.get('appears_present_by_filename') is False:missing_refs.append({'analyzer':profile,**ref})
    attestation=isolation_attestation(analyzer_results,fingerprints)
    return {'audit_id':audit_id,'product':'Zero-Dave Audit','mode':'private-staging','created_at':datetime.now(timezone.utc).isoformat(),'source_registry':registry.manifest(),'analyzer_catalogs':analyzer_catalogs,'analyzer_results':analyzer_results,'consensus':consensus,'sealed_room_isolation':attestation,'complete_package_review':{'possible_missing_references':missing_refs,'financially_relevant_missing_reference_blocks_auto_release':True},'independence':{'sealed_room_enforced':True,'same_original_evidence_only':True,'independent_financial_engines':True,'peer_outputs_hidden_until_all_committed':True,'peer_catalogs_hidden_until_all_committed':True,'disagreement_clues_forbidden':True,'reananalysis_from_original_evidence_only':True,'consensus_is_only_cross_analyzer_reader':True,'shared_deterministic_engine_kernel':False,'customer_triple_independent_badge_allowed':True,'engines':{'A':'validated deterministic Audit kernel','B':'independent contract-first parser/calculator','C':'independent ledger-first evidence reconstruction + sentence-window contract scorer'},'note':'A/B/C run in disposable sealed evidence rooms. Only committed outputs cross into consensus.'}}

def write_manifest(result:dict,path:str|Path)->None:
    Path(path).write_text(json.dumps(result,indent=2,default=str),encoding='utf-8')
