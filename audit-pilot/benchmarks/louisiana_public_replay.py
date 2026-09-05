from pathlib import Path
import json, os, sys, tempfile

RUNTIME=Path(os.environ.get('AUDIT_RUNTIME_DIR','/tmp/audit-runtime'))
sys.path.insert(0,str(RUNTIME))
from audit_engine.pipeline import run_audit

with tempfile.TemporaryDirectory() as td:
    d=Path(td)
    contract=d/'louisiana_llt_contract.txt'
    contract.write_text(
        'Louisiana Land Trust Home Demolition Program\n'
        'Contractor invoices and reimbursable costs require supporting documentation.\n',
        encoding='utf-8'
    )
    invoice=d/'llt_initial_exceptions.csv'
    invoice.write_text(
        'invoice_id,amount,vendor,service_date,description,type,support_required,supported\n'
        'LLT-LABOR-DOC,4267.00,Home Demolition Contractor,2013-01-15,Labor cost pending supporting documentation,labor,yes,no\n'
        'LLT-LAB-DOC,1320.00,Home Demolition Contractor,2013-01-16,Lab cost pending supporting documentation,lab,yes,no\n',
        encoding='utf-8'
    )
    initial=run_audit(contract,invoice)
    evidence=d/'llt_additional_documentation.csv'
    evidence.write_text(
        'invoice_id,supported,description\n'
        'LLT-LABOR-DOC,yes,Additional documentation supplied and accepted\n'
        'LLT-LAB-DOC,yes,Additional documentation supplied and accepted\n',
        encoding='utf-8'
    )
    resolved=run_audit(contract,invoice,evidence_paths=[evidence])
    def high_over(r):
        return round(sum(float(f.get('amount',0) or 0) for f in r.get('findings',[]) if f.get('confidence')=='HIGH' and f.get('status')=='OVERBILLED'),2)
    result={
      'benchmark':'Louisiana Legislative Auditor LLT Home Demolition structural evidence-resolution replay',
      'public_ground_truth':{
        'initial_total_exceptions':10174.0,
        'labor_insufficient_documentation':4267.0,
        'lab_cost_insufficient_documentation':1320.0,
        'documentation_exception_subset_tested':5587.0,
        'final_remaining_exceptions_after_resolution':0.0
      },
      'initial_stage':{
        'totals':initial.get('totals'),
        'finding_codes':[f.get('code') for f in initial.get('findings',[])],
        'findings':initial.get('findings',[]),
        'false_high_confidence_overbilling_dollars':high_over(initial)
      },
      'resolved_stage':{
        'totals':resolved.get('totals'),
        'finding_codes':[f.get('code') for f in resolved.get('findings',[])],
        'findings':resolved.get('findings',[]),
        'evidence_matching':resolved.get('evidence',{}).get('matching'),
        'false_high_confidence_overbilling_dollars':high_over(resolved)
      },
      'capability_questions':{
        'initially_keeps_documentation_dollars_out_of_overbilling': high_over(initial)==0.0,
        'initially_surfaces_documentation_gap_as_unsupported': abs(float(initial.get('totals',{}).get('unsupported',0))-5587.0)<0.01,
        'matching_support_clears_documentation_exception': abs(float(resolved.get('totals',{}).get('unsupported',0)))<0.01,
        'resolved_stage_has_zero_high_confidence_overbilling': high_over(resolved)==0.0
      }
    }
    print(json.dumps(result,indent=2))
