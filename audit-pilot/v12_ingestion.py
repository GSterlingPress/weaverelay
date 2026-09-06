import html,json,shutil
from fastapi import UploadFile,File,Form,Request
from fastapi.responses import HTMLResponse,RedirectResponse
from document_classifier import classify_document,DOC_TYPES,LABELS
from secure_jobs import new_job_dir,save_upload_limited,delete_raw_uploads,BASE
from audit_engine.relationship import audit_relationship

MIXED={'.pdf','.xlsx','.xlsm','.csv','.txt','.md','.eml','.msg','.jpg','.jpeg','.png','.webp','.tif','.tiff','.bmp','.heic'}
CONTRACT={'MASTER_CONTRACT','RATE_SHEET'};INVOICE={'INVOICE'};EVIDENCE=set(DOC_TYPES)-CONTRACT-INVOICE-{'OTHER'}
CSS="""body{font-family:Inter,ui-sans-serif,system-ui;background:#071018;color:#e8eef3;margin:0}*{box-sizing:border-box}.w{max-width:1120px;margin:auto;padding:32px 18px}.h,.c{border-radius:18px;padding:24px}.h{background:linear-gradient(135deg,#0d1720,#101d28);border:1px solid #243442}.c{background:#0d1720;border:1px solid #243442;margin-top:18px}.top{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:14px}.nav a{color:#a9bbc8;text-decoration:none;margin-left:14px}.doc{display:grid;grid-template-columns:1.45fr .9fr .48fr;gap:14px;padding:15px;border:1px solid #263847;border-radius:13px;margin:10px 0;background:#0a141d}.b{display:inline-block;padding:5px 9px;border-radius:999px;font-size:12px;font-weight:800}.ok{background:#103b2e;color:#8ce1bd}.rv{background:#4a3410;color:#ffd889}.btn{display:inline-block;background:#197a5d;color:white;border:0;border-radius:10px;padding:12px 16px;font-weight:800;text-decoration:none;cursor:pointer}.secondary{background:#182631;color:#dbe5eb;border:1px solid #314654}.muted{color:#91a4b2;font-size:13px}.conf{font-size:25px;font-weight:900}.conf small{display:block;font-size:10px;color:#91a4b2;letter-spacing:.12em;text-transform:uppercase;margin-bottom:3px}select,input[type=file]{width:100%;padding:10px;background:#0a141d;color:#eef5f7;border:1px solid #38505f;border-radius:8px}.actions{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:18px}.reviewbox{display:block;margin-top:9px;padding:9px 10px;border:1px solid #6a5220;border-radius:9px;background:#221a09;color:#f5dda4}.error{background:#351616;border:1px solid #663131;padding:12px;border-radius:10px;color:#ffb7b7}.ready{border-top:1px solid #263847;margin-top:22px;padding-top:18px}@media(max-width:760px){.doc{grid-template-columns:1fr}.actions{align-items:stretch}.actions .btn,.actions form,.actions form .btn{width:100%;text-align:center}.nav{font-size:13px}}"""

def page(title,body):return HTMLResponse(f"<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'><title>{html.escape(title)}</title><style>{CSS}</style></head><body><div class='w'>{body}</div></body></html>")
def safe(j):return bool(j) and all(x not in j for x in ('/','\\','..'))
def sf(j):return BASE/j/'classification-state.json'
def load(j):return json.loads(sf(j).read_text())
def save(j,s):sf(j).write_text(json.dumps(s,indent=2))
def ready(docs):return all(d['classification']['status']=='CLASSIFIED' for d in docs) and any(d['classification']['type'] in CONTRACT for d in docs) and any(d['classification']['type'] in INVOICE for d in docs)

def render(j,s,error=None):
    docs=s['documents'];pending=sum(d['classification']['status']=='NEEDS_REVIEW' for d in docs)
    body="<div class='top'><b>UTILITY CONTRACTOR AUDIT · V12</b><div class='nav'><a href='/v12'>← Back to upload</a><a href='/v12'>Home</a></div></div>"
    body+=f"<div class='h'><h1>Document pile classified.</h1><p>Content-based classification with explicit review gates for low-confidence documents.</p></div><div class='c'><p><b>{len(docs)}</b> documents · <b>{pending}</b> need review</p>"
    if error:body+=f"<div class='error'>{html.escape(error)}</div>"
    body+=f"<form method='post' action='/v12/{html.escape(j)}/review'>"
    for i,d in enumerate(docs):
        c=d['classification'];cls='ok' if c['status']=='CLASSIFIED' else 'rv';rs='; '.join(c.get('reasons',[]));opts=''.join(f"<option value='{t}' {'selected' if t==c['type'] else ''}>{html.escape(LABELS[t])}</option>" for t in DOC_TYPES)
        body+=f"<div class='doc'><div><b>{html.escape(d['original_name'])}</b><div class='muted'>{html.escape(rs)}</div></div><div><span class='b {cls}'>{c['status'].replace('_',' ')}</span><div style='margin-top:8px'><select name='type_{i}'>{opts}</select></div>"
        if c['status']=='NEEDS_REVIEW':body+=f"<label class='reviewbox'><input type='checkbox' name='confirm_{i}' value='yes'> I confirm this document type</label>"
        body+=f"</div><div class='conf'><small>AI confidence</small>{c['confidence_pct']}%<div class='muted'>in selected type</div></div></div>"
    body+="<div class='actions'><a class='btn secondary' href='/v12'>← Back / start over</a><button class='btn' type='submit'>Save types & continue →</button></div></form>"
    if ready(docs):
        body+=f"<div class='ready'><h2>Ready for audit</h2><p class='muted'>Minimum routing requirements are satisfied.</p><form method='post' action='/v12/{html.escape(j)}/audit'><label><input type='checkbox' name='authorization' value='yes' required> I am authorized to analyze these documents.</label><div class='actions'><button class='btn'>Next: run audit →</button></div></form></div>"
    else:body+="<p class='muted'>Low-confidence items must be explicitly confirmed. The audit also requires at least one contract/rate document and one prime contractor invoice.</p>"
    return page('V12 Smart Ingestion',body+'</div>')

def register_v12(app):
    @app.middleware('http')
    async def root_v12(request:Request,call_next):
        if request.url.path=='/':return RedirectResponse('/v12',307)
        return await call_next(request)
    @app.get('/v12',response_class=HTMLResponse)
    def home(request:Request):
        return page('Utility Contractor Audit V12',"<div class='top'><b>UTILITY CONTRACTOR AUDIT · V12</b><div class='nav'><a href='/v12'>Home</a></div></div><div class='h'><h1>Drop the document pile. We sort it.</h1><p>Contracts, invoices, work orders, timesheets, equipment logs, mileage, completion records, scans and spreadsheets.</p></div><div class='c'><form method='post' action='/v12' enctype='multipart/form-data'><input type='file' name='documents' multiple required><div class='actions'><button class='btn'>Classify document pile →</button></div></form></div>")
    @app.post('/v12',response_class=HTMLResponse)
    async def ingest(request:Request,documents:list[UploadFile]=File(...)):
        if not documents or len(documents)>100:return page('V12',"<div class='c'>Upload 1–100 documents.<div class='actions'><a class='btn secondary' href='/v12'>← Back</a></div></div>")
        j,w=new_job_dir();s={'version':'v12','documents':[]}
        try:
            for f in documents:
                if not f.filename:continue
                p,n=await save_upload_limited(f,w,MIXED);c=classify_document(p)
                if c.get('confidence',0)<0.72 or c.get('type')=='OTHER':c['status']='NEEDS_REVIEW'
                s['documents'].append({'original_name':n,'saved_path':str(p),'classification':c})
            if not s['documents']:raise ValueError('No readable documents uploaded.')
            save(j,s);return render(j,s)
        except Exception as e:
            shutil.rmtree(w,ignore_errors=True);return page('V12',f"<div class='c'>{html.escape(str(e))}<div class='actions'><a class='btn secondary' href='/v12'>← Back</a></div></div>")
    @app.post('/v12/{job_id}/review',response_class=HTMLResponse)
    async def review(request:Request,job_id:str):
        if not safe(job_id) or not sf(job_id).exists():return HTMLResponse('Not found',404)
        s=load(job_id);form=await request.form();unresolved=[]
        for i,d in enumerate(s['documents']):
            c=d['classification'];chosen=str(form.get(f'type_{i}',c['type']))
            if chosen not in DOC_TYPES:chosen=c['type']
            changed=chosen!=c['type'];c['type']=chosen;c['label']=LABELS[chosen]
            if c['status']=='NEEDS_REVIEW':
                if changed or form.get(f'confirm_{i}')=='yes':c['status']='CLASSIFIED';c['human_confirmed']=True;c['reasons']=['Human-confirmed after content-based review']+c.get('reasons',[])[:3]
                else:unresolved.append(d['original_name'])
        save(job_id,s);return render(job_id,s,'Explicit confirmation is still required for: '+', '.join(unresolved) if unresolved else None)
    @app.post('/v12/{job_id}/audit',response_class=HTMLResponse)
    async def run(request:Request,job_id:str,authorization:str=Form(...)):
        if authorization!='yes':return HTMLResponse('Authorization required',400)
        if not safe(job_id) or not sf(job_id).exists():return HTMLResponse('Not found',404)
        s=load(job_id);docs=s['documents']
        if not ready(docs):return render(job_id,s,'Resolve review items and identify the required contract/invoice documents first.')
        contracts=[d['saved_path'] for d in docs if d['classification']['type'] in CONTRACT];invoices=[d['saved_path'] for d in docs if d['classification']['type'] in INVOICE];evidence=[d['saved_path'] for d in docs if d['classification']['type'] in EVIDENCE]
        try:
            result=audit_relationship(contracts,invoices,None,'Auto-classified contractor relationship',evidence_paths=evidence);result['document_classification']=[{'filename':d['original_name'],**d['classification']} for d in docs];result['ingestion_version']='v12-content-classification';(BASE/job_id/'audit-report.json').write_text(json.dumps(result,indent=2));delete_raw_uploads(BASE/job_id)
            total=float(result.get('potential_overpayment',0) or 0)
            return page('V12 Audit Complete',f"<div class='top'><b>UTILITY CONTRACTOR AUDIT · V12</b><div class='nav'><a href='/v12'>Home</a></div></div><div class='h'><h1>Audit complete.</h1><p>{len(docs)} documents classified and routed.</p></div><div class='c'><h2>${total:,.2f} potential overpayment</h2><p class='muted'>Conservative total; overlapping findings on the same invoice line are not added twice.</p><div class='actions'><a class='btn' href='/report/{html.escape(job_id)}/json'>Download audit JSON</a><a class='btn secondary' href='/v12'>Start another audit</a></div></div>")
        except Exception as e:return render(job_id,s,'Audit engine error: '+str(e))
