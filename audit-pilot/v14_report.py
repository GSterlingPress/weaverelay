import html,json,re
from fastapi import Request
from fastapi.responses import HTMLResponse
from secure_jobs import BASE


def _safe(j):return bool(j) and all(x not in j for x in ('/','\\','..'))
def _money(v):return f"${float(v or 0):,.2f}"

def _report_html(result):
    findings=result.get('findings') or []
    rows=[]
    for f in findings:
        ev=f.get('evidence') or {}; inv=ev.get('invoice') or {}; field=ev.get('field') or {}; vals=field.get('values') or {}
        support=''
        if field:
            support=f"{field.get('record_type','evidence')} · {field.get('source','')}"
            if vals.get('work_order_id'):support+=f" · {vals['work_order_id']}"
        rows.append(f"<tr><td>{html.escape(str(f.get('code','')).replace('_',' ').title())}</td><td>{html.escape(str(f.get('confidence','')))}</td><td class='money'>{_money(f.get('amount'))}</td><td>{html.escape(str(f.get('message','')))}</td><td>{html.escape(str(inv.get('source','')))} row {html.escape(str(inv.get('row','')))}</td><td>{html.escape(support or 'Invoice comparison / no separate field record')}</td></tr>")
    docs=''.join(f"<tr><td>{html.escape(str(d.get('filename','')))}</td><td>{html.escape(str(d.get('label',d.get('type',''))))}</td><td>{html.escape(str(d.get('confidence_pct','')))}%</td><td>{'Human confirmed' if d.get('human_confirmed') else 'AI classified'}</td></tr>" for d in result.get('document_classification',[]))
    match=(result.get('evidence') or {}).get('matching') or {}
    return f"""<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>Utility Contractor Audit Report</title><style>
body{{font-family:Arial,sans-serif;color:#17212b;margin:0;background:#f4f6f8}}main{{max-width:1100px;margin:auto;background:white;padding:34px}}h1{{margin-bottom:4px}}.sub{{color:#64717d}}.hero{{border:1px solid #d8e0e6;border-radius:14px;padding:22px;margin:24px 0}}.amount{{font-size:38px;font-weight:800}}.grid{{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}}.stat{{background:#f4f6f8;border-radius:10px;padding:14px}}table{{width:100%;border-collapse:collapse;margin:14px 0 28px;font-size:13px}}th,td{{border-bottom:1px solid #dfe5e9;padding:10px;text-align:left;vertical-align:top}}th{{background:#eef2f5}}.money{{white-space:nowrap;font-weight:700}}.note{{background:#fff7df;border:1px solid #ecd798;border-radius:10px;padding:14px}}@media(max-width:700px){{main{{padding:18px}}.grid{{grid-template-columns:1fr}}table{{display:block;overflow-x:auto}}}}@media print{{body{{background:white}}main{{max-width:none;padding:0}}}}
</style></head><body><main><h1>Utility Contractor Audit Report</h1><div class='sub'>Human-readable audit output · {html.escape(str(result.get('ingestion_version','V14')))}</div><section class='hero'><div class='sub'>Potential overpayment for utility review</div><div class='amount'>{_money(result.get('potential_overpayment'))}</div><p>Conservative total. Overlapping findings on the same invoice line are not added twice.</p></section><div class='grid'><div class='stat'><b>{result.get('invoice_count',0)}</b><br>Invoices reviewed</div><div class='stat'><b>{match.get('matched_invoice_lines',0)}</b><br>Matched invoice lines</div><div class='stat'><b>{len(findings)}</b><br>Audit findings</div></div><h2>Findings</h2><table><thead><tr><th>Finding</th><th>Confidence</th><th>Amount</th><th>Why it was flagged</th><th>Invoice provenance</th><th>Supporting provenance</th></tr></thead><tbody>{''.join(rows)}</tbody></table><h2>Documents reviewed</h2><table><thead><tr><th>Document</th><th>Selected type</th><th>AI confidence</th><th>Review</th></tr></thead><tbody>{docs}</tbody></table><div class='note'><b>Important:</b> {html.escape(str(result.get('safety_note','These are audit findings for review, not fraud determinations or automatic recovery demands.')))}</div></main></body></html>"""

def register_v14_report(app):
    @app.get('/report/{job_id}/readable')
    def readable_report(request:Request,job_id:str,download:int=1):
        if not _safe(job_id):return HTMLResponse('Not found',404)
        p=BASE/job_id/'audit-report.json'
        if not p.exists():return HTMLResponse('Report is no longer available.',404)
        body=_report_html(json.loads(p.read_text()))
        headers={'Cache-Control':'private, no-store'}
        if download:headers['Content-Disposition']='attachment; filename="utility-contractor-audit-report.html"'
        return HTMLResponse(body,headers=headers)

    # Add the readable-report download beside JSON on the existing completion page
    # without changing the locked mobile viewer or audit engine.
    @app.middleware('http')
    async def v14_report_link(request:Request,call_next):
        response=await call_next(request)
        m=re.fullmatch(r'/v12/([^/]+)/audit',request.url.path)
        ctype=response.headers.get('content-type','')
        if request.method=='POST' and m and 'text/html' in ctype and response.status_code==200:
            chunks=[]
            async for chunk in response.body_iterator:chunks.append(chunk)
            raw=b''.join(chunks).decode('utf-8','replace');job=m.group(1)
            needle=f"<a class='btn' href='/report/{html.escape(job)}/json'>Download audit JSON</a>"
            addition=f"<a class='btn' href='/report/{html.escape(job)}/readable?download=1'>Download readable report</a>"+needle
            raw=raw.replace(needle,addition)
            return HTMLResponse(raw,status_code=response.status_code,headers={'Cache-Control':'private, no-store'})
        return response
