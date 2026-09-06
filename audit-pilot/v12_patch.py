from collections import defaultdict
from pathlib import Path
import re
import pdfplumber


def _canon(v):
    return re.sub(r'[^a-z0-9]+','_',str(v or '').lower()).strip('_')

def _sem(v):
    c=_canon(v)
    for x in ('_regular_labor','_labor','_emergency_ot','_overtime','_ot','_standby'):
        c=c.replace(x,'')
    c=re.sub(r'_crew_[a-z0-9-]+$','',c)
    return c

def _invoice_pdf(path):
    rows=[]; ocr=[]; p=Path(path)
    with pdfplumber.open(p) as pdf:
        for pno,page in enumerate(pdf.pages,1):
            text=page.extract_text() or ''
            inv=re.search(r'(?i)\binvoice\s*(?:number|no\.?|#|:)?\s*([A-Z0-9-]+)',text)
            wo=re.search(r'(?i)\b(?:work\s*order|WO)\s*(?:number|no\.?|#|:)?\s*(WO[- ]?[0-9][A-Z0-9-]*)',text)
            dt=re.search(r'(?i)\bdate\s*:\s*([A-Za-z]+\s+\d{1,2},\s+20\d{2}|\d{1,2}/\d{1,2}/20\d{2})',text)
            active=False
            for ridx,line in enumerate(text.splitlines(),1):
                line=line.strip()
                if re.search(r'(?i)\bdescription\b.*\b(?:qty|quantity|hrs|hours|qty/hrs)\b.*\brate\b.*\b(?:extended|amount|total)\b',line):active=True;continue
                if not active:continue
                if re.search(r'(?i)^(?:invoice\s+total|subtotal|total\s+due|payment\s+terms)\b',line):break
                m=re.match(r'^(.+?)\s+(-?\d[\d,]*(?:\.\d+)?)\s+\$?([\d,]+(?:\.\d+)?)\s+\$?([\d,]+(?:\.\d+)?)$',line)
                if not m:continue
                rec={'_source':p.name,'_page':pno,'_table':'text-lines','_row':ridx,'description':m.group(1).strip(),'rate_key':m.group(1).strip(),'quantity':m.group(2),'hours':m.group(2),'rate':m.group(3),'amount':m.group(4)}
                if inv:rec['invoice_id']=inv.group(1)
                if wo:rec['work_order_id']=wo.group(1).replace(' ','-').upper()
                if dt:rec['service_date']=dt.group(1)
                rows.append(rec)
            if len(text.strip())<20:ocr.append(pno)
    return {'rows':rows,'ocr_required_pages':ocr}

def _norm_rows(orig, rows):
    out=orig(rows)
    for n in out:
        desc=str(n.get('description','')).lower(); rk=_sem(n.get('rate_key'))
        if any(x in desc for x in ('foreman','journeyman','lineworker','groundworker','lineman','labor')):
            n['type']='overtime' if any(x in desc for x in ('overtime',' emergency ot',' ot')) else 'labor'
            n['rate_key']=rk
            cm=re.search(r'\bcrew\s+([a-z0-9-]+)\b',desc,re.I)
            if cm:n['crew']=cm.group(1).upper()
            if 'quantity' in n:n['hours']=n['quantity']
        elif any(x in desc for x in ('truck','derrick','excavator','backhoe','crane','equipment')):
            n['type']='equipment';n['equipment_key']=rk
            if 'quantity' in n:n['equipment_hours']=n['quantity']
            if 'rate' in n:n['equipment_rate']=n['rate']
        elif 'mileage' in desc or 'miles' in desc:
            n['type']='mileage';n['miles']=n.get('quantity',n.get('hours'));n['mileage_rate']=n.get('rate')
        elif 'mobilization' in desc or 'demobilization' in desc:n['type']='mobilization'
        elif 'subcontract' in desc and ('markup' in desc or '%' in desc):
            n['type']='subcontractor';m=re.search(r'([0-9]+(?:\.[0-9]+)?)\s*%',desc);n['markup_pct']=float(m.group(1)) if m else None
        elif 'subcontract' in desc:n['type']='subcontractor_cost'
        elif 'disposal' in desc or 'removed' in desc:n['type']='unit';n['unit_key']=rk
    return out

def _extra_pdf(path):
    p=Path(path); recs=[]
    with pdfplumber.open(p) as pdf:
        for pg,page in enumerate(pdf.pages,1):
            text=page.extract_text() or ''
            for line in text.splitlines():
                m=re.match(r'^(\d{2}/\d{2}/\d{4})\s+(.+?)\s+-\s+(.+?)\s+([A-Za-z0-9-]+)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(WO-[0-9A-Z-]+)$',line.strip())
                if m:recs.append({'source':p.name,'page':pg,'record_type':'timesheet','service_date':m.group(1),'person':m.group(2).strip(),'classification':_sem(m.group(3)),'crew':m.group(4),'hours':float(m.group(5)),'ot_hours':float(m.group(6)),'work_order_id':m.group(7),'extraction_confidence':'HIGH'})
                m=re.match(r'^(\d{2}/\d{2}/\d{4})\s+(WO-[0-9A-Z-]+)\s+(.+?)\s+(\d{2}:\d{2})\s+(\d{2}:\d{2})\s+(\d+(?:\.\d+)?)\s+(.+)$',line.strip())
                if m:recs.append({'source':p.name,'page':pg,'record_type':'equipment_log','service_date':m.group(1),'work_order_id':m.group(2),'equipment_key':_sem(m.group(3)),'hours':float(m.group(6)),'extraction_confidence':'HIGH'})
            current=None
            for line in text.splitlines():
                line=line.strip(); wm=re.search(r'\bWO-[0-9A-Z-]+\b',line,re.I)
                if wm and ('work order' in line.lower() or line.lower().startswith('wo-') or 'completion' in line.lower() or 'mileage' in line.lower()):current=wm.group(0).upper()
                if current and re.search(r'(?i)\bnot authorized\b|\bunauthorized\b',line):
                    name=re.split(r'(?i)\bnot authorized\b|\bunauthorized\b',line,1)[0].strip(' :-')
                    recs.append({'source':p.name,'page':pg,'record_type':'work_order','work_order_id':current,'authorized':False,'equipment_key':_sem(name),'description':line,'extraction_confidence':'HIGH'})
                qm=re.match(r'(?i)^(.+?(?:removed|disposed|installed|completed))\s+(\d+(?:\.\d+)?)$',line)
                if current and qm:
                    key=_sem(qm.group(1));key='pole_disposal' if 'pole' in key and 'disposed' in key else key
                    recs.append({'source':p.name,'page':pg,'record_type':'completion','work_order_id':current,'unit_key':key,'quantity':float(qm.group(2)),'accepted':True,'description':qm.group(1),'extraction_confidence':'HIGH'})
                if current and '$' in line and re.search(r'(?i)traffic|subcontract|third[- ]party|vendor',line):
                    am=re.search(r'\$\s*([0-9][0-9,]*(?:\.\d{2})?)',line)
                    if am:recs.append({'source':p.name,'page':pg,'record_type':'contractor_backup','work_order_id':current,'description':line,'amount':float(am.group(1).replace(',','')),'supported':True,'extraction_confidence':'HIGH'})
            mm=re.search(r'(?i)mileage\s+log\s*-?\s*(WO-[0-9A-Z-]+)',text)
            if mm:
                totals=[float(x) for x in re.findall(r'(?im)^TOTAL\s+(\d+(?:\.\d+)?)\s*$',text)]
                if totals:recs.append({'source':p.name,'page':pg,'record_type':'mileage_log','work_order_id':mm.group(1).upper(),'miles':max(totals),'supported':True,'extraction_confidence':'HIGH'})
            if re.search(r'(?i)hours above are the approved|certif(?:ied|ication).*hours',text):
                for wid in set(re.findall(r'\bWO-[0-9A-Z-]+\b',text,re.I)):recs.append({'source':p.name,'page':pg,'record_type':'timesheet_scope','work_order_id':wid.upper(),'complete':True,'extraction_confidence':'HIGH'})
    return recs

def _ingest_evidence(orig, paths):
    r=orig(paths); extras=[]
    for path in paths or []:
        if Path(path).suffix.lower()=='.pdf':extras.extend(_extra_pdf(path))
    r['records'].extend(extras);return r

def _enrich(rows, records):
    stats={'matched_invoice_lines':0,'review_invoice_lines':0,'ambiguous_invoice_lines':0,'unmatched_invoice_lines':0,'high_confidence_evidence_records':0,'review_candidates':[]}
    labor=defaultdict(float); laborcrew=defaultdict(float); complete=set(); equip=defaultdict(float); units=defaultdict(float); miles=defaultdict(float);bywo=defaultdict(list)
    for r in records:
        wo=_canon(r.get('work_order_id'))
        if not wo:continue
        bywo[wo].append(r)
        if r.get('record_type')=='timesheet':
            c=_sem(r.get('classification'));crew=_canon(r.get('crew'));labor[(wo,c,'labor')]+=float(r.get('hours',0) or 0);labor[(wo,c,'overtime')]+=float(r.get('ot_hours',0) or 0)
            if crew:laborcrew[(wo,c,crew,'labor')]+=float(r.get('hours',0) or 0);laborcrew[(wo,c,crew,'overtime')]+=float(r.get('ot_hours',0) or 0)
        elif r.get('record_type')=='timesheet_scope' and r.get('complete'):complete.add(wo)
        elif r.get('record_type')=='equipment_log':equip[(wo,_sem(r.get('equipment_key')))]+=float(r.get('equipment_hours',r.get('hours',0)) or 0)
        elif r.get('record_type') in {'completion','ticket'} and isinstance(r.get('quantity'),(int,float)):units[(wo,_sem(r.get('unit_key') or r.get('description')))]+=float(r['quantity'])
        if isinstance(r.get('miles'),(int,float)):miles[wo]=max(miles[wo],float(r['miles']))
    for inv in rows:
        wo=_canon(inv.get('work_order_id'));typ=str(inv.get('type','')).lower();sem=_sem(inv.get('equipment_key') or inv.get('unit_key') or inv.get('rate_key') or inv.get('description'));candidates=bywo.get(wo,[]);matched=False
        if typ in {'labor','overtime'}:
            billed=float(inv.get('hours',0) or 0);crew=_canon(inv.get('crew'))
            if crew:
                key=(wo,sem,crew,typ);avail=laborcrew.get(key,0.0)
                if avail>0 or wo in complete:inv['evidence_labor_hours']=min(billed,avail);laborcrew[key]=max(0,avail-billed);matched=True
            else:
                key=(wo,sem,typ);avail=labor.get(key,0.0);inv['evidence_labor_hours']=min(billed,avail);labor[key]=max(0,avail-billed);matched=avail>0 or wo in complete
        elif typ=='equipment':
            key=(wo,sem);avail=equip.get(key,0.0);billed=float(inv.get('equipment_hours',0) or 0);inv['evidence_equipment_hours']=min(billed,avail);equip[key]=max(0,avail-billed);matched=avail>0 or any(r.get('record_type')=='work_order' and r.get('authorized') is False and _sem(r.get('equipment_key'))==sem for r in candidates)
        elif typ=='unit':
            key=(wo,sem);avail=units.get(key,0.0);billed=float(inv.get('quantity',0) or 0);inv['evidence_quantity']=min(billed,avail);units[key]=max(0,avail-billed);matched=avail>0
        elif typ=='mileage' and wo in miles:inv['evidence_miles']=miles[wo];matched=True
        elif typ=='subcontractor':
            vals=[float(r['amount']) for r in candidates if r.get('record_type')=='contractor_backup' and isinstance(r.get('amount'),(int,float))]
            if vals:inv['subcontractor_base_cost']=max(vals);matched=True
        auth=[r for r in candidates if r.get('record_type')=='work_order' and r.get('authorized') is False and (_sem(r.get('equipment_key'))==sem or not r.get('equipment_key'))]
        if auth:inv['work_authorized']=False;matched=True
        if matched:
            inv['_support_evidence']=[{'source':r.get('source'),'page':r.get('page'),'record_type':r.get('record_type'),'values':{k:r[k] for k in ('work_order_id','classification','crew','equipment_key','unit_key','quantity','hours','ot_hours','miles','amount','authorized') if k in r}} for r in candidates[:20]];inv['_evidence_match']={'confidence':'HIGH','records':len(candidates),'top_score':1.0,'features':['work_order','semantic_family']};stats['matched_invoice_lines']+=1;stats['high_confidence_evidence_records']+=len(candidates)
        else:inv['_evidence_match']={'confidence':'NONE'};stats['unmatched_invoice_lines']+=1
    return stats

def _contract(orig,pages):
    r=orig(pages)
    for p in pages:
        for line in (p.get('text') or '').splitlines():
            ln=line.strip();m=re.match(r'(?i)^([A-Za-z][A-Za-z0-9 /_-]{1,50}?)\s+\$([0-9][0-9,]*(?:\.\d+)?)\s*/\s*(?:hr|hour)\b',ln)
            if m and any(x in _sem(m.group(1)) for x in ('truck','derrick','excavator','backhoe','crane','equipment')):r['equipment_rates'][_sem(m.group(1))]=float(m.group(2).replace(',',''))
            m=re.match(r'(?i)^([A-Za-z][A-Za-z0-9 /_-]{1,50}?)\s+\$([0-9][0-9,]*(?:\.\d+)?)\s+per\s+(?:pole|unit|each)',ln)
            if m:r['unit_rates'][_sem(m.group(1))]=float(m.group(2).replace(',',''))
            m=re.match(r'(?i)^mileage\s+\$([0-9]+(?:\.\d+)?)\s+per\s+.*mile',ln)
            if m:r['mileage']['rate_cap']=float(m.group(1))
            m=re.match(r'(?i)^mobilization\s+\$([0-9][0-9,]*(?:\.\d+)?)',ln)
            if m:r['mobilization']['cap']=float(m.group(1).replace(',',''))
            m=re.match(r'(?i)^subcontractors?\s+.*?(?:maximum|max)\s+([0-9]+(?:\.\d+)?)\s*%.*markup',ln)
            if m:r['subcontractor']['markup_cap_pct']=float(m.group(1))
            if re.search(r'(?i)requires?\s+work[- ]order\s+authorization|requires?\s+.*change order',ln):r['work_order']['requires_authorization']=True
    return r

def _audit(orig,rules,invoices,field=None):
    saved=[]
    for inv in invoices:
        if str(inv.get('type','')).lower()=='overtime' and inv.get('rate_key') in rules.get('rates',{}):saved.append((inv,inv['rate_key']));inv['rate_key']='__overtime__'+inv['rate_key']
    fs=orig(rules,invoices,field)
    for inv,key in saved:inv['rate_key']=key
    def add(code,amt,msg,inv):fs.append({'code':code,'status':'OVERBILLED' if code!='UNAUTHORIZED_WORK' else 'UNSUPPORTED','confidence':'HIGH','amount':round(max(0,float(amt)),2),'message':msg,'evidence':{'invoice':inv.get('_evidence',{}),'field':(inv.get('_support_evidence') or [None])[0]}})
    for inv in invoices:
        if isinstance(inv.get('miles'),(int,float)) and isinstance(inv.get('evidence_miles'),(int,float)) and inv['miles']>inv['evidence_miles']:add('MILEAGE_UNSUPPORTED',(inv['miles']-inv['evidence_miles'])*float(inv.get('mileage_rate',inv.get('rate',0)) or 0),f"{inv['miles']:g} miles billed; supporting mileage records document {inv['evidence_miles']:g} miles.",inv)
        if inv.get('work_authorized') is False:add('UNAUTHORIZED_WORK',float(inv.get('amount',0) or 0),'Charge is tied to work marked as lacking required work-order/PO authorization.',inv)
    seen={}
    for inv in invoices:
        sig=(inv.get('invoice_id'),inv.get('work_order_id'),str(inv.get('description','')).strip().lower(),inv.get('quantity',inv.get('hours')),inv.get('rate'),inv.get('amount'))
        if sig[0] and sig[2] and sig[5] not in (None,''):
            if sig in seen:add('DUPLICATE_CHARGE',float(inv.get('amount',0) or 0),'Possible duplicate charge.',inv)
            else:seen[sig]=1
    unique=[];seenf=set()
    for f in fs:
        k=(f.get('code'),(f.get('evidence') or {}).get('invoice',{}).get('row'),f.get('amount'))
        if k in seenf:continue
        seenf.add(k);unique.append(f)
    return unique

def apply_v12():
    import audit_engine.relationship as rel
    import audit_engine.invoice_ingest as ii
    import audit_engine.extract as ex
    import audit_engine.evidence as ev
    import audit_engine.core as core
    orig_inv=ii.ingest_invoice_document;orig_norm=ex.normalize_invoice_rows;orig_evi=ev.ingest_evidence;orig_contract=ex.extract_contract_rules;orig_audit=core.audit
    def inv(path):return _invoice_pdf(path) if Path(path).suffix.lower()=='.pdf' else orig_inv(path)
    def norm(rows):return _norm_rows(orig_norm,rows)
    def ie(paths):return _ingest_evidence(orig_evi,paths)
    def cr(pages):return _contract(orig_contract,pages)
    def au(rules,invoices,field=None):return _audit(orig_audit,rules,invoices,field)
    ii.ingest_invoice_document=inv;ex.normalize_invoice_rows=norm;ev.ingest_evidence=ie;ev.enrich_invoice_rows=_enrich;core.audit=au
    rel.ingest_invoice_document=inv;rel.normalize_invoice_rows=norm;rel.ingest_evidence=ie;rel.enrich_invoice_rows=_enrich;rel.extract_contract_rules=cr;rel.audit=au
