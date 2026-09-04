from fastapi import FastAPI,Request,UploadFile,File,Form
from fastapi.responses import HTMLResponse,FileResponse,Response
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from pathlib import Path
import json,shutil,os,secrets,base64
from audit_engine.pipeline import run_audit
from audit_engine.relationship import audit_relationship
from audit_engine.portfolio import audit_portfolio
from audit_engine.review import build_review_queue,prepare_review_assets,initial_state,apply_decision,summary
from secure_jobs import new_job_dir,save_upload_limited,delete_raw_uploads,cleanup_expired,BASE

HERE=Path(__file__).resolve().parent
app=FastAPI(title="Contract-to-Money Audit Pilot",docs_url=None,redoc_url=None)
app.mount("/static",StaticFiles(directory=HERE/"static"),name="static")
templates=Jinja2Templates(directory=str(HERE/"templates"))

def render(request:Request,name:str,context:dict|None=None,status_code:int=200):
    return templates.TemplateResponse(request=request,name=name,context=context or {},status_code=status_code)

def _pilot_authorized(request:Request)->bool:
    username=os.getenv("PILOT_USERNAME","")
    password=os.getenv("PILOT_PASSWORD","")
    if not username or not password:
        return False
    auth=request.headers.get("authorization","")
    if not auth.startswith("Basic "):
        return False
    try:
        decoded=base64.b64decode(auth[6:],validate=True).decode("utf-8")
        supplied_user,supplied_password=decoded.split(":",1)
    except Exception:
        return False
    return secrets.compare_digest(supplied_user,username) and secrets.compare_digest(supplied_password,password)
CONTRACT={".pdf",".txt",".md"};INVOICE={".pdf",".xlsx",".xlsm",".csv"};FIELD={".csv"};EVIDENCE={".pdf",".xlsx",".xlsm",".csv",".txt",".md",".eml",".msg",".jpg",".jpeg",".png",".webp",".tif",".tiff",".bmp",".heic"};PORTFOLIO={".zip"}

@app.middleware("http")
async def headers(request,call_next):
    cleanup_expired()
    if request.url.path not in ("/health","/robots.txt") and not _pilot_authorized(request):
        r=Response("Pilot access required.",status_code=401,headers={"WWW-Authenticate":"Basic realm=\"Utility Audit Pilot\""})
    else:
        r=await call_next(request)
    r.headers["Cache-Control"]="no-store, max-age=0";r.headers["Pragma"]="no-cache";r.headers["X-Content-Type-Options"]="nosniff"
    r.headers["X-Frame-Options"]="DENY";r.headers["Referrer-Policy"]="no-referrer";r.headers["X-Robots-Tag"]="noindex, nofollow, noarchive"
    r.headers["Content-Security-Policy"]="default-src 'self'; style-src 'self' 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'"
    return r

@app.get("/",response_class=HTMLResponse)
def home(request:Request):return render(request,"index.html",{"error":None})

@app.post("/audit",response_class=HTMLResponse)
async def audit_upload(request:Request,contract:UploadFile=File(...),invoice:UploadFile=File(...),field:UploadFile|None=File(None),evidence:list[UploadFile]=File([]),mode:str=Form("payment"),authorization:str=Form(...)):
    if authorization != "yes":
        return render(request,"index.html",{"error":"You must confirm you are authorized to analyze these documents."},status_code=400)
    token,work=new_job_dir()
    try:
        cp,cn=await save_upload_limited(contract,work,CONTRACT);ip,inn=await save_upload_limited(invoice,work,INVOICE)
        fp=None
        if field and field.filename:fp,_=await save_upload_limited(field,work,FIELD)
        eps=[]
        for ef in evidence or []:
            if ef and ef.filename:
                ep,_=await save_upload_limited(ef,work,EVIDENCE);eps.append(str(ep))
        result=run_audit(str(cp),str(ip),str(fp) if fp else None,evidence_paths=eps);result["contract"]=cn;result["invoice"]=inn
        mode = "recovery" if mode == "recovery" else "payment"
        result["audit_mode"] = mode
        fs=result["findings"]
        high_over=sum(float(x.get("amount",0) or 0) for x in fs if x.get("confidence")=="HIGH" and x.get("status") in ("OVERBILLED","UNSUPPORTED"))
        total_review_amount=round(float(result.get("totals",{}).get("overbilled",0) or 0)+float(result.get("totals",{}).get("unsupported",0) or 0),2)
        unresolved=bool(result.get("unknown") or result.get("ocr_required_pages") or result.get("invoice_ocr_required_pages") or any(x.get("status")=="NEEDS_HUMAN" for x in fs))
        if mode=="payment":
            if high_over>0:
                decision="HOLD"
                decision_reason=f"${high_over:,.2f} in high-confidence overbilling or unsupported charges should be resolved before payment."
            elif unresolved:
                decision="REVIEW"
                decision_reason="No high-confidence overbilling requires a hold, but unresolved evidence requires human review."
            else:
                decision="PAY"
                decision_reason="No deterministic discrepancy was found in the supplied contract, invoice and supporting evidence."
            result["payment_gate"]={"decision":decision,"high_confidence_amount":round(high_over,2),"needs_review":unresolved}
            result["recovery_audit"]=None
        else:
            if high_over>0:
                decision="RECOVERY REVIEW"
                decision_reason=f"${high_over:,.2f} in high-confidence historical overbilling or unsupported charges was identified for recovery review."
            elif unresolved:
                decision="INVESTIGATE"
                decision_reason="No high-confidence recoverable amount is established yet, but unresolved evidence warrants historical review."
            else:
                decision="NO DISCREPANCY"
                decision_reason="No deterministic historical overpayment was found in the supplied documents."
            result["recovery_audit"]={"decision":decision,"high_confidence_amount":round(high_over,2),"potential_review_amount":total_review_amount,"needs_review":unresolved}
            result["payment_gate"]=None
        review_queue=build_review_queue(result)
        if review_queue:
            review_queue=prepare_review_assets(review_queue,work,eps)
        result["review_queue"]=review_queue
        (work/"audit-report.json").write_text(json.dumps(result,indent=2),encoding="utf-8")
        delete_raw_uploads(work)
        if review_queue:
            (work/"review-state.json").write_text(json.dumps(initial_state(review_queue),indent=2),encoding="utf-8")
        return render(request,"report.html",{"result":result,"findings":fs,
          "high_count":sum(x.get("confidence")=="HIGH" for x in fs),"review_count":sum(x.get("status")=="NEEDS_HUMAN" for x in fs),
          "job_id":token,"decision":decision,"decision_reason":decision_reason,"mode":mode})
    except Exception as e:
        shutil.rmtree(work,ignore_errors=True)
        return render(request,"index.html",{"error":str(e)},status_code=400)

@app.get("/relationship",response_class=HTMLResponse)
def relationship_home(request:Request):
    return render(request,"relationship_upload.html",{"error":None})

@app.post("/relationship/audit",response_class=HTMLResponse)
async def relationship_upload(request:Request,contractor_name:str=Form(...),contracts:list[UploadFile]=File(...),invoices:list[UploadFile]=File(...),field:UploadFile|None=File(None),evidence:list[UploadFile]=File([]),authorization:str=Form(...)):
    if authorization != "yes":
        return render(request,"relationship_upload.html",{"error":"You must confirm you are authorized to analyze these documents."},status_code=400)
    if len(contracts)>30 or len(invoices)>500:
        return render(request,"relationship_upload.html",{"error":"Pilot limit: 30 contract/amendment files and 500 invoices per relationship."},status_code=400)
    token,work=new_job_dir()
    try:
        cps=[]; ips=[]
        for f in contracts:
            cp,_=await save_upload_limited(f,work,CONTRACT); cps.append(str(cp))
        for f in invoices:
            ip,_=await save_upload_limited(f,work,INVOICE); ips.append(str(ip))
        fp=None
        if field and field.filename: fp,_=await save_upload_limited(field,work,FIELD)
        eps=[]
        for ef in evidence or []:
            if ef and ef.filename:
                ep,_=await save_upload_limited(ef,work,EVIDENCE);eps.append(str(ep))
        result=audit_relationship(cps,ips,str(fp) if fp else None,contractor_name.strip(),evidence_paths=eps)
        (work/"audit-report.json").write_text(json.dumps(result,indent=2),encoding="utf-8")
        delete_raw_uploads(work)
        ranked=sorted(result["invoices"],key=lambda x:x["potential_overpayment"],reverse=True)
        return render(request,"relationship.html",{"result":result,"invoices":ranked,"job_id":token})
    except Exception as e:
        shutil.rmtree(work,ignore_errors=True)
        return render(request,"relationship_upload.html",{"error":str(e)},status_code=400)

@app.get("/portfolio",response_class=HTMLResponse)
def portfolio_home(request:Request):
    return render(request,"portfolio_upload.html",{"error":None})

@app.post("/portfolio/audit",response_class=HTMLResponse)
async def portfolio_upload(request:Request,portfolio:UploadFile=File(...),authorization:str=Form(...)):
    if authorization != "yes":
        return render(request,"portfolio_upload.html",{"error":"You must confirm you are authorized to analyze these documents."},status_code=400)
    token,work=new_job_dir()
    try:
        zp,_=await save_upload_limited(portfolio,work,PORTFOLIO)
        extraction=work/"portfolio_extracted"
        result=audit_portfolio(str(zp),str(extraction))
        (work/"audit-report.json").write_text(json.dumps(result,indent=2),encoding="utf-8")
        for child in list(work.iterdir()):
            if child.name=="audit-report.json": continue
            if child.is_dir(): shutil.rmtree(child,ignore_errors=True)
            else: child.unlink(missing_ok=True)
        return render(request,"portfolio.html",{"result":result,"job_id":token})
    except Exception as e:
        shutil.rmtree(work,ignore_errors=True)
        return render(request,"portfolio_upload.html",{"error":str(e)},status_code=400)

def _safe_job(job_id:str):
    return bool(job_id) and "/" not in job_id and "\\" not in job_id and ".." not in job_id

@app.get("/review/{job_id}",response_class=HTMLResponse)
def review_page(request:Request,job_id:str):
    if not _safe_job(job_id):return HTMLResponse("Not found",404)
    work=BASE/job_id;rp=work/"audit-report.json";sp=work/"review-state.json"
    if not rp.exists():return HTMLResponse("Review expired or not found.",404)
    report=json.loads(rp.read_text(encoding="utf-8"))
    queue=report.get("review_queue",[])
    state=json.loads(sp.read_text(encoding="utf-8")) if sp.exists() else initial_state(queue)
    for item in queue:
        item["decision"]=(state.get("items") or {}).get(item["id"],{"status":"PENDING","confirmed_amount":0})
    return render(request,"review.html",{"job_id":job_id,"items":queue,"state":state,"summary":summary(state)})

@app.post("/review/{job_id}/{item_id}",response_class=HTMLResponse)
async def review_action(request:Request,job_id:str,item_id:str,action:str=Form(...),corrected_value:str=Form(""),note:str=Form("")):
    if not _safe_job(job_id) or "/" in item_id or "\\" in item_id or ".." in item_id:return HTMLResponse("Not found",404)
    work=BASE/job_id;rp=work/"audit-report.json";sp=work/"review-state.json"
    if not rp.exists():return HTMLResponse("Review expired or not found.",404)
    report=json.loads(rp.read_text(encoding="utf-8"));queue=report.get("review_queue",[])
    state=json.loads(sp.read_text(encoding="utf-8")) if sp.exists() else initial_state(queue)
    try:
        apply_decision(report,state,item_id,action.upper(),corrected_value if corrected_value.strip() else None,note)
    except (ValueError,KeyError) as e:
        for item in queue:item["decision"]=(state.get("items") or {}).get(item["id"],{"status":"PENDING","confirmed_amount":0})
        return render(request,"review.html",{"job_id":job_id,"items":queue,"state":state,"summary":summary(state),"error":str(e)},status_code=400)
    sp.write_text(json.dumps(state,indent=2),encoding="utf-8")
    for item in queue:item["decision"]=(state.get("items") or {}).get(item["id"],{"status":"PENDING","confirmed_amount":0})
    return render(request,"review.html",{"job_id":job_id,"items":queue,"state":state,"summary":summary(state)})

@app.get("/review/{job_id}/asset/{asset}")
def review_asset(job_id:str,asset:str):
    if not _safe_job(job_id) or "/" in asset or "\\" in asset or ".." in asset:return HTMLResponse("Not found",404)
    p=BASE/job_id/"review_assets"/asset
    if not p.exists() or p.suffix.lower()!=".png":return HTMLResponse("Not found",404)
    return FileResponse(p,media_type="image/png",headers={"Cache-Control":"no-store"})

@app.get("/review/{job_id}/state.json")
def review_state_json(job_id:str):
    if not _safe_job(job_id):return HTMLResponse("Not found",404)
    p=BASE/job_id/"review-state.json"
    if not p.exists():return HTMLResponse("Not found",404)
    return FileResponse(p,filename="review-state.json",media_type="application/json",headers={"Cache-Control":"no-store"})

@app.get("/report/{job_id}/json")
def report(job_id:str):
    if "/" in job_id or "\\" in job_id or ".." in job_id:return HTMLResponse("Not found",404)
    p=BASE/job_id/"audit-report.json"
    if not p.exists():return HTMLResponse("Report expired or not found.",404)
    return FileResponse(p,filename="audit-report.json",media_type="application/json",headers={"Cache-Control":"no-store"})
@app.get("/sample")
def sample():return FileResponse(HERE/"samples"/"sample-pack.zip",filename="sample-audit-pack.zip")

@app.get("/health")
def health():
    return {"status":"ok","product":"utility-contractor-audit-human-review-v10","mode":"controlled-pilot"}

@app.get("/robots.txt")
def robots():
    from fastapi.responses import PlainTextResponse
    return PlainTextResponse("User-agent: *\nDisallow: /\n")
