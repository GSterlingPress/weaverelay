import html,json,shutil
from pathlib import Path
from fastapi import UploadFile,File,Form,Request
from fastapi.responses import HTMLResponse,RedirectResponse
from document_classifier import classify_document,DOC_TYPES,LABELS
from secure_jobs import new_job_dir,save_upload_limited,delete_raw_uploads,BASE
from audit_engine.relationship import audit_relationship

MIXED={".pdf",".xlsx",".xlsm",".csv",".txt",".md",".eml",".msg",".jpg",".jpeg",".png",".webp",".tif",".tiff",".bmp",".heic"}
CONTRACT={"MASTER_CONTRACT","RATE_SHEET"}; INVOICE={"INVOICE"}; EVIDENCE=set(DOC_TYPES)-CONTRACT-INVOICE-{"OTHER"}
CSS="body{font-family:system-ui;background:#f5f7f9;color:#18212b;margin:0}.w{max-width:1080px;margin:auto;padding:36px 20px}.h,.c{border-radius:18px;padding:24px}.h{background:#101820;color:white}.c{background:white;border:1px solid #dfe5ea;margin-top:18px}.doc{display:grid;grid-template-columns:1.5fr .9fr .5fr;gap:12px;padding:14px;border:1px solid #dde4e9;border-radius:12px;margin:10px 0}.b{display:inline-block;padding:5px 9px;border-radius:999px;font-size:12px;font-weight:800}.ok{background:#def4e9;color:#12613f}.rv{background:#fff0d2;color:#805500}.btn{display:inline-block;background:#0d6b50;color:white;border:0;border-radius:9px;padding:11px 15px;font-weight:800;text-decoration:none;cursor:pointer}.secondary{background:#e9eef1;color:#18212b}.muted{color:#667480;font-size:13px}.conf{font-size:23px;font-weight:900}select{width:100%;padding:8px}.actions{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:18px}.actions form{margin:0}@media(max-width:760px){.doc{grid-template-columns:1fr}.actions{align-items:stretch}.actions .btn,.actions form,.actions form .btn{width:100%;box-sizing:border-box;text-align:center}}"

def page(title,body):return HTMLResponse(f"<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'><title>{html.escape(title)}</title><style>{CSS}</style></head><body><div class='w'>{body}</div></body></html>")
def safe(j):return bool(j) and all(x not in j for x in ('/','\\','..'))
def statefile(j):return BASE/j/'classification-state.json'
def load(j):return json.loads(statefile(j).read_text())
def save(j,s):statefile(j).write_text(json.dumps(s,indent=2))

def routing_ready(docs):
    return (all(d['classification']['status']=='CLASSIFIED' for d in docs)
            and any(d['classification']['type'] in CONTRACT for d in docs)
            and any(d['classification']['type'] in INVOICE for d in docs))

def render(j,s,error=None):
    docs=s['documents']; pending=sum(d['classification']['status']=='NEEDS_REVIEW' for d in docs)
    body=f"<div class='h'><b>UTILITY CONTRACTOR AUDIT · V11</b><h1>Document pile classified.</h1><p>Classification uses document contents and structure, not filenames.</p></div><div class='c'><p><b>{len(docs)}</b> documents · <b>{pending}</b> need review</p>"
    if error:body+=f"<p style='color:#8b1d16'>{html.escape(error)}</p>"
    body+=f"<form method='post' action='/ingest/{html.escape(j)}/review'>"
    for i,d in enumerate(docs):
        c=d['classification']; cls='ok' if c['status']=='CLASSIFIED' else 'rv'; rs='; '.join(c.get('reasons',[]))
        opts=''.join(f"<option value='{t}' {'selected' if t==c['type'] else ''}>{html.escape(LABELS[t])}</option>" for t in DOC_TYPES)
        body+=f"<div class='doc'><div><b>{html.escape(d['original_name'])}</b><div class='muted'>{html.escape(rs)}</div></div><div><span class='b {cls}'>{c['status'].replace('_',' ')}</span><div style='margin-top:7px'><select name='type_{i}'>{opts}</select></div></div><div class='conf'>{c['confidence_pct']}%</div></div>"
    body+="<div class='actions'><a class='btn secondary' href='/ingest'>← Back / start over</a><button class='btn' type='submit'>Confirm types & continue →</button></div></form>"
    if routing_ready(docs):
        body+=f"<div style='margin-top:22px;border-top:1px solid #dfe5ea;padding-top:18px'><h2>Ready for audit</h2><p class='muted'>The pile has the minimum document types needed to continue.</p><form method='post' action='/ingest/{html.escape(j)}/audit'><label><input type='checkbox' name='authorization' value='yes' required> I am authorized to analyze these documents.</label><div class='actions'><button class='btn'>Next: run audit →</button></div></form></div>"
    else:
        body+="<p class='muted' style='margin-top:18px'>Next step: confirm or correct the document types above. Automatic routing then requires at least one contract/rate document, one prime contractor invoice, and no unresolved classifications.</p>"
    return page('V11 Smart Ingestion',body+'</div>')

def register_v11(app):
    @app.middleware('http')
    async def root_to_v11(request:Request,call_next):
        if request.url.path=='/':return RedirectResponse('/ingest',307)
        return await call_next(request)

    @app.get('/ingest',response_class=HTMLResponse)
    def home(request:Request):
        return page('Utility Contractor Audit V11',"<div class='h'><b>UTILITY CONTRACTOR AUDIT · V11</b><h1>Drop the document pile. We sort it.</h1><p>Contracts, invoices, work orders, timesheets, equipment logs, POs, completion records, images and scans. OCR is used when needed.</p></div><div class='c'><form method='post' action='/ingest' enctype='multipart/form-data'><input type='file' name='documents' multiple required><br><br><button class='btn'>Classify document pile →</button> <a class='btn secondary' href='/manual'>Manual V10 upload</a></form></div>")

    @app.get('/manual',response_class=HTMLResponse)
    def manual(request:Request):
        from fastapi.templating import Jinja2Templates
        t=Jinja2Templates(directory='/app/templates')
        return t.TemplateResponse(request=request,name='index.html',context={'error':None})

    @app.post('/ingest',response_class=HTMLResponse)
    async def ingest(request:Request,documents:list[UploadFile]=File(...)):
        if not documents or len(documents)>100:return page('V11','<div class=c>Upload 1–100 documents.<div class=actions><a class="btn secondary" href="/ingest">← Back</a></div></div>')
        j,w=new_job_dir();s={'version':'v11','documents':[]}
        try:
            for f in documents:
                if not f.filename:continue
                p,n=await save_upload_limited(f,w,MIXED);c=classify_document(p)
                s['documents'].append({'original_name':n,'saved_path':str(p),'classification':c})
            if not s['documents']:raise ValueError('No readable documents uploaded.')
            save(j,s);return render(j,s)
        except Exception as e:
            shutil.rmtree(w,ignore_errors=True);return page('V11',f"<div class=c>{html.escape(str(e))}<div class=actions><a class='btn secondary' href='/ingest'>← Back</a></div></div>")

    @app.post('/ingest/{job_id}/review',response_class=HTMLResponse)
    async def review(request:Request,job_id:str):
        if not safe(job_id) or not statefile(job_id).exists():return HTMLResponse('Not found',404)
        s=load(job_id);form=await request.form()
        for i,d in enumerate(s['documents']):
            c=d['classification'];chosen=str(form.get(f'type_{i}',c['type']))
            if chosen not in DOC_TYPES:chosen=c['type']
            if chosen!=c['type'] or c['status']=='NEEDS_REVIEW':
                c['type']=chosen;c['label']=LABELS[chosen];c['status']='CLASSIFIED';c['human_confirmed']=True;c['reasons']=['Human-confirmed after content-based review']+c.get('reasons',[])[:3]
        save(job_id,s)
        if routing_ready(s['documents']):
            return render(job_id,s)
        return render(job_id,s,'Types saved. To continue, identify at least one contract/rate document and one prime contractor invoice.')

    @app.post('/ingest/{job_id}/audit',response_class=HTMLResponse)
    async def run(request:Request,job_id:str,authorization:str=Form(...)):
        if authorization!='yes':return HTMLResponse('Authorization required',400)
        if not safe(job_id) or not statefile(job_id).exists():return HTMLResponse('Not found',404)
        s=load(job_id);docs=s['documents']
        if any(d['classification']['status']!='CLASSIFIED' for d in docs):return render(job_id,s,'Resolve all review items first.')
        contracts=[d['saved_path'] for d in docs if d['classification']['type'] in CONTRACT];invoices=[d['saved_path'] for d in docs if d['classification']['type'] in INVOICE];evidence=[d['saved_path'] for d in docs if d['classification']['type'] in EVIDENCE]
        if not contracts or not invoices:return render(job_id,s,'Need a contract/rate document and a prime contractor invoice.')
        try:
            result=audit_relationship(contracts,invoices,None,'Auto-classified contractor relationship',evidence_paths=evidence);result['document_classification']=[{'filename':d['original_name'],**d['classification']} for d in docs];result['ingestion_version']='v11-content-classification';(BASE/job_id/'audit-report.json').write_text(json.dumps(result,indent=2));delete_raw_uploads(BASE/job_id)
            invs=result.get('invoices',[]);total=sum(float(x.get('potential_overpayment',0) or 0) for x in invs)
            return page('V11 Audit Complete',f"<div class='h'><h1>Audit complete.</h1><p>{len(docs)} documents were classified and routed.</p></div><div class='c'><h2>${total:,.2f} potential overpayment</h2><div class='actions'><a class='btn' href='/report/{html.escape(job_id)}/json'>Download audit JSON</a><a class='btn secondary' href='/ingest'>Start another audit</a></div></div>")
        except Exception as e:return render(job_id,s,'Audit engine error: '+str(e))
