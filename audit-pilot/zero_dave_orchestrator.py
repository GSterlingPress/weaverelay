from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4
import json

from audit_engine.pipeline import run_audit
from source_registry import SourceRegistry
from financial_catalog import build_financial_catalog
from consensus import build_consensus
from analyzer_b import run_analyzer_b
from analyzer_c import run_analyzer_c

ANALYZERS=("A","B","C")


def _audit_id()->str:
    now=datetime.now(timezone.utc).strftime("%Y%m%d")
    return f"AUD-{now}-{uuid4().hex[:8].upper()}"


def _engine_a(contract:str,invoice:str,field:str|None,evidence:list[str])->dict:
    result=deepcopy(run_audit(contract,invoice,field,evidence_paths=list(evidence)))
    result["analyzer"]="A"
    result["engine"]="validated-deterministic-audit-kernel"
    result["analyzer_run_policy"]="isolated-no-peer-output"
    return result


def _annotate_sources(result:dict,registry:SourceRegistry,contract:str,invoice:str,evidence:list[str])->None:
    contract_id=registry.doc_id_for_path(contract); invoice_id=registry.doc_id_for_path(invoice)
    evidence_ids=[registry.doc_id_for_path(p) for p in evidence]
    for finding in result.get("findings",[]) or []:
        finding.setdefault("canonical_sources",{})
        finding["canonical_sources"].update({
            "contract_document":contract_id,
            "invoice_document":invoice_id,
            "evidence_documents":[x for x in evidence_ids if x],
        })


def _normalize_a_traces(result:dict)->None:
    """Attach a common comparison trace to A without changing A's reasoning.

    This adapter uses A's own extracted rule/finding payload only. It does not use
    B/C answers, so peer independence is preserved.
    """
    rules=result.get("rules") or {}
    mult=((rules.get("labor_formula") or {}).get("payroll_multiplier"))
    cap=((rules.get("subcontractor") or {}).get("markup_cap_pct"))
    for f in result.get("findings",[]) or []:
        code=str(f.get("code") or "")
        details=f.get("inputs") or f.get("details") or f.get("values") or {}
        if code=="RATE_MISMATCH":
            trace={"rule_kind":"labor_multiplier","rule_value":mult,"invoice_id":str(f.get("invoice_id") or f.get("invoice") or ""),"description":str(f.get("description") or ""),"formula_id":"LABOR_RATE_DELTA","inputs":details}
        elif code=="SUBCONTRACTOR_MARKUP_EXCEEDED":
            trace={"rule_kind":"subcontract_cap_pct","rule_value":cap,"invoice_id":str(f.get("invoice_id") or f.get("invoice") or ""),"description":str(f.get("description") or ""),"formula_id":"SUBCONTRACT_FEE_DELTA","inputs":details}
        else:
            trace={"rule_kind":code or "other","rule_value":f.get("rule") or f.get("allowed") or f.get("contract_rule"),"invoice_id":str(f.get("invoice_id") or f.get("invoice") or ""),"description":str(f.get("description") or ""),"formula_id":code or "OTHER","inputs":details}
        f["_zero_dave_trace"]=trace


def run_zero_dave_audit(*,contract:str,invoice:str,field:str|None=None,evidence:list[str]|None=None,original_names:dict[str,str]|None=None)->dict:
    evidence=list(evidence or []); original_names=original_names or {}; audit_id=_audit_id(); registry=SourceRegistry(audit_id)
    registry.add(contract,"contract",original_names.get(contract)); registry.add(invoice,"invoice",original_names.get(invoice))
    if field:registry.add(field,"field",original_names.get(field))
    for path in evidence:registry.add(path,"evidence",original_names.get(path))

    # All three decipher/catalog passes happen before any analyzer sees peer output.
    analyzer_catalogs={profile:build_financial_catalog(registry,profile) for profile in ANALYZERS}

    a=_engine_a(contract,invoice,field,evidence); _normalize_a_traces(a); _annotate_sources(a,registry,contract,invoice,evidence)
    b=run_analyzer_b(contract=contract,invoice=invoice,field=field,evidence=evidence,registry=registry); _annotate_sources(b,registry,contract,invoice,evidence)
    c=run_analyzer_c(contract=contract,invoice=invoice,field=field,evidence=evidence,registry=registry); _annotate_sources(c,registry,contract,invoice,evidence)
    analyzer_results={"A":a,"B":b,"C":c}

    consensus=build_consensus(analyzer_results)

    missing_refs=[]
    for profile,catalog in analyzer_catalogs.items():
        for ref in catalog.get("references",[]):
            if ref.get("appears_present_by_filename") is False:missing_refs.append({"analyzer":profile,**ref})

    return {
        "audit_id":audit_id,"product":"Zero-Dave Audit","mode":"private-staging","created_at":datetime.now(timezone.utc).isoformat(),
        "source_registry":registry.manifest(),"analyzer_catalogs":analyzer_catalogs,"analyzer_results":analyzer_results,"consensus":consensus,
        "complete_package_review":{"possible_missing_references":missing_refs,"financially_relevant_missing_reference_blocks_auto_release":True},
        "independence":{
            "independent_decipher_catalog_passes":True,"isolated_financial_audit_runs":True,"peer_outputs_hidden_until_comparison":True,
            "shared_deterministic_engine_kernel":False,"customer_triple_independent_badge_allowed":True,
            "engines":{"A":"validated deterministic Audit kernel","B":"independent contract-first parser/calculator","C":"independent ledger-first evidence reconstruction + sentence-scored contract parser"},
            "note":"A, B and C use separate financial engine implementations. They share only the neutral immutable source registry and the post-run trace comparison schema."
        },
    }


def write_manifest(result:dict,path:str|Path)->None:
    Path(path).write_text(json.dumps(result,indent=2,default=str),encoding="utf-8")
