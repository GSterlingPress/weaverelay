from pathlib import Path
import json, os, sys, tempfile

RUNTIME=Path(os.environ.get('AUDIT_RUNTIME_DIR','/tmp/audit-runtime'))
sys.path.insert(0,str(RUNTIME))
from audit_engine.pipeline import run_audit


def high_over(r):
    return round(sum(float(f.get('amount',0) or 0) for f in r.get('findings',[]) if f.get('confidence')=='HIGH' and f.get('status')=='OVERBILLED'),2)

def codes(r):
    return [f.get('code') for f in r.get('findings',[])]

cases=[]
with tempfile.TemporaryDirectory() as td:
    d=Path(td)

    # 1. A multiplier exists, but it is unrelated to labor/payroll pricing.
    c=d/'unrelated_multiplier.txt'
    c.write_text(
        'Insurance reserve calculation uses an actuarial multiplier of 2.735.\n'
        'Labor is invoiced under separately approved hourly schedules.\n', encoding='utf-8')
    i=d/'unrelated_multiplier.csv'
    i.write_text('invoice_id,rate_key,hours,rate,amount,vendor,service_date,description\nUM-1,Engineer,8,140,1120,Vendor A,2026-01-05,Engineer labor\n',encoding='utf-8')
    e=d/'unrelated_multiplier_evidence.csv'
    e.write_text('invoice_id,classification,hours,rate,service_date,description\nUM-1,Engineer,8,40,2026-01-05,Payroll register\n',encoding='utf-8')
    r=run_audit(c,i,evidence_paths=[e])
    cases.append({'case':'unrelated_multiplier_not_labor_formula','false_high_dollars':high_over(r),'labor_formula':(r.get('rules') or {}).get('labor_formula',{}),'codes':codes(r),'pass':high_over(r)==0 and not (r.get('rules') or {}).get('labor_formula',{}).get('payroll_multiplier')})

    # 2. A fee percentage exists, but it is not a subcontractor markup/fee cap.
    c=d/'unrelated_fee.txt'
    c.write_text(
        'Subcontractor costs are reimbursed at actual documented cost.\n'
        'The prime contractor management incentive fee is 6.4 percent of total contract value.\n',encoding='utf-8')
    i=d/'unrelated_fee.csv'
    i.write_text('invoice_id,type,subcontractor_base_cost,markup_pct,amount,vendor,service_date,description\nUF-1,subcontractor,50000,9.5,54750,Vendor B,2026-02-01,Subcontractor cost\n',encoding='utf-8')
    r=run_audit(c,i)
    cases.append({'case':'unrelated_fee_not_subcontractor_cap','false_high_dollars':high_over(r),'subcontractor_rules':(r.get('rules') or {}).get('subcontractor',{}),'codes':codes(r),'pass':high_over(r)==0 and not (r.get('rules') or {}).get('subcontractor',{}).get('markup_cap_pct')})

    # 3. Legitimate repeated labor rows: same vendor/date/description/amount, distinct invoice IDs.
    c=d/'legit_repeat.txt'; c.write_text('Labor billed according to approved invoice backup.\n',encoding='utf-8')
    i=d/'legit_repeat.csv'
    i.write_text('invoice_id,amount,vendor,service_date,description\nLR-1001,425.00,Vendor C,2026-03-10,Senior technician labor\nLR-1002,425.00,Vendor C,2026-03-10,Senior technician labor\n',encoding='utf-8')
    r=run_audit(c,i)
    cases.append({'case':'legitimate_repeated_rows_not_duplicate','false_high_dollars':high_over(r),'codes':codes(r),'pass':high_over(r)==0 and 'DUPLICATE_CHARGE' not in codes(r)})

    # 4. True duplicate: repeated stable invoice + line identity should still be detected.
    c=d/'true_duplicate.txt'; c.write_text('Invoices must not contain duplicate line items.\n',encoding='utf-8')
    i=d/'true_duplicate.csv'
    i.write_text('invoice_id,id,amount,vendor,service_date,description\nTD-77,L-4,312.50,Vendor D,2026-04-03,Equipment charge\nTD-77,L-4,312.50,Vendor D,2026-04-03,Equipment charge\n',encoding='utf-8')
    r=run_audit(c,i)
    duplicate_amount=round(sum(float(f.get('amount',0) or 0) for f in r.get('findings',[]) if f.get('code')=='DUPLICATE_CHARGE' and f.get('confidence')=='HIGH'),2)
    cases.append({'case':'true_duplicate_stable_identity_detected','false_high_dollars':0.0,'detected_duplicate_dollars':duplicate_amount,'codes':codes(r),'pass':abs(duplicate_amount-312.50)<0.01})

    # 5. Matching evidence explicitly says unsupported: must NOT clear the gap.
    c=d/'explicit_unsupported.txt'; c.write_text('Reimbursable costs require supporting documentation.\n',encoding='utf-8')
    i=d/'explicit_unsupported.csv'
    i.write_text('invoice_id,amount,vendor,service_date,description,support_required,supported\nEU-1,1840.00,Vendor E,2026-05-11,Reimbursable field cost,yes,no\n',encoding='utf-8')
    e=d/'explicit_unsupported_evidence.csv'
    e.write_text('invoice_id,supported,description\nEU-1,no,Reviewer confirms documentation remains insufficient\n',encoding='utf-8')
    r=run_audit(c,i,evidence_paths=[e])
    unsupported=float((r.get('totals') or {}).get('unsupported',0) or 0)
    cases.append({'case':'explicit_negative_support_does_not_clear','false_high_dollars':high_over(r),'unsupported':unsupported,'codes':codes(r),'pass':high_over(r)==0 and abs(unsupported-1840.0)<0.01})

    # 6. Conflicting support records: one says supported, one says unsupported.
    # Conservative behavior requires review/unsupported, never automatic clearing or recovery.
    c=d/'conflicting_support.txt'; c.write_text('Reimbursable costs require supporting documentation.\n',encoding='utf-8')
    i=d/'conflicting_support.csv'
    i.write_text('invoice_id,amount,vendor,service_date,description,support_required,supported\nCS-1,2675.00,Vendor F,2026-06-20,Specialty service cost,yes,no\n',encoding='utf-8')
    e=d/'conflicting_support_evidence.csv'
    e.write_text('invoice_id,supported,description\nCS-1,yes,Document packet appears complete\nCS-1,no,Independent reviewer says required authorization is missing\n',encoding='utf-8')
    r=run_audit(c,i,evidence_paths=[e])
    unsupported=float((r.get('totals') or {}).get('unsupported',0) or 0)
    cases.append({'case':'conflicting_support_must_not_auto_clear','false_high_dollars':high_over(r),'unsupported':unsupported,'matching':(r.get('evidence') or {}).get('matching'),'codes':codes(r),'pass':high_over(r)==0 and abs(unsupported-2675.0)<0.01})

summary={
    'benchmark':'Final adversarial safety gate — zero false HIGH-confidence recovery dollars',
    'candidate_commit':'1e194e18c67e161acacd4195e043eb4cf21d8a17',
    'cases':cases,
    'total_cases':len(cases),
    'passed_cases':sum(1 for x in cases if x['pass']),
    'false_high_confidence_recovery_dollars':round(sum(float(x['false_high_dollars']) for x in cases),2),
}
summary['all_pass']=summary['passed_cases']==summary['total_cases'] and summary['false_high_confidence_recovery_dollars']==0
print(json.dumps(summary,indent=2))
if not summary['all_pass']:
    raise SystemExit(1)
