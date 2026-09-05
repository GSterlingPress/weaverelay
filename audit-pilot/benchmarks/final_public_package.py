from pathlib import Path
import json, os, sys, tempfile, urllib.request
from pypdf import PdfReader, PdfWriter

RUNTIME=Path(os.environ.get('AUDIT_RUNTIME_DIR','/tmp/audit-runtime'))
sys.path.insert(0,str(RUNTIME))
from audit_engine.pipeline import run_audit

# FINAL PUBLIC-PACKAGE GATE. Engine is not modified here.
# Every PDF below is an official Broward County public record.
ARTICLE5='https://cragenda.broward.org/docs/2010/CCCM/20101109_206/6561_Exhibit%204%20-%20Article%205.pdf'
AMEND1='https://cragenda.broward.org/docs/2010/CCCM/20101109_206/6561_EXHIBIT%202%201152%20MLA%20AMENDMENT%201.pdf'
AUDIT='https://cragenda.broward.org/docs/2016/CCCM/20160524_497/22202_Exh1_MLA052416.pdf'

# These 16 billed/allowed rate pairs are transcribed from the County Auditor's
# published Appendix. They are public invoice/payroll-derived evidence, NOT
# synthetic mutations and NOT hidden engine constants. The raw employee hours
# and payroll registers are not published, so this gate deliberately scores the
# published one-hour structural replay and separately records that limitation.
ROWS=[
(172.21,97.57),(172.21,136.64),(172.21,122.22),(113.67,89.76),
(106.92,79.11),(106.92,80.78),(91.17,65.11),(68.65,58.40),
(177.38,128.34),(177.38,136.65),(155.33,89.76),(117.08,73.06),
(110.13,79.12),(110.13,88.96),(110.13,80.78),(93.91,65.11)]
PUBLISHED_MULTIPLIER=2.992
EXPECTED_STRUCTURAL=round(sum(b-a for b,a in ROWS),2)
GOVERNMENT_PROVEN_OVERBILLING=35787.00
GOVERNMENT_UNSUPPORTED=15798.00

def download(url,path):
    req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 Audit validation'})
    with urllib.request.urlopen(req,timeout=45) as r:
        path.write_bytes(r.read())

def merge(paths,out):
    w=PdfWriter()
    for p in paths:
        for page in PdfReader(str(p)).pages: w.add_page(page)
    with out.open('wb') as f: w.write(f)

with tempfile.TemporaryDirectory() as td:
    d=Path(td)
    article=d/'original_article5.pdf'; amend=d/'executed_amendment1.pdf'; audit=d/'county_auditor_report.pdf'
    download(ARTICLE5,article); download(AMEND1,amend); download(AUDIT,audit)
    contract=d/'public_contract_package.pdf'; merge([article,amend],contract)

    inv=d/'published_invoice_rows.csv'
    ev=d/'published_payroll_evidence.csv'
    inv_lines=['invoice_id,id,type,amount,vendor,service_date,description,hours,rate,classification']
    ev_lines=['invoice_id,service_date,classification,description,hours,rate,supported']
    for i,(billed,allowed) in enumerate(ROWS,1):
        iid=f'PUB-{i:02d}'; cls=f'Published row {i:02d}'
        inv_lines.append(f'{iid},L{i:02d},labor,{billed:.2f},Miller Legg public audit,2012-01-01,{cls},1,{billed:.2f},{cls}')
        # Payroll rate is arithmetically reconstructed from the County Auditor's
        # published allowed billing rate / its published 2.992 multiplier because
        # raw payroll registers are not public. This is explicitly NOT raw evidence.
        payroll=allowed/PUBLISHED_MULTIPLIER
        ev_lines.append(f'{iid},2012-01-01,{cls},County-auditor-derived payroll base,1,{payroll:.8f},yes')
    inv.write_text('\n'.join(inv_lines)+'\n',encoding='utf-8')
    ev.write_text('\n'.join(ev_lines)+'\n',encoding='utf-8')

    r=run_audit(contract,inv,evidence_paths=[ev,audit])
    rules=r.get('rules') or {}; findings=r.get('findings') or []
    lm=(rules.get('labor_formula') or {}).get('payroll_multiplier')
    rate_findings=[f for f in findings if f.get('code')=='RATE_MISMATCH']
    labor=round(sum(float(f.get('amount') or 0) for f in rate_findings),2)
    other_high=round(sum(float(f.get('amount') or 0) for f in findings if f.get('confidence')=='HIGH' and f.get('code')!='RATE_MISMATCH'),2)
    wrong_rule=round(max(0.0,labor-EXPECTED_STRUCTURAL),2)
    false_high=round(other_high+wrong_rule,2)
    result={
      'benchmark':'FINAL real Broward public-document package',
      'source_documents':{
        'original_contract_article_5':ARTICLE5,
        'executed_amendment_1':AMEND1,
        'county_auditor_report_with_invoice_derived_appendix':AUDIT,
      },
      'source_integrity':{
        'contract_and_amendment_are_actual_public_pdfs':True,
        'auditor_report_is_actual_public_pdf':True,
        'raw_pay_applications_published':False,
        'raw_payroll_registers_published':False,
        'invoice_rate_rows_are_official_auditor_published':True,
        'payroll_base_rates_reconstructed_from_published_allowed_rate_and_multiplier':True,
        'exact_35787_replay_possible_from_public_records':False,
      },
      'ground_truth':{
        'published_multiplier':PUBLISHED_MULTIPLIER,
        'published_one_hour_structural_overbilling':EXPECTED_STRUCTURAL,
        'government_proven_overbilling':GOVERNMENT_PROVEN_OVERBILLING,
        'government_unsupported_labor':GOVERNMENT_UNSUPPORTED,
      },
      'engine':{
        'extracted_labor_multiplier':lm,
        'rate_mismatch_count':len(rate_findings),
        'structural_overbilling':labor,
        'false_high_confidence_dollars':false_high,
        'finding_codes':[f.get('code') for f in findings],
        'unknown_count':len(rules.get('_unknown') or []),
        'ocr_required_pages':rules.get('_ocr_required_pages') or [],
      },
      'scores':{
        'governing_multiplier_correct': abs(float(lm or 0)-PUBLISHED_MULTIPLIER)<0.001,
        'all_16_published_rows_detected':len(rate_findings)==16,
        'published_structural_math_exact':abs(labor-EXPECTED_STRUCTURAL)<0.01,
        'zero_false_high_confidence_dollars':false_high==0,
      }
    }
    result['all_pass']=all(result['scores'].values())
    print(json.dumps(result,indent=2))
    if not result['all_pass']: raise SystemExit(1)
