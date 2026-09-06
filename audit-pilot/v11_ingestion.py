import html,json,shutil
from pathlib import Path
from fastapi import UploadFile,File,Form,Request
from fastapi.responses import HTMLResponse,RedirectResponse
from document_classifier import classify_document,DOC_TYPES,LABELS
from secure_jobs import new_job_dir,save_upload_limited,delete_raw_uploads,BASE
from audit_engine.relationship import audit_relationship

MIXED={".pdf",".xlsx",".xlsm",".csv",".txt",".md",".eml",".msg",".jpg",".jpeg",".png",".webp",".tif",".tiff",".bmp",".heic"}
CONTRACT={"MASTER_CONTRACT","RATE_SHEET"}; INVOICE={"INVOICE"}; EVIDENCE=set(DOC_TYPES)-CONTRACT-INVOICE-{"OTHER"}
CSS="""
:root{color-scheme:dark}*{box-sizing:border-box}body{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#080d12;color:#eef4f7;margin:0;min-height:100vh}.w{max-width:1120px;margin:auto;padding:34px 20px 54px}.topbar{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:16px}.brand{font-size:12px;font-weight:900;letter-spacing:.12em;color:#9fb0bb}.nav{display:flex;gap:10px;flex-wrap:wrap}.h,.c{border-radius:20px;padding:26px}.h{background:linear-gradient(145deg,#111a22,#0d141b);border:1px solid #24313b}.h h1{font-size:38px;line-height:1.05;margin:24px 0 10px}.h p{color:#a9b8c2;margin:0;font-size:16px}.c{background:#0f171e;border:1px solid #26343e;margin-top:18px}.summary{display:flex;justify-content:space-between;gap:16px;align-items:center;flex-wrap:wrap;margin-bottom:14px}.doc{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(250px,.9fr) 140px;gap:16px;align-items:center;padding:16px;border:1px solid #26343e;border-radius:14px;margin:10px 0;background:#111b23}.doc:hover{border-color:#354754}.docname{font-weight:850;font-size:15px}.b{display:inline-block;padding:5px 9px;border-radius:999px;font-size:11px;font-weight:900;letter-spacing:.04em}.ok{background:#173a2d;color:#8ee0b7}.rv{background:#42341a;color:#f2c66d}.btn{display:inline-block;background:#2f9e77;color:#08110d;border:0;border-radius:10px;padding:11px 15px;font-weight:900;text-decoration:none;cursor:pointer}.btn:hover{filter:brightness(1.08)}.secondary{background:#19252e;color:#eaf1f5;border:1px solid #31414c}.muted{color:#8395a1;font-size:13px;line-height:1.45}.confbox{text-align:right}.conflabel{font-size:11px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:#78909d;margin-bottom:3px}.conf{font-size:28px;font-weight:950;color:#f3f7f9}.confhelp{font-size:11px;color:#718491;margin-top:3px}.low{color:#f0b85d}.mid{color:#d6dce0}.high{color:#7fd8ae}select{width:100%;padding:10px;background:#0a1117;color:#edf4f7;border:1px solid #334652;border-radius:8px;font-size:14px}.actions{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:20px}.actions form{margin:0}.ready{margin-top:24px;border-top:1px solid #26343e;padding-top:20px}.ready h2{margin:0 0 6px}.error{background:#32191b;border:1px solid #6f2b2f;color:#ffb7bc;padding:11px 13px;border-radius:10px}.hint{background:#0b1319;border:1px solid #21303a;border-radius:12px;padding:13px 14px;color:#9aabb5;margin-top:16px}.legend{display:flex;gap:14px;flex-wrap:wrap;color:#80929e;font-size:12px}.legend b{color:#dce6eb}@media(max-width:760px){.w{padding:18px 12px 36px}.topbar{align-items:flex-start;flex-direction:column}.h,.c{padding:18px}.h h1{font-size:30px}.doc{grid-template-columns:1fr}.confbox{text-align:left}.actions{align-items:stretch}.actions .btn,.actions form,.actions form .btn{width:100%;text-align:center}.nav{width:100%}.nav .btn{flex:1;text-align:center}}
"""

def page(title,body):
    shell=f"<div class='topbar'><div class='brand'>UTILITY CONTRACTOR AUDIT</div><div class='nav'><a class='btn secondary' href='/ingest'>← Back to upload</a><a class='btn secondary' href='/'>Home</a></div></div>"
    return HTMLResponse(f"<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'><meta name='theme-color' content='#080d12'><title>{html.escape(title)}</title><style>{CSS}</style></head><body><div class='w'>{shell}{body}</div></body></html>")
def safe(j):return bool(j) and all(x not in j for x in ('/','\\','..'))
def statefile(j):return BASE/j/'classification-state.json'
def load(j):return json.loads(statefile(j).read_text())
def save(j,s):statefile(j).write_text(json.dumps(s,indent=2))

def routing_ready(docs):
    return (all(d['classification']['status']=='CLASSIFIED' for d in docs)
            and any(d['classification']['type'] in CONTRACT for d in docs)
            and any(d['classification']['type'] in INVOICE for d in docs))

def confidence_class(pct):
    return 'high' if pct>=80 else ('mid' if pct>=60 else 'low')

def render(j,s,error=None):
    docs=s['documents']; pending=sum(d['classification']['status']=='NEEDS_REVIEW' for d in docs)
    body=f"<div class='h'><div class='brand'>V11 · CONTENT CLASSIFICATION</div><h1>Document pile classified.</h1><p>We read the document itself—headings, fields, dates, tables, amounts, work-order relationships and OCR text—to decide what it is.</p></div><div class='c'><div class='summary'><div><b>{len(docs)}</b> documents · <b>{pending}</b> need review</div><div class='legend'><span><b>AI confidence</b> = how certain the classifier is about the selected document type</span></div></div>"
    if error:body+=f"<div class='error'>{html.escape(error)}</div>"
    body+=f"<form method='post' action='/ingest/{html.escape(j)}/review'>"
    for i,d in enumerate(docs):
        c=d['classification']; cls='ok' if c['status']=='CLASSIFIED' else 'rv'; rs='; '.join(c.get('reasons',[]));pct=int(c.get('confidence_pct',0) or 0);cc=confidence_class(pct)
        opts=''.join(f"<option value='{t}' {'selected' if t==c['type'] else ''}>{html.escape(LABELS[t])}</option>" for t in DOC_TYPES)
        body+=f"<div class='doc'><div><div class='docname'>{html.escape(d['original_name'])}</div><div class='muted'>{html.escape(rs)}</div></div><div><span class='b {cls}'>{c['status'].replace('_',' ')}</span><div style='margin-top:8px'><select name='type_{i}' aria-label='Document type for {html.escape(d['original_name'])}'>{opts}</select></div></div><div class='confbox'><div class='conflabel'>AI confidence</div><div class='conf {cc}'>{pct}%</div><div class='confhelp'>in selected type</div></div></div>"
    body+="<div class='actions'><a class='btn secondary' href='/ingest'>← Back / start over</a><button class='btn' type='submit'>Save types & continue →</button></div></form>"
    if routing_ready(docs):
        body+=f"<div class='ready'><h2>Ready for audit</h2><p class='muted'>The pile has the minimum document types needed to continue.</p><form method='post' action='/ingest/{html.escape(j)}/audit'><label><input type='checkbox' name='authorization' value='yes' required> I am authorized to analyze these documents.</label><div class='actions'><button class='btn'>Next: run audit →</button></div></form></div>"
    else:
        body+="<div class='hint'><b>Next step:</b> correct any wrong document types, then click <b>Save types & continue →</b>. The audit can proceed once we have at least one contract/rate document, one prime contractor invoice, and no unresolved classifications.</div>"
    return page('V11 Smart Ingestion',body+'</div>')

def register_v11(app):
    @app.middleware('http')
    async def root_to_v11(request:Request,call_next):
        if request.url.path=='/':return RedirectResponse('/ingest',307)
        return await call_next(request)

    @app.get('/ingest',response_class=HTMLResponse)
    def home(request:Request):
        return page('Utility Contractor Audit V11',"<div class='h'><div class='brand'>V11 · SMART INGESTION</div><h1>Drop the document pile. We sort it.</h1><p>Contracts, invoices, work orders, timesheets, equipment logs, POs, completion records, images and scans. OCR is used when needed.</p></div><div class='c'><form method='post' action='/ingest' enctype='multipart/form-data'><input type='file' name='documents' multiple required><div class='actions'><button class='btn'>Classify document pile →</button><a class='btn secondary' href='/manual'>Manual V10 upload</a></div></form></div>")

    @app.get('/manual',response_class=HTMLResponse)
    def manual(request:Request):
        from fastapi.templating import Jinja2Templates
        t=Jinja2Templates(directory='/app/templates')
        return t.TemplateResponse(request=request,name='index.html',context={'error':None})

    @app.post('/ingest',response_class=HTMLResponse)
    async def ingest(request:Request,documents:list[UploadFile]=File(...)):
        if not documents or len(documents)>100:return page('V11','<div class=c>Upload 1–100 documents.</div>')
        j,w=new_job_dir();s={'version':'v11','documents':[]}
        try:
            for f in documents:
                if not f.filename:continue
                p,n=await save_upload_limited(f,w,MIXED);c=classify_document(p)
                s['documents'].append({'original_name':n,'saved_path':str(p),'classification':c})
            if not s['documents']:raise ValueError('No readable documents uploaded.')
            save(j,s);return render(j,s)
        except Exception as e:
            shutil.rmtree(w,ignore_errors=True);return page('V11',f"<div class='c'><div class='error'>{html.escape(str(e))}</div></div>")

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
        if routing_ready(s['documents']):return render(job_id,s)
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
            return page('V11 Audit Complete',f"<div class='h'><div class='brand'>AUDIT COMPLETE</div><h1>${total:,.2f} potential overpayment</h1><p>{len(docs)} documents were classified and routed.</p></div><div class='c'><div class='actions'><a class='btn' href='/report/{html.escape(job_id)}/json'>Download audit JSON</a><a class='btn secondary' href='/ingest'>Start another audit</a></div></div>")
        except Exception as e:return render(job_id,s,'Audit engine error: '+str(e))
