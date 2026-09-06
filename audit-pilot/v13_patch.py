from collections import defaultdict
import re


def _canon(v):
    return re.sub(r'[^a-z0-9]+','_',str(v or '').lower()).strip('_')


def _source_evidence(inv, records, families):
    wo=_canon(inv.get('work_order_id'))
    out=[]
    for r in records:
        if _canon(r.get('work_order_id')) != wo: continue
        if r.get('record_type') not in families: continue
        out.append({'source':r.get('source'),'page':r.get('page'),'record_type':r.get('record_type'),'values':{k:r[k] for k in ('work_order_id','equipment_key','unit_key','quantity','hours','miles','amount','authorized','description') if k in r}})
    return out


def apply_v13():
    import audit_engine.relationship as rel
    import audit_engine.rules as rules
    import v12_patch

    old_enrich=v12_patch._enrich
    def enrich(rows, records):
        stats=old_enrich(rows,records)
        backups=defaultdict(list)
        for r in records:
            if r.get('record_type')=='contractor_backup' and isinstance(r.get('amount'),(int,float)):
                backups[_canon(r.get('work_order_id'))].append(r)
        for inv in rows:
            typ=str(inv.get('type','')).lower(); wo=_canon(inv.get('work_order_id'))
            if typ=='subcontractor' and backups.get(wo):
                # General reconciliation: use supported third-party actual cost for this WO.
                # Do not infer a discrepancy here; the contract rule decides the allowed markup.
                vals=[float(r['amount']) for r in backups[wo] if float(r.get('amount') or 0)>0]
                if vals:
                    inv['subcontractor_base_cost']=max(vals)
                    inv['_support_evidence']=_source_evidence(inv,records,{'contractor_backup'})
            elif typ=='equipment':
                ev=_source_evidence(inv,records,{'equipment_log','work_order'})
                if ev: inv['_support_evidence']=ev
            elif typ=='mileage':
                ev=_source_evidence(inv,records,{'mileage_log'})
                if ev: inv['_support_evidence']=ev
            elif typ=='unit':
                ev=_source_evidence(inv,records,{'completion','ticket'})
                if ev: inv['_support_evidence']=ev
            elif typ in {'labor','overtime'}:
                ev=_source_evidence(inv,records,{'timesheet','timesheet_scope'})
                if ev: inv['_support_evidence']=ev
        return stats
    v12_patch._enrich=enrich

    old_eval=rules.evaluate_invoice
    def evaluate_invoice(contract, invoice_rows, *args, **kwargs):
        findings=old_eval(contract,invoice_rows,*args,**kwargs)
        existing={(f.get('code'), (f.get('evidence') or {}).get('invoice',{}).get('row')) for f in findings}
        cap=((contract.get('subcontractor') or {}).get('markup_cap_pct'))
        if cap is None:return findings
        cap=float(cap)
        for inv in invoice_rows:
            if str(inv.get('type','')).lower()!='subcontractor':continue
            billed_pct=inv.get('markup_pct'); base=inv.get('subcontractor_base_cost')
            if billed_pct is None or base is None:continue
            billed_pct=float(billed_pct);base=float(base)
            if billed_pct<=cap:continue
            key=('SUBCONTRACTOR_MARKUP',inv.get('_row'))
            if key in existing:continue
            amount=round(base*(billed_pct-cap)/100.0,2)
            if amount<=0:continue
            findings.append({'code':'SUBCONTRACTOR_MARKUP','status':'OVERBILLED','confidence':'HIGH','amount':amount,'message':f'Subcontractor markup billed at {billed_pct:g}%; contract allows {cap:g}% on supported third-party cost of ${base:,.2f}.','evidence':{'invoice':{'source':inv.get('_source'),'row':inv.get('_row'),'page':inv.get('_page'),'table':inv.get('_table')},'field':(inv.get('_support_evidence') or [None])[0]},'_invoice_row':inv})
        return findings
    rules.evaluate_invoice=evaluate_invoice
    rel.evaluate_invoice=evaluate_invoice
