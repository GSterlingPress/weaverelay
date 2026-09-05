from __future__ import annotations

from dataclasses import dataclass, asdict
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Iterable
import json

MONEY_TOLERANCE=Decimal('0.01')

@dataclass
class AnalyzerTrace:
    analyzer:str; finding_key:str; status:str; amount:Decimal
    rule:Any; rule_source:Any; invoice_source:Any; evidence_source:Any
    formula:Any; inputs:Any; confidence:str; raw_finding:dict
    rule_kind:str=''; formula_id:str=''; invoice_identity:Any=None
    def to_dict(self)->dict:
        d=asdict(self); d['amount']=float(self.amount); return d

@dataclass
class ConsensusFinding:
    finding_id:str; state:str; verified_amount:Decimal; potential_amount:Decimal
    materiality_band:str; reconciliation_budget:int; divergence_stage:str|None
    traces:list[AnalyzerTrace]; note:str
    def to_dict(self)->dict:
        return {'finding_id':self.finding_id,'state':self.state,'verified_amount':float(self.verified_amount),'potential_amount':float(self.potential_amount),'materiality_band':self.materiality_band,'reconciliation_budget':self.reconciliation_budget,'divergence_stage':self.divergence_stage,'traces':[t.to_dict() for t in self.traces],'note':self.note}

def _money(v:Any)->Decimal:
    try:return Decimal(str(v or 0)).quantize(MONEY_TOLERANCE,rounding=ROUND_HALF_UP)
    except Exception:return Decimal('0.00')

def materiality_policy(amount:Decimal)->tuple[str,int]:
    a=abs(amount)
    if a<Decimal('25'):return 'micro',0
    if a<Decimal('100'):return 'low',1
    if a<Decimal('900'):return 'moderate',2
    if a<Decimal('5000'):return 'high',3
    if a<Decimal('25000'):return 'very-high',3
    return 'maximum',3

def finding_key(finding:dict)->str:
    z=finding.get('_zero_dave_trace') or {}
    iid=str(z.get('invoice_id') or finding.get('invoice_id') or finding.get('invoice') or '').strip()
    desc=str(z.get('description') or finding.get('description') or '').strip()
    code=str(finding.get('code') or z.get('formula_id') or '').strip()
    if iid and code:return f'{iid}|{desc}|{code}'
    for keys in (('invoice_id','line_id','code'),('invoice','line','code'),('description','code','status')):
        vals=[str(finding.get(k,'')).strip() for k in keys]
        if vals and all(vals):return '|'.join(vals)
    return '|'.join(str(finding.get(k,'')).strip() for k in ('code','status','description','vendor','date'))

def _canonical_inputs(v:Any)->Any:
    if not isinstance(v,dict):return v
    aliases={
        'billed_rate':('billed_rate','rate','invoice_rate'), 'payroll_rate':('payroll_rate','actual_rate','evidence_rate'),
        'multiplier':('multiplier','payroll_multiplier'), 'hours':('hours','quantity','qty'),
        'base_cost':('base_cost','subcontractor_base_cost','subcontractor_cost'), 'billed_pct':('billed_pct','markup_pct','fee_pct'), 'cap_pct':('cap_pct','markup_cap_pct','fee_cap_pct')
    }
    low={str(k).lower():val for k,val in v.items()}
    out={}
    for canon,names in aliases.items():
        for n in names:
            if n in low and low[n] not in (None,''):
                try:out[canon]=round(float(low[n]),6)
                except Exception:out[canon]=low[n]
                break
    return out or v

def trace_from_finding(analyzer:str,finding:dict)->AnalyzerTrace:
    z=finding.get('_zero_dave_trace') or {}
    rule=z.get('rule_value',finding.get('rule') or finding.get('allowed') or finding.get('contract_rule'))
    formula=z.get('formula_id',finding.get('formula') or finding.get('calculation') or finding.get('math'))
    inputs=_canonical_inputs(z.get('inputs',finding.get('inputs') or finding.get('values') or finding.get('details')))
    iid=z.get('invoice_id') or finding.get('invoice_id') or finding.get('invoice')
    desc=z.get('description') or finding.get('description')
    return AnalyzerTrace(
        analyzer=analyzer,finding_key=finding_key(finding),status=str(finding.get('status') or 'UNKNOWN'),amount=_money(finding.get('amount')),
        rule=rule,rule_source=finding.get('rule_source') or finding.get('contract_source') or finding.get('source'),
        invoice_source=finding.get('invoice_source') or finding.get('invoice_ref') or finding.get('line_source'),
        evidence_source=finding.get('evidence_source') or finding.get('evidence') or finding.get('matched_evidence'),
        formula=formula,inputs=inputs,confidence=str(finding.get('confidence') or 'UNKNOWN'),raw_finding=finding,
        rule_kind=str(z.get('rule_kind') or finding.get('code') or ''),formula_id=str(z.get('formula_id') or finding.get('code') or ''),
        invoice_identity={'invoice_id':str(iid or ''),'description':str(desc or '')}
    )

def _canon(v:Any)->str:
    if v is None:return ''
    if isinstance(v,Decimal):return str(v.quantize(MONEY_TOLERANCE))
    if isinstance(v,(dict,list,tuple)):return json.dumps(v,sort_keys=True,default=str,separators=(',',':'))
    return str(v).strip()

def first_divergence(traces:Iterable[AnalyzerTrace])->str|None:
    ts=list(traces)
    if {t.analyzer for t in ts}!={'A','B','C'}:return 'missing-analyzer'
    stages=(
        ('classification',lambda t:t.status),('rule-kind',lambda t:t.rule_kind),('contract-rule',lambda t:t.rule),
        ('invoice-identity',lambda t:t.invoice_identity),('formula',lambda t:t.formula_id or t.formula),
        ('inputs',lambda t:t.inputs),('amount',lambda t:t.amount)
    )
    for name,getter in stages:
        vals=[_canon(getter(t)) for t in ts]
        if len(set(vals))!=1:return name
    return None

def build_consensus(analyzer_results:dict[str,dict])->dict:
    grouped={}
    for analyzer,result in analyzer_results.items():
        for f in result.get('findings',[]) or []:
            t=trace_from_finding(analyzer,f); grouped.setdefault(t.finding_key,[]).append(t)
    findings=[]; verified_total=Decimal('0.00'); unresolved_total=Decimal('0.00')
    for idx,(key,traces) in enumerate(sorted(grouped.items()),1):
        amounts=[t.amount for t in traces]; potential=max([abs(a) for a in amounts],default=Decimal('0.00'))
        band,budget=materiality_policy(potential); divergence=first_divergence(traces); complete={t.analyzer for t in traces}=={'A','B','C'}
        if complete and divergence is None:
            amount=traces[0].amount; state='VERIFIED'; note='All three independent financial-engine traces agree at every compared stage.'
            if amount>0:verified_total+=amount
        else:
            amount=Decimal('0.00'); state='UNRESOLVED'; note='Excluded from verified total; trace-level disagreement must be reconciled or disclosed.'; unresolved_total+=potential
        findings.append(ConsensusFinding(f'F-{idx:04d}',state,amount,potential,band,budget,divergence,traces,note))
    return {'findings':[f.to_dict() for f in findings],'verified_total':float(verified_total),'unresolved_potential_total':float(unresolved_total),'policy':{'majority_vote_authorizes_money':False,'persistent_disagreement_in_verified_total':False,'materiality_weighted_reanalysis':True,'max_reconciliation_passes':3,'trace_schema':'zero-dave-v2'}}
