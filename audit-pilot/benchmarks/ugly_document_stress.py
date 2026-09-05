from pathlib import Path
import io, json, os, sys, tempfile

RUNTIME=Path(os.environ.get('AUDIT_RUNTIME_DIR','/tmp/audit-runtime'))
sys.path.insert(0,str(RUNTIME))
from audit_engine.pipeline import run_audit
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib.utils import ImageReader
from PIL import Image, ImageDraw, ImageFont, ImageFilter

# Ground truth exists ONLY in this benchmark. The engine is not modified.
PAGES=108
ORIGINAL_LABOR_MULT=2.950
AMEND1_LABOR_MULT=2.710
CONTROLLING_LABOR_MULT=2.483
ORIGINAL_SUB_FEE=9.00
CONTROLLING_SUB_FEE=6.75
DRAFT_SUB_FEE=4.50
PAYROLL_RATE=42.35
HOURS=18.25
BILLED_RATE=112.40
SUB_BASE=147825.60
BILLED_SUB_FEE=8.90
EXPECTED_LABOR=round((BILLED_RATE-(PAYROLL_RATE*CONTROLLING_LABOR_MULT))*HOURS,2)
EXPECTED_FEE=round(SUB_BASE*((BILLED_SUB_FEE-CONTROLLING_SUB_FEE)/100),2)


def text_page(c, page_no, lines, table=None):
    c.setFont('Helvetica', 8)
    c.drawString(40, 760, f'PAGE {page_no} OF {PAGES}')
    y=735
    for line in lines:
        c.drawString(40,y,line[:115]); y-=16
    if table:
        y-=8
        widths=[220,120,120]
        x=40
        for row in table:
            xx=x
            for idx,cell in enumerate(row):
                c.rect(xx,y-14,widths[idx],18)
                c.drawString(xx+3,y-9,str(cell)[:30])
                xx+=widths[idx]
            y-=18
    c.showPage()


def scanned_page(c, page_no, lines):
    # Image-only page: intentionally blurred/compressed slightly to force OCR/document vision path.
    img=Image.new('L',(1700,2200),255)
    d=ImageDraw.Draw(img)
    try:
        font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',31)
        small=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',25)
    except Exception:
        font=ImageFont.load_default(); small=font
    d.text((90,90),f'PAGE {page_no} OF {PAGES} — SCANNED EXECUTED DOCUMENT',font=font,fill=0)
    y=180
    for line in lines:
        d.text((90,y),line,font=small,fill=0); y+=52
    img=img.filter(ImageFilter.GaussianBlur(radius=0.45))
    buf=io.BytesIO(); img.save(buf,format='JPEG',quality=72); buf.seek(0)
    c.drawImage(ImageReader(buf),0,0,width=letter[0],height=letter[1])
    c.showPage()

with tempfile.TemporaryDirectory() as td:
    d=Path(td)
    contract=d/'ugly_master_contract.pdf'
    c=canvas.Canvas(str(contract),pagesize=letter)
    for p in range(1,PAGES+1):
        base=[
            'Master Utility Services Agreement and incorporated exhibits.',
            'Administrative language concerning safety, scheduling, insurance, records, notices, and reporting.',
        ]
        if p in {4,13,24,38,55,66,80,95,106}:
            base.append(f'KPI performance multiplier {1.200+p/1000:.3f} is for scorecard weighting only and is not a billing factor.')
        if p in {6,20,32,48,61,85,99}:
            base.append(f'Corporate planning assumes a management reserve of {3+(p%5)} percent; this is not chargeable to the customer.')
        if p==8:
            base += [
                'ORIGINAL COMPENSATION EXHIBIT — later amendments control where inconsistent.',
                f'For hourly labor, the overall multiplier of {ORIGINAL_LABOR_MULT} is applied to the actual hourly payroll rate.',
            ]
        if p==16:
            base += [
                'ORIGINAL SUBCONTRACTOR TERMS — subject to later amendment.',
                f'The subcontractor fee shall not exceed {ORIGINAL_SUB_FEE} percent of documented subcontractor cost.',
            ]
        if p==44:
            scanned_page(c,p,[
                'EXECUTED AMENDMENT NO. 1',
                'This amendment supersedes inconsistent labor compensation terms in the original agreement.',
                f'Effective July 1, 2025, the overall multiplier of {AMEND1_LABOR_MULT} is applied to the actual hourly payroll rate.',
                'All other terms remain unchanged unless later amended.',
            ]); continue
        if p==73:
            text_page(c,p,[
                'EXECUTED AMENDMENT NO. 2 — SUBCONTRACTOR COMPENSATION',
                'This amendment expressly supersedes the original subcontractor fee provision.',
                'The table below states the controlling reimbursable subcontractor fee.'
            ],table=[['Cost category','Allowed fee','Status'],['Subcontractor cost',f'{CONTROLLING_SUB_FEE} percent','CONTROLLING']]); continue
        if p==91:
            scanned_page(c,p,[
                'EXECUTED AMENDMENT NO. 3 — LABOR COMPENSATION',
                'This amendment supersedes all earlier labor multipliers, including Amendment No. 1.',
                f'For hourly labor billing, the overall multiplier of {CONTROLLING_LABOR_MULT} is applied to the actual hourly payroll rate.',
                'This is the controlling labor multiplier as of the invoice period.',
            ]); continue
        if p==102:
            base += [
                'DRAFT — NOT EXECUTED — FOR DISCUSSION ONLY.',
                f'Proposed subcontractor fee: {DRAFT_SUB_FEE} percent. This proposal does not amend the executed agreement.',
            ]
        text_page(c,p,base)
    c.save()

    invoice=d/'invoice.csv'
    invoice.write_text(
        'invoice_id,id,type,subcontractor_base_cost,markup_pct,amount,vendor,service_date,description,hours,rate,classification\n'
        f'UGLY-LAB,L1,labor,,,2051.30,Ugly Docs Vendor,2026-02-15,Senior field engineer,{HOURS},{BILLED_RATE},Senior Engineer\n'
        f'UGLY-SUB,S1,subcontractor,{SUB_BASE},{BILLED_SUB_FEE},{SUB_BASE*(1+BILLED_SUB_FEE/100):.2f},Ugly Docs Vendor,2026-02-15,Subcontractor services,,,\n',encoding='utf-8')
    evidence=d/'payroll_evidence.csv'
    evidence.write_text(
        'invoice_id,service_date,classification,description,hours,rate,supported\n'
        f'UGLY-LAB,2026-02-15,Senior Engineer,Payroll register actual hourly rate,{HOURS},{PAYROLL_RATE},yes\n',encoding='utf-8')

    r=run_audit(contract,invoice,evidence_paths=[evidence])
    rules=r.get('rules') or {}
    findings=r.get('findings') or []
    lm=(rules.get('labor_formula') or {}).get('payroll_multiplier')
    sf=(rules.get('subcontractor') or {}).get('markup_cap_pct')
    labor=sum(float(f.get('amount') or 0) for f in findings if f.get('code')=='RATE_MISMATCH')
    fee=sum(float(f.get('amount') or 0) for f in findings if f.get('code') in ('SUBCONTRACTOR_MARKUP_EXCEEDED','MARKUP_EXCEEDED'))
    unrelated_false_high=[f for f in findings if f.get('confidence')=='HIGH' and float(f.get('amount') or 0)>0 and f.get('code') not in {'RATE_MISMATCH','SUBCONTRACTOR_MARKUP_EXCEEDED','MARKUP_EXCEEDED'}]
    expected_total=round(EXPECTED_LABOR+EXPECTED_FEE,2)
    actual_total=round(labor+fee,2)
    # A legitimate finding TYPE calculated from the wrong governing contract term is still
    # economically false. Count only the excess confidently asserted dollars as false-high;
    # missed dollars remain recall failures, not false positives.
    wrong_rule_false_high=round(max(0.0,labor-EXPECTED_LABOR)+max(0.0,fee-EXPECTED_FEE),2)
    unrelated_false_high_dollars=round(sum(float(f.get('amount') or 0) for f in unrelated_false_high),2)
    false_high_dollars=round(wrong_rule_false_high+unrelated_false_high_dollars,2)
    result={
        'benchmark':'Real-world ugly 108-page PDF contract stress',
        'pages':PAGES,
        'document_features':['actual PDF','image-only scanned amendments','table-based fee term','superseded original terms','multiple executed amendments','unexecuted draft conflicting term','financial decoys','invoice + payroll evidence'],
        'ground_truth':{
            'controlling_labor_multiplier':CONTROLLING_LABOR_MULT,
            'controlling_subcontractor_fee_pct':CONTROLLING_SUB_FEE,
            'expected_labor_overbilling':EXPECTED_LABOR,
            'expected_subcontract_overbilling':EXPECTED_FEE,
            'expected_total_overbilling':expected_total,
        },
        'engine':{
            'extracted_labor_multiplier':lm,
            'extracted_subcontractor_fee_pct':sf,
            'labor_overbilling':round(labor,2),
            'subcontract_overbilling':round(fee,2),
            'total_overbilling':actual_total,
            'finding_codes':[f.get('code') for f in findings],
            'false_high_confidence_dollars':false_high_dollars,
            'wrong_rule_false_high_confidence_dollars':wrong_rule_false_high,
            'unrelated_false_high_confidence_dollars':unrelated_false_high_dollars,
            'unknown_count':len(rules.get('_unknown') or []),
            'ocr_required_pages':rules.get('_ocr_required_pages') or [],
            'contract_precedence':rules.get('_contract_precedence') or {},
        },
        'scores':{
            'controlling_labor_term_correct': lm==CONTROLLING_LABOR_MULT,
            'controlling_subcontract_term_correct': sf==CONTROLLING_SUB_FEE,
            'draft_term_ignored': sf!=DRAFT_SUB_FEE,
            'superseded_labor_terms_ignored': lm not in (ORIGINAL_LABOR_MULT,AMEND1_LABOR_MULT),
            'exact_labor_math':abs(labor-EXPECTED_LABOR)<0.01,
            'exact_fee_math':abs(fee-EXPECTED_FEE)<0.01,
            'exact_total_math':abs(actual_total-expected_total)<0.01,
            'zero_false_high_confidence_dollars':false_high_dollars==0,
        }
    }
    result['all_pass']=all(result['scores'].values())
    print(json.dumps(result,indent=2))
    if not result['all_pass']:
        raise SystemExit(1)
