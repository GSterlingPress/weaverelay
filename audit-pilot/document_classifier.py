from pathlib import Path
import re
from email import policy
from email.parser import BytesParser
from audit_engine.vision_ocr import TesseractVisionAdapter

try: import pdfplumber
except Exception: pdfplumber=None
try: import openpyxl
except Exception: openpyxl=None

DOC_TYPES=["MASTER_CONTRACT","RATE_SHEET","INVOICE","WORK_ORDER","PURCHASE_ORDER","CREW_TIMESHEET","EQUIPMENT_LOG","SUBCONTRACTOR_INVOICE","COMPLETION_CERTIFICATE","MILEAGE_LOG","CHANGE_ORDER","OTHER"]
LABELS={
"MASTER_CONTRACT":"Master Contract / MSA","RATE_SHEET":"Rate Sheet / Schedule","INVOICE":"Contractor Invoice","WORK_ORDER":"Work Order","PURCHASE_ORDER":"Purchase Order","CREW_TIMESHEET":"Crew Timesheet","EQUIPMENT_LOG":"Equipment Log","SUBCONTRACTOR_INVOICE":"Subcontractor Invoice","COMPLETION_CERTIFICATE":"Completion / Acceptance Record","MILEAGE_LOG":"Mileage / Vehicle Log","CHANGE_ORDER":"Change Order","OTHER":"Other / Unclassified"}

RULES={
"MASTER_CONTRACT":[(5,r"\b(master services? agreement|services? agreement|msa\b|terms and conditions)\b","contract heading"),(2,r"\b(effective date|term of agreement|contractor shall|owner shall)\b","contract terms"),(1.5,r"\b(schedule [a-z]|exhibit [a-z]|scope of work)\b","schedule/exhibit structure")],
"RATE_SHEET":[(5,r"\b(rate sheet|schedule of rates|labor rates?|equipment rates?|unit rates?)\b","rate heading"),(2.5,r"\b(hourly rate|regular rate|overtime rate|billing unit)\b","rate columns"),(1,r"\b(journeyman|groundworker|foreman|operator|bucket truck|digger derrick)\b","labor/equipment classes")],
"INVOICE":[(5,r"\b(invoice|invoice number|invoice #|bill to|amount due|payment terms)\b","invoice heading/fields"),(2.5,r"\b(subtotal|invoice total|total due|extended amount)\b","invoice totals"),(1,r"\b(qty|quantity|rate|unit price|description)\b","line-item columns")],
"WORK_ORDER":[(5,r"\b(work order|work order #|wo[- #:]?\d+)\b","work-order identifier"),(1.5,r"\b(scope|location|authorization|approved equipment|crew assignment)\b","work authorization fields"),(1,r"\b(emergency|planned work|authorized work)\b","authorization language")],
"PURCHASE_ORDER":[(5,r"\b(purchase order|po #|po[- :]?\d+)\b","purchase-order identifier"),(1.5,r"\b(ship to|vendor|buyer|ordered by|po total)\b","purchase-order fields")],
"CREW_TIMESHEET":[(5,r"\b(timesheet|time sheet|crew timesheet|certified hours)\b","timesheet heading"),(2.5,r"\b(employee|classification|regular hrs?|overtime hrs?|ot hrs?|clock in|clock out)\b","employee/hour columns"),(1,r"\b(foreman|journeyman|groundworker|lineman|lineworker)\b","crew classes")],
"EQUIPMENT_LOG":[(5,r"\b(equipment log|daily equipment|equipment hours?|unit number)\b","equipment log heading"),(1.8,r"\b(start|stop|operator|billable hrs?|meter|odometer)\b","usage columns"),(1.2,r"\b(bucket truck|digger derrick|excavator|backhoe|crane)\b","equipment names")],
"SUBCONTRACTOR_INVOICE":[(4,r"\b(subcontractor|subcontract|third[- ]party cost|pass[- ]through)\b","subcontract language"),(2,r"\b(invoice|amount due|invoice total)\b","invoice fields"),(1,r"\b(traffic control|vegetation management|flagging|rental vendor)\b","third-party service terms")],
"COMPLETION_CERTIFICATE":[(5,r"\b(completion certificate|certificate of completion|completion record|acceptance certificate)\b","completion heading"),(2,r"\b(completed|accepted by|final acceptance|exceptions|punch list)\b","completion fields")],
"MILEAGE_LOG":[(5,r"\b(mileage log|vehicle log|miles driven|documented miles|odometer)\b","mileage heading"),(1.5,r"\b(route|origin|destination|vehicle|business miles)\b","mileage fields")],
"CHANGE_ORDER":[(5,r"\b(change order|change directive|field change|contract modification)\b","change-order heading"),(1.8,r"\b(original amount|change amount|revised amount|approved by)\b","change-order fields")]
}
DATE=re.compile(r"\b(?:0?[1-9]|1[0-2])[/-](?:0?[1-9]|[12]\d|3[01])[/-](?:20)?\d{2}\b",re.I)
MONEY=re.compile(r"\$\s?\d[\d,]*(?:\.\d{2})?")
TIME=re.compile(r"\b\d+(?:\.\d+)?\s*(?:hrs?|hours?)\b|\b(?:[01]?\d|2[0-3]):[0-5]\d\b",re.I)

def extract_text(path):
    p=Path(path); ext=p.suffix.lower()
    if ext==".pdf":
        text=""; method="embedded-text"
        if pdfplumber:
            try:
                with pdfplumber.open(p) as pdf:text="\n".join((pg.extract_text() or "") for pg in pdf.pages[:8])
            except Exception: pass
        if len(re.sub(r"\s+","",text))<80:
            try:
                o=TesseractVisionAdapter().extract_pdf(p); text="\n".join(pg.get("text","") for pg in o.get("pages",[])[:8]); method="ocr"
            except Exception: method="unreadable-pdf"
        return text,method
    if ext in {".jpg",".jpeg",".png",".webp",".tif",".tiff",".bmp"}:
        try:return TesseractVisionAdapter().extract_image(p).get("text",""),"ocr"
        except Exception:return "","unreadable-image"
    if ext in {".xlsx",".xlsm"} and openpyxl:
        try:
            wb=openpyxl.load_workbook(p,read_only=True,data_only=True); lines=[]
            for ws in wb.worksheets[:8]:
                lines.append("SHEET "+ws.title)
                for row in ws.iter_rows(max_row=500,values_only=True):
                    vals=[str(v) for v in row if v is not None]
                    if vals:lines.append(" | ".join(vals))
            return "\n".join(lines),"spreadsheet"
        except Exception:return "","unreadable-spreadsheet"
    if ext==".eml":
        try:
            msg=BytesParser(policy=policy.default).parsebytes(p.read_bytes()); parts=[str(msg.get("subject") or "")]
            body=msg.get_body(preferencelist=("plain",));
            if body:parts.append(body.get_content())
            return "\n".join(parts),"email"
        except Exception:return "","unreadable-email"
    if ext in {".txt",".md",".csv"}:return p.read_text(encoding="utf-8",errors="ignore"),"text"
    return "","unsupported"

def classify_document(path):
    text,method=extract_text(path); t=re.sub(r"[ \t]+"," ",text.lower())[:120000]
    scores={k:0.0 for k in DOC_TYPES}; reasons={k:[] for k in DOC_TYPES}
    for typ,rules in RULES.items():
        for w,pat,why in rules:
            hits=re.findall(pat,t,re.I)
            if hits:scores[typ]+=w+min(1.5,.3*(len(hits)-1));reasons[typ].append(why)
    dates=len(DATE.findall(t)); monies=len(MONEY.findall(t)); times=len(TIME.findall(t)); lines=[x for x in t.splitlines() if x.strip()]
    tableish=sum(1 for x in lines if len(re.findall(r"\s{2,}|\||\t",x))>=2)/max(1,len(lines))
    if re.search(r"\binvoice\s*(?:number|no\.?|#|:)\s*[a-z0-9-]+",t,re.I):scores["INVOICE"]+=3;reasons["INVOICE"].append("invoice number relationship")
    if re.search(r"\b(?:work order|wo)\s*(?:no\.?|#|:|-)?\s*[a-z0-9-]+",t,re.I):scores["WORK_ORDER"]+=3;reasons["WORK_ORDER"].append("work-order number relationship")
    if monies>=4 and tableish>=.12:scores["INVOICE"]+=1.5;reasons["INVOICE"].append("money-heavy table structure")
    if times>=4 and tableish>=.10:scores["CREW_TIMESHEET"]+=1.5;scores["EQUIPMENT_LOG"]+=1
    ranked=sorted(scores.items(),key=lambda x:x[1],reverse=True); typ,top=ranked[0]; second=ranked[1][1]
    if scores["SUBCONTRACTOR_INVOICE"]>=6 and scores["INVOICE"]>=4:typ="SUBCONTRACTOR_INVOICE";top=scores[typ];second=max(v for k,v in scores.items() if k!=typ)
    margin=max(0,top-second); conf=round(.52*min(1,top/9)+.48*min(1,margin/4),3)
    if top>=8 and margin>=.75:conf=max(conf,.82)
    if top<2.5:typ="OTHER";conf=min(conf,.45)
    status="CLASSIFIED" if conf>=.72 and typ!="OTHER" else "NEEDS_REVIEW"
    rs=list(dict.fromkeys(reasons.get(typ,[])))[:4] or ["no distinctive type signals"]
    rs.append("OCR used" if method=="ocr" else f"text via {method}")
    return {"type":typ,"label":LABELS[typ],"confidence":conf,"confidence_pct":round(conf*100),"status":status,"reasons":rs,"extraction":method,"signals":{"dates":dates,"money_values":monies,"time_values":times,"table_structure":round(tableish,3)},"alternatives":[{"type":k,"label":LABELS[k],"score":round(v,2)} for k,v in ranked[:3]],"content_based":True}
