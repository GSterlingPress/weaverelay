from pathlib import Path
import json, os, sys, tempfile

RUNTIME=Path(os.environ.get('AUDIT_RUNTIME_DIR','/tmp/audit-runtime'))
sys.path.insert(0,str(RUNTIME))
from audit_engine.pipeline import run_audit

# This benchmark deliberately creates a long contract with sparse true rules and many decoys.
# The true financial rules are not benchmark-specific constants in the engine; they exist only here as test inputs/ground truth.
TRUE_MULTIPLIER=2.641
TRUE_SUB_FEE=7.25
PAYROLL_RATE=37.40
HOURS=11.75
BILLED_RATE=104.90
SUB_BASE=86325.40
BILLED_SUB_FEE=10.10
EXPECTED_LABOR=round((BILLED_RATE-(PAYROLL_RATE*TRUE_MULTIPLIER))*HOURS,2)
EXPECTED_FEE=round(SUB_BASE*((BILLED_SUB_FEE-TRUE_SUB_FEE)/100),2)

with tempfile.TemporaryDirectory() as td:
    d=Path(td)
    contract=d/'stress_contract.txt'
    pages=[]
    for p in range(1,101):
        body=[f'PAGE {p} OF 100', 'Master Services Agreement — administrative and commercial provisions.']
        # benign decoys that should never become financial audit rules
        if p in {3,9,17,28,44,58,71,83,96}:
            body.append(f'Service quality target multiplier {1.1 + p/1000:.3f} is used only for KPI scoring and is not a billing factor.')
        if p in {6,14,22,35,49,63,77,91}:
            body.append(f'An internal management fee reference of {3 + (p%7)} percent is for budgeting only and is not chargeable to the customer or subcontractor work.')
        if p in {11,31,52,68,88}:
            body.append('The contractor may discuss historical escalation percentages in reports; such references do not amend compensation terms.')
        if p == 37:
            body.append(f'For hourly labor billing, the overall multiplier of {TRUE_MULTIPLIER} is applied to the actual hourly payroll rate of the employee performing the work.')
        if p == 82:
            body.append(f'For subcontractor costs, the subcontractor fee shall be limited to {TRUE_SUB_FEE} percent of the subcontractor cost base.')
        body.append('All other narrative on this page concerns scheduling, safety, reporting, insurance, notices, or non-price administration.')
        pages.append('\n'.join(body))
    contract.write_text('\n\f\n'.join(pages),encoding='utf-8')

    invoice=d/'invoice.csv'
    invoice.write_text(
        'invoice_id,id,type,subcontractor_base_cost,markup_pct,amount,vendor,service_date,description,hours,rate,classification\n'
        f'LAB-100,L1,labor,,,1232.58,Stress Vendor,2026-01-15,Senior field engineer,{HOURS},{BILLED_RATE},Senior Engineer\n'
        f'SUB-100,S1,subcontractor,{SUB_BASE},{BILLED_SUB_FEE},{SUB_BASE*(1+BILLED_SUB_FEE/100):.2f},Stress Vendor,2026-01-15,Subcontractor services,,,\n',
        encoding='utf-8'
    )
    evidence=d/'evidence.csv'
    evidence.write_text(
        'invoice_id,service_date,classification,description,hours,rate,supported\n'
        f'LAB-100,2026-01-15,Senior Engineer,Payroll register actual hourly rate,{HOURS},{PAYROLL_RATE},yes\n',
        encoding='utf-8'
    )

    r=run_audit(contract,invoice,evidence_files=[evidence])
    rules=r.get('rules',{})
    findings=r.get('findings',[])
    labor=[f for f in findings if f.get('code')=='RATE_MISMATCH']
    fee=[f for f in findings if f.get('code') in ('SUBCONTRACTOR_MARKUP_EXCEEDED','MARKUP_EXCEEDED')]
    false_high=[]
    for f in findings:
        if f.get('confidence')=='HIGH' and float(f.get('amount') or 0)>0:
            ok=(f.get('code')=='RATE_MISMATCH' and abs(float(f.get('amount'))-EXPECTED_LABOR)<0.01) or (f.get('code') in ('SUBCONTRACTOR_MARKUP_EXCEEDED','MARKUP_EXCEEDED') and abs(float(f.get('amount'))-EXPECTED_FEE)<0.01)
            if not ok: false_high.append(f)

    extracted_mult=rules.get('labor_formula',{}).get('payroll_multiplier')
    extracted_fee=rules.get('subcontractor',{}).get('markup_cap_pct')
    labor_amt=sum(float(f.get('amount') or 0) for f in labor)
    fee_amt=sum(float(f.get('amount') or 0) for f in fee)
    expected_rules=2
    correctly_extracted=int(extracted_mult==TRUE_MULTIPLIER)+int(extracted_fee==TRUE_SUB_FEE)
    result={
        'benchmark':'100-page contract stress test',
        'pages':100,
        'true_rules':{
            'labor_multiplier':TRUE_MULTIPLIER,
            'subcontractor_fee_cap_pct':TRUE_SUB_FEE,
        },
        'decoy_financial_like_references':22,
        'engine':{
            'extracted_labor_multiplier':extracted_mult,
            'extracted_subcontractor_fee_cap_pct':extracted_fee,
            'labor_overbilling_expected':EXPECTED_LABOR,
            'labor_overbilling_actual':round(labor_amt,2),
            'subcontract_overbilling_expected':EXPECTED_FEE,
            'subcontract_overbilling_actual':round(fee_amt,2),
            'finding_codes':[f.get('code') for f in findings],
            'false_high_confidence_dollars':round(sum(float(f.get('amount') or 0) for f in false_high),2),
            'false_high_findings':false_high,
        },
        'scores':{
            'rule_recall':correctly_extracted/expected_rules,
            'correct_rules':correctly_extracted,
            'expected_rules':expected_rules,
            'wrong_or_decoy_financial_rules': max(0, len([e for e in rules.get('_evidence',[]) if e.get('rule') in ('labor_formula.payroll_multiplier','subcontractor.markup_cap_pct')])-correctly_extracted),
            'zero_false_high_confidence_dollars':len(false_high)==0,
            'exact_labor_math':abs(labor_amt-EXPECTED_LABOR)<0.01,
            'exact_fee_math':abs(fee_amt-EXPECTED_FEE)<0.01,
        }
    }
    result['all_pass']=all([
        result['scores']['rule_recall']==1.0,
        result['scores']['wrong_or_decoy_financial_rules']==0,
        result['scores']['zero_false_high_confidence_dollars'],
        result['scores']['exact_labor_math'],
        result['scores']['exact_fee_math'],
    ])
    print(json.dumps(result,indent=2))
    if not result['all_pass']:
        raise SystemExit(1)
