from pathlib import Path
import csv, json, math, os, sys, tempfile

RUNTIME=Path(os.environ.get('AUDIT_RUNTIME_DIR','/tmp/audit-runtime'))
sys.path.insert(0,str(RUNTIME))
from audit_engine.pipeline import run_audit

LABOR_CASES=[
    {'multiplier':2.417,'payroll_rate':31.28,'hours':7.5,'billed_rate':84.75},
    {'multiplier':3.125,'payroll_rate':22.40,'hours':13.25,'billed_rate':76.10},
    {'multiplier':1.875,'payroll_rate':48.60,'hours':4.75,'billed_rate':96.35},
    {'multiplier':2.683,'payroll_rate':27.95,'hours':9.40,'billed_rate':81.22},
]
FEE_CASES=[
    {'cap_pct':4.5,'billed_pct':7.25,'base':73450.0},
    {'cap_pct':9.0,'billed_pct':11.4,'base':128375.55},
    {'cap_pct':2.75,'billed_pct':3.6,'base':44218.20},
    {'cap_pct':12.5,'billed_pct':15.0,'base':91500.0},
]

def r2(x):
    return round(float(x)+1e-9,2)

def high_over_findings(r, code):
    return [f for f in r.get('findings',[]) if f.get('confidence')=='HIGH' and f.get('status')=='OVERBILLED' and f.get('code')==code]

results={'benchmark':'Dynamic-number anti-memorization mutation test','labor_cases':[],'fee_cases':[]}

with tempfile.TemporaryDirectory() as td:
    d=Path(td)
    for i,c in enumerate(LABOR_CASES,1):
        contract=d/f'labor_contract_{i}.txt'
        contract.write_text(
            f"Commercial labor billing clause. Overall multiplier of {c['multiplier']}. "
            "The multiplier is applied to the actual hourly labor rate paid to employees to determine the invoiced billing rate.\n",
            encoding='utf-8')
        inv=d/f'labor_invoice_{i}.csv'
        amount=c['billed_rate']*c['hours']
        with inv.open('w',newline='',encoding='utf-8') as f:
            w=csv.writer(f); w.writerow(['invoice_id','rate_key','hours','rate','amount','vendor','service_date','description'])
            w.writerow([f'MUT-L-{i}','Field Engineer',c['hours'],c['billed_rate'],f'{amount:.6f}','Mutation Vendor',f'2026-0{i}-15','Field Engineer'])
        ev=d/f'labor_evidence_{i}.csv'
        with ev.open('w',newline='',encoding='utf-8') as f:
            w=csv.writer(f); w.writerow(['invoice_id','classification','hours','rate','service_date','description'])
            w.writerow([f'MUT-L-{i}','Field Engineer',c['hours'],c['payroll_rate'],f'2026-0{i}-15','Payroll register actual hourly rate'])
        r=run_audit(contract,inv,evidence_paths=[ev])
        allowed=c['payroll_rate']*c['multiplier']
        expected=max(0,(c['billed_rate']-allowed)*c['hours'])
        fs=high_over_findings(r,'RATE_MISMATCH')
        actual=sum(float(f.get('amount',0) or 0) for f in fs)
        extracted=(r.get('rules') or {}).get('labor_formula',{}).get('payroll_multiplier')
        results['labor_cases'].append({**c,'expected_allowed_rate':r2(allowed),'expected_overbilling':r2(expected),'extracted_multiplier':extracted,'actual_overbilling':r2(actual),'pass':abs(float(extracted)-c['multiplier'])<1e-9 and r2(actual)==r2(expected)})

    for i,c in enumerate(FEE_CASES,1):
        contract=d/f'fee_contract_{i}.txt'
        contract.write_text(
            f"Subcontractor fee shall not exceed {c['cap_pct']} percent of subcontractor base cost.\n",
            encoding='utf-8')
        inv=d/f'fee_invoice_{i}.csv'
        total=c['base']*(1+c['billed_pct']/100)
        with inv.open('w',newline='',encoding='utf-8') as f:
            w=csv.writer(f); w.writerow(['invoice_id','type','subcontractor_base_cost','markup_pct','amount','vendor','service_date','description'])
            w.writerow([f'MUT-F-{i}','subcontractor',c['base'],c['billed_pct'],f'{total:.6f}','Mutation Vendor',f'2026-0{i}-20','Subcontractor cost plus fee'])
        r=run_audit(contract,inv)
        expected=c['base']*((c['billed_pct']-c['cap_pct'])/100)
        fs=high_over_findings(r,'SUBCONTRACTOR_MARKUP_EXCEEDED')
        actual=sum(float(f.get('amount',0) or 0) for f in fs)
        extracted=(r.get('rules') or {}).get('subcontractor',{}).get('markup_cap_pct')
        results['fee_cases'].append({**c,'expected_overbilling':r2(expected),'extracted_cap_pct':extracted,'actual_overbilling':r2(actual),'pass':abs(float(extracted)-c['cap_pct'])<1e-9 and r2(actual)==r2(expected)})

results['summary']={
    'labor_passed':sum(1 for x in results['labor_cases'] if x['pass']),
    'labor_total':len(results['labor_cases']),
    'fee_passed':sum(1 for x in results['fee_cases'] if x['pass']),
    'fee_total':len(results['fee_cases']),
}
results['summary']['all_pass']=results['summary']['labor_passed']==results['summary']['labor_total'] and results['summary']['fee_passed']==results['summary']['fee_total']
print(json.dumps(results,indent=2))
if not results['summary']['all_pass']:
    raise SystemExit(1)
