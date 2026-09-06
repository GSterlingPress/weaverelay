from collections import defaultdict
import re


def _canon(v):
    return re.sub(r'[^a-z0-9]+','_',str(v or '').lower()).strip('_')


def _invoice_row(inv):
    return inv.get('_row') if inv.get('_row') is not None else ((inv.get('_evidence') or {}).get('row'))


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
    import audit_engine.evidence as ev
    import audit_engine.core as core
    import v12_patch

    old_enrich=rel.enrich_invoice_rows
    def enrich(rows, records):
        stats=old_enrich(rows,records)
        backups=defaultdict(list)
        for r in records:
            if r.get('record_type')=='contractor_backup' and isinstance(r.get('amount'),(int,float)):
                backups[_canon(r.get('work_order_id'))].append(r)
        for inv in rows:
            typ=str(inv.get('type','')).lower(); wo=_canon(inv.get('work_order_id'))
            if typ=='subcontractor' and backups.get(wo):
                vals=[float(r['amount']) for r in backups[wo] if float(r.get('amount') or 0)>0]
                if vals:
                    inv['subcontractor_base_cost']=max(vals)
                    inv['_support_evidence']=_source_evidence(inv,records,{'contractor_backup'})
            elif typ=='equipment':
                src=_source_evidence(inv,records,{'equipment_log','work_order'})
                if src: inv['_support_evidence']=src
            elif typ=='mileage':
                src=_source_evidence(inv,records,{'mileage_log'})
                if src: inv['_support_evidence']=src
            elif typ=='unit':
                src=_source_evidence(inv,records,{'completion','ticket'})
                if src: inv['_support_evidence']=src
            elif typ in {'labor','overtime'}:
                src=_source_evidence(inv,records,{'timesheet','timesheet_scope'})
                if src: inv['_support_evidence']=src
        return stats
    ev.enrich_invoice_rows=enrich
    rel.enrich_invoice_rows=enrich
    v12_patch._enrich=enrich

    old_audit=core.audit
    def audit(contract, invoice_rows, field=None):
        findings=old_audit(contract,invoice_rows,field)
        rows_by_num={_invoice_row(r):r for r in invoice_rows}
        for f in findings:
            ir=((f.get('evidence') or {}).get('invoice') or {}).get('row')
            inv=rows_by_num.get(ir)
            if inv and inv.get('_support_evidence'):
                f.setdefault('evidence',{})['field']=inv['_support_evidence'][0]
        cap=((contract.get('subcontractor') or {}).get('markup_cap_pct'))
        if cap is None:return findings
        cap=float(cap)
        existing_markup_rows={
            ((f.get('evidence') or {}).get('invoice') or {}).get('row')
            for f in findings
            if str(f.get('code','')).startswith('SUBCONTRACTOR_MARKUP')
        }
        for inv in invoice_rows:
            if str(inv.get('type','')).lower()!='subcontractor':continue
            billed_pct=inv.get('markup_pct');base=inv.get('subcontractor_base_cost')
            if billed_pct is None or base is None:continue
            billed_pct=float(billed_pct);base=float(base)
            if billed_pct<=cap:continue
            row=_invoice_row(inv)
            if row in existing_markup_rows:continue
            amount=round(base*(billed_pct-cap)/100.0,2)
            if amount<=0:continue
            ev=inv.get('_evidence') or {}
            findings.append({'code':'SUBCONTRACTOR_MARKUP','status':'OVERBILLED','confidence':'HIGH','amount':amount,'message':f'Subcontractor markup billed at {billed_pct:g}%; contract allows {cap:g}% on supported third-party cost of ${base:,.2f}.','evidence':{'invoice':{'source':ev.get('source') or inv.get('_source'),'row':row,'page':ev.get('page') or inv.get('_page'),'table':ev.get('table') or inv.get('_table')},'field':(inv.get('_support_evidence') or [None])[0]}})
            existing_markup_rows.add(row)
        return findings
    core.audit=audit
    rel.audit=audit
