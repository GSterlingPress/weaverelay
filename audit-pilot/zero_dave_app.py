from __future__ import annotations

from pathlib import Path
import base64, html, json, os, secrets, shutil, tempfile, re

from fastapi import FastAPI, File, Form, Request, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, Response, PlainTextResponse, JSONResponse

from secure_jobs import BASE, cleanup_expired, delete_raw_uploads, new_job_dir, save_upload_limited
from zero_dave_orchestrator import run_zero_dave_audit, write_manifest
from customer_reports import build_customer_package

app=FastAPI(title="Zero-Dave Audit — Private Staging",docs_url=None,redoc_url=None)
CONTRACT={".pdf",".txt",".md"}; INVOICE={".pdf",".xlsx",".xlsm",".csv"}; FIELD={".csv"}
EVIDENCE={".pdf",".xlsx",".xlsm",".csv",".txt",".md",".eml",".msg",".jpg",".jpeg",".png",".webp",".tif",".tiff",".bmp",".heic"}

def authorized(request:Request)->bool:
    user=os.getenv("PILOT_USERNAME",""); password=os.getenv("PILOT_PASSWORD","")
    if not user or not password:return False
    auth=request.headers.get("authorization","")
    if not auth.startswith("Basic "):return False
    try:supplied_user,supplied_password=base64.b64decode(auth[6:],validate=True).decode().split(":",1)
    except Exception:return False
    return secrets.compare_digest(user,supplied_user) and secrets.compare_digest(password,supplied_password)

def selftest_authorized(request:Request)->bool:
    expected=os.getenv("SELF_TEST_TOKEN",""); supplied=request.query_params.get("token","")
    return bool(expected) and secrets.compare_digest(expected,supplied)

@app.middleware("http")
async def security(request,call_next):
    cleanup_expired()
    public_ok=request.url.path in ("/health","/robots.txt")
    test_ok=request.url.path=="/staging/self-test" and selftest_authorized(request)
    if not public_ok and not test_ok and not authorized(request):r=Response("Private staging access required.",401,headers={"WWW-Authenticate":"Basic realm=\"Zero-Dave Audit Staging\""})
    else:r=await call_next(request)
    r.headers["Cache-Control"]="no-store, max-age=0";r.headers["Pragma"]="no-cache";r.headers["X-Content-Type-Options"]="nosniff";r.headers["X-Frame-Options"]="DENY";r.headers["Referrer-Policy"]="no-referrer";r.headers["X-Robots-Tag"]="noindex, nofollow, noarchive";r.headers["Content-Security-Policy"]="default-src 'self'; style-src 'self' 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'"
    return r

HOME="""<!doctype html><html><head><meta name=viewport content='width=device-width,initial-scale=1'><title>Zero-Dave Audit</title><style>
body{font-family:system-ui;background:#0d1117;color:#e6edf3;margin:0}.w{max-width:850px;margin:45px auto;padding:24px}.card{background:#161b22;border:1px solid #30363d;border-radius:16px;padding:28px}h1{font-size:34px;margin:0 0 8px}.muted{color:#9da7b3}label{display:block;margin:18px 0 6px;font-weight:700}input[type=file]{width:100%;padding:12px;background:#0d1117;border:1px solid #30363d;border-radius:8px;color:#e6edf3}button{margin-top:22px;background:#2f6bff;color:white;border:0;padding:14px 22px;border-radius:9px;font-weight:800}.ok{margin:18px 0;padding:14px;border-left:4px solid #2fbf71;background:#102019}.warn{margin:18px 0;padding:14px;border-left:4px solid #d97706;background:#211a10}a{color:#79a7ff}</style></head><body><div class=w><div class=card><h1>Zero-Dave Audit</h1><p class=muted>Private staging — three independent decipher/catalog/financial engines, trace consensus, materiality-weighted discrepancies, and customer PDF package.</p><div class=ok>A = validated deterministic Audit kernel · B = independent contract-first engine · C = independent ledger/evidence-first engine. Peer outputs remain hidden until trace comparison.</div><div class=warn>Staging only. Persistent analyzer disagreement is excluded from the verified total and disclosed rather than forced into consensus.</div><form method=post action='/zero-dave/audit' enctype='multipart/form-data'><label>Contract / governing agreement</label><input type=file name=contract required><label>Invoice / pay application</label><input type=file name=invoice required><label>Field data (optional CSV)</label><input type=file name=field><label>Evidence — contracts, amendments, exhibits, payroll, logs, receipts, images, email, spreadsheets</label><input type=file name=evidence multiple><label><input type=checkbox name=complete_package value=yes required> I confirm I supplied the complete contract package to the best of my knowledge, including referenced pricing exhibits/schedules and executed amendments that may affect price.</label><label><input type=checkbox name=authorization value=yes required> I am authorized to submit and analyze these documents.</label><button>Run Zero-Dave Audit</button></form></div></div></body></html>"""

@app.get("/",response_class=HTMLResponse)
def home():return HOME

@app.post("/zero-dave/audit",response_class=HTMLResponse)
async def zero_dave_upload(request:Request,contract:UploadFile=File(...),invoice:UploadFile=File(...),field:UploadFile|None=File(None),evidence:list[UploadFile]=File([]),complete_package:str=Form(...),authorization:str=Form(...)):
    if complete_package!="yes" or authorization!="yes":return HTMLResponse("Required affirmations were not accepted.",400)
    token,work=new_job_dir(); original_names={}
    try:
        cp,cn=await save_upload_limited(contract,work,CONTRACT);original_names[str(cp)]=cn
        ip,inn=await save_upload_limited(invoice,work,INVOICE);original_names[str(ip)]=inn
        fp=None
        if field and field.filename:fp,fn=await save_upload_limited(field,work,FIELD);original_names[str(fp)]=fn
        eps=[]
        for ef in evidence or []:
            if ef and ef.filename:ep,en=await save_upload_limited(ef,work,EVIDENCE);eps.append(str(ep));original_names[str(ep)]=en
        result=run_zero_dave_audit(contract=str(cp),invoice=str(ip),field=str(fp) if fp else None,evidence=eps,original_names=original_names)
        result["intake"]={"complete_package_affirmed":True,"authorized":True};package=build_customer_package(result,work);result["customer_package"]=package;write_manifest(result,work/"zero-dave-audit.json");delete_raw_uploads(work)
        verified=result["consensus"]["verified_total"];unresolved=result["consensus"]["unresolved_potential_total"]
        links="".join(f"<li><a href='/zero-dave/{token}/download/{html.escape(fname)}'>{html.escape(label)}</a></li>" for label,fname in (("Audit Findings Report PDF",package["findings_pdf"]),("Audit Evidence & Analytical Catalog PDF",package["evidence_catalog_pdf"]),("Original Evidence Archive",package["original_evidence_archive"]),("Machine-readable Audit Manifest","zero-dave-audit.json")))
        body=f"""<!doctype html><html><head><meta name=viewport content='width=device-width,initial-scale=1'><title>Audit complete</title><style>body{{font-family:system-ui;background:#0d1117;color:#e6edf3}}.w{{max-width:850px;margin:45px auto}}.card{{padding:28px;background:#161b22;border:1px solid #30363d;border-radius:16px}}a{{color:#79a7ff}}.n{{font-size:34px;font-weight:800}}.u{{color:#f0b45d}}</style></head><body><div class=w><div class=card><h1>Audit package created</h1><div class=n>${verified:,.2f} verified</div><p class=u>${unresolved:,.2f} unresolved potential — excluded from verified total.</p><p>Audit ID: <b>{html.escape(result['audit_id'])}</b></p><ul>{links}</ul><p>Private staging: verify the generated evidence package before any customer release.</p></div></div></body></html>""";return HTMLResponse(body)
    except Exception as exc:
        shutil.rmtree(work,ignore_errors=True);return HTMLResponse(f"Audit failed safely: {html.escape(str(exc))}",400)

def _safe_job(v:str)->bool:return bool(v) and "/" not in v and "\\" not in v and ".." not in v
@app.get("/zero-dave/{job_id}/download/{filename}")
def download(job_id:str,filename:str):
    allowed={"Audit-Findings-Report.pdf","Audit-Evidence-Analytical-Catalog.pdf","Audit-Original-Evidence.zip","zero-dave-audit.json"}
    if not _safe_job(job_id) or filename not in allowed:return HTMLResponse("Not found",404)
    p=BASE/job_id/filename
    if not p.exists():return HTMLResponse("Expired or not found",404)
    media="application/pdf" if p.suffix==".pdf" else ("application/zip" if p.suffix==".zip" else "application/json")
    return FileResponse(p,filename=filename,media_type=media,headers={"Cache-Control":"no-store"})

@app.get('/staging/self-test')
def staging_self_test(request:Request):
    if not selftest_authorized(request):return JSONResponse({'ok':False,'error':'not authorized'},403)
    import httpx
    port=os.getenv('PORT','8080'); base=f'http://127.0.0.1:{port}'; user=os.getenv('PILOT_USERNAME',''); pw=os.getenv('PILOT_PASSWORD','')
    with tempfile.TemporaryDirectory() as td:
        d=Path(td); contract=d/'contract.txt'; invoice=d/'invoice.csv'; payroll=d/'payroll.csv'
        contract.write_text('Commercial labor billing clause. Overall multiplier of 2.417. The multiplier is applied to the actual hourly labor rate paid to employees to determine the invoiced billing rate.\n',encoding='utf-8')
        invoice.write_text('invoice_id,rate_key,hours,rate,amount,vendor,service_date,description\nLIVE-1,Field Engineer,7.5,84.75,635.625,Live Test Vendor,2026-09-01,Field Engineer\n',encoding='utf-8')
        payroll.write_text('invoice_id,classification,hours,rate,service_date,description\nLIVE-1,Field Engineer,7.5,31.28,2026-09-01,Payroll register actual hourly rate\n',encoding='utf-8')
        with httpx.Client(timeout=180.0,auth=(user,pw)) as client:
            with contract.open('rb') as cf, invoice.open('rb') as inf, payroll.open('rb') as pf:
                r=client.post(base+'/zero-dave/audit',files=[('contract',('contract.txt',cf,'text/plain')),('invoice',('invoice.csv',inf,'text/csv')),('evidence',('payroll.csv',pf,'text/csv'))],data={'complete_package':'yes','authorization':'yes'})
            links=re.findall(r"href='([^']+)'",r.text); audit_match=re.search(r'Audit ID: <b>([^<]+)</b>',r.text)
            manifest_link=next((x for x in links if x.endswith('zero-dave-audit.json')),None)
            if r.status_code!=200 or not manifest_link:return {'ok':False,'post_status':r.status_code,'body':r.text[:1000]}
            mr=client.get(base+manifest_link); manifest=mr.json()
            downloads={}
            for link in links:
                dr=client.get(base+link); downloads[Path(link).name]={'status':dr.status_code,'bytes':len(dr.content),'content_type':dr.headers.get('content-type')}
            findings={}
            for name,res in manifest.get('analyzer_results',{}).items():
                findings[name]={'engine':res.get('engine'),'findings':[{'code':f.get('code'),'amount':f.get('amount'),'rule':(f.get('_zero_dave_trace') or {}).get('rule_value'),'inputs':(f.get('_zero_dave_trace') or {}).get('inputs')} for f in res.get('findings',[])]}
            return {'ok':True,'post_status':r.status_code,'audit_id':audit_match.group(1) if audit_match else manifest.get('audit_id'),'verified_total':manifest.get('consensus',{}).get('verified_total'),'unresolved_total':manifest.get('consensus',{}).get('unresolved_potential_total'),'independence':manifest.get('independence'),'analyzers':findings,'consensus_findings':[{'state':f.get('state'),'verified_amount':f.get('verified_amount'),'potential_amount':f.get('potential_amount'),'divergence_stage':f.get('divergence_stage'),'materiality_band':f.get('materiality_band')} for f in manifest.get('consensus',{}).get('findings',[])],'downloads':downloads}

@app.get("/health")
def health():return {"status":"ok","product":"zero-dave-audit","mode":"private-staging","three_catalogs":True,"independent_financial_engines":True,"shared_financial_kernel":False}
@app.get("/robots.txt")
def robots():return PlainTextResponse("User-agent: *\nDisallow: /\n")
