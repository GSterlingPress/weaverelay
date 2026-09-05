from pathlib import Path
import json, os, sys, tempfile

RUNTIME=Path(os.environ.get('AUDIT_RUNTIME_DIR','/tmp/audit-runtime'))
sys.path.insert(0,str(RUNTIME))
from audit_engine.pipeline import run_audit

with tempfile.TemporaryDirectory() as td:
    d=Path(td)
    contract=d/'epa_task_order_12_contract.txt'
    contract.write_text(
        'EPA Contract No. EP-W-11-019, Task Order 12\n'
        'Per contract section B.1(f), the subcontractor fee should only be 6 percent.\n',
        encoding='utf-8'
    )
    invoice=d/'epa_task_order_12_invoice.csv'
    invoice.write_text(
        'invoice_id,type,subcontractor_base_cost,markup_pct,amount,vendor,service_date,description\n'
        'EPA-TEST-1,subcontractor,100000.00,8.00,108000.00,Systems Research and Applications Corporation,2018-01-01,Subcontractor cost plus fixed fee\n',
        encoding='utf-8'
    )
    r=run_audit(contract,invoice)
    findings=r.get('findings',[])
    result={
      'benchmark':'EPA OIG 19-P-0157 Task Order 12 structural public-record replay',
      'public_ground_truth':{
        'contract_fee_pct':6.0,
        'billed_fee_pct':8.0,
        'government_final_net_overbilling':5158.29,
        'raw_subcontract_cost_bases_publicly_available_in_report':False,
        'exact_aggregate_replay_possible_from_report_alone':False
      },
      'neutral_capability_fixture':{
        'subcontractor_base_cost':100000.0,
        'billed_markup_pct':8.0,
        'allowed_markup_pct':6.0,
        'expected_overbilling_if_clause_understood':2000.0
      },
      'engine_output':{
        'totals':r.get('totals'),
        'invoice_rows_extracted':r.get('invoice_rows_extracted'),
        'subcontractor_rules':r.get('rules',{}).get('subcontractor',{}),
        'finding_codes':[f.get('code') for f in findings],
        'findings':findings
      },
      'capability_questions':{
        'understands_published_subcontractor_fee_clause': bool(r.get('rules',{}).get('subcontractor',{}).get('markup_cap_pct')==6.0),
        'detects_8_vs_6_fee_on_neutral_base': any(f.get('code')=='SUBCONTRACTOR_MARKUP_EXCEEDED' and abs(float(f.get('amount',0))-2000.0)<0.01 for f in findings),
        'creates_false_high_confidence_dollars': any(f.get('confidence')=='HIGH' and f.get('code')!='SUBCONTRACTOR_MARKUP_EXCEEDED' and float(f.get('amount',0))>0 for f in findings)
      }
    }
    print(json.dumps(result,indent=2))
