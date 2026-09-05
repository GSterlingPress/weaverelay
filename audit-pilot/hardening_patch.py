from pathlib import Path
import sys

root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('/app')
core = root / 'audit_engine' / 'core.py'
extract = root / 'audit_engine' / 'extract.py'
evidence = root / 'audit_engine' / 'evidence.py'
pipeline = root / 'audit_engine' / 'pipeline.py'


def replace_once(path, old, new):
    text = path.read_text()
    if old not in text:
        raise SystemExit(f'Patch target not found in {path}: {old[:120]!r}')
    path.write_text(text.replace(old, new, 1))

# 1) Formula-derived labor pricing: actual payroll rate x contract multiplier.
replace_once(
    extract,
    '"cost_per_mile":{},"external_index":{},"_evidence":[],"_unknown":[],"_ocr_required_pages":[]}',
    '"cost_per_mile":{},"external_index":{},"labor_formula":{},"_evidence":[],"_unknown":[],"_ocr_required_pages":[]}'
)

formula_anchor = '''        # Utility-specific commercial controls. Only explicit clauses become rules.\n'''
formula_insert = '''        # Formula-derived labor pricing. Only explicit multiplier language becomes a rule.\n        m=re.search(r"(?i)(?:multiplier|billing\\s+factor)[^.]{0,120}?([0-9]+(?:\\.[0-9]+)?)[^.]{0,160}?(?:applied\\s+to|times|x|multiplied\\s+by)?[^.]{0,80}?(?:actual\\s+(?:hourly\\s+)?(?:labor|payroll|salary)\\s+rate|actual\\s+hourly\\s+rate)",text)\n        if not m:\n            m=re.search(r"(?i)(?:actual\\s+(?:hourly\\s+)?(?:labor|payroll|salary)\\s+rate|actual\\s+hourly\\s+rate)[^.]{0,160}?(?:multiplied\\s+by|times|x|multiplier\\s+(?:of|is)?)[^0-9]{0,30}([0-9]+(?:\\.[0-9]+)?)",text)\n        if not m:\n            mm=re.search(r"(?i)(?:overall\\s+)?multiplier\\s+(?:of|is|=)\\s*([0-9]+(?:\\.[0-9]+)?)",text)\n            relation=re.search(r"(?i)(?:the\\s+)?multiplier\\s+is\\s+applied\\s+to\\s+the\\s+actual\\s+(?:hourly\\s+)?(?:labor|payroll|salary)\\s+rate|(?:actual\\s+(?:hourly\\s+)?(?:labor|payroll|salary)\\s+rate)[^.]{0,100}?(?:times|multiplier)",text)\n            if mm and relation:\n                m=mm\n        if m:\n            v=float(m.group(1));rules["labor_formula"]["payroll_multiplier"]=v;add_ev(rules,"labor_formula.payroll_multiplier",v,p,m.group(0))\n\n        # Utility-specific commercial controls. Only explicit clauses become rules.\n'''
replace_once(extract, formula_anchor, formula_insert)

old_sub = '''        m=re.search(r"(?i)(?:subcontractor|subcontract)[^.]{0,100}?(?:markup|mark[- ]?up)[^0-9]{0,30}(?:not\\s+to\\s+exceed|maximum|capped?\\s+at|of)?\\s*([0-9]+(?:\\.[0-9]+)?)\\s*%",text)\n        if m:\n            v=float(m.group(1));rules["subcontractor"]["markup_cap_pct"]=v;add_ev(rules,"subcontractor.markup_cap_pct",v,p,m.group(0))\n'''
new_sub = '''        m=re.search(r"(?i)(?:subcontractor|subcontract)[^.]{0,120}?(?:markup|mark[- ]?up|fixed\\s+fee|fee)[^0-9]{0,50}(?:should\\s+(?:only\\s+)?be|shall\\s+(?:only\\s+)?be|not\\s+to\\s+exceed|maximum|capped?\\s+at|limited\\s+to|of|is)?\\s*([0-9]+(?:\\.[0-9]+)?)\\s*(?:%|percent)",text)\n        if m:\n            v=float(m.group(1));rules["subcontractor"]["markup_cap_pct"]=v;add_ev(rules,"subcontractor.markup_cap_pct",v,p,m.group(0))\n'''
replace_once(extract, old_sub, new_sub)

# 2) Contract authority / precedence. Drafts and explicitly unexecuted proposals are never
# governing financial terms. Executed amendments outrank base/original language. When
# multiple same-authority terms conflict without an explicit superseding/controlling signal,
# remove the automatic rule and surface the conflict for human review.
precedence_anchor = '''def extract_contract_rules(pages):\n'''
precedence_helpers = r'''def _contract_page_text(p):
    chunks=[p.get("text") or ""]
    for table in p.get("tables",[]) or []:
        for rr in table.get("rows",[]) or []:
            chunks.append(" | ".join(str(c or "") for c in rr.get("cells",[]) or []))
    return "\n".join(chunks)

def _contract_authority(text):
    low=" ".join((text or "").lower().split())
    if ("draft" in low and ("not executed" in low or "discussion only" in low)) or "does not amend the executed agreement" in low:
        return -1
    if "not executed" in low or "unexecuted" in low:
        return -1
    if "executed amendment" in low or ("amendment" in low and "executed" in low):
        return 3
    if "original" in low or "master services agreement" in low or "master utility services agreement" in low:
        return 1
    return 2

def _amendment_order(text,page):
    m=re.search(r"(?i)amendment\s+(?:no\.?|number)?\s*([0-9]+)",text or "")
    return int(m.group(1)) if m else int(page or 0)

def _explicit_precedence_signal(text):
    return bool(re.search(r"(?i)\b(?:supersedes?|controlling|replaces?|amends? and restates?)\b",text or ""))

def _candidate(rule,value,p,excerpt):
    text=_contract_page_text(p)
    return {"rule":rule,"value":float(value),"page":int(p.get("page") or 0),"source":p.get("source"),
            "excerpt":excerpt[:300],"authority":_contract_authority(text),
            "amendment_order":_amendment_order(text,p.get("page")),
            "precedence_signal":_explicit_precedence_signal(text),
            "ocr_confidence":p.get("ocr_confidence"),"via":"contract_precedence"}

def _choose_governing(cands):
    valid=[c for c in cands if c["authority"]>=0]
    if not valid:return None,"no_executed_candidate"
    top_auth=max(c["authority"] for c in valid)
    top=[c for c in valid if c["authority"]==top_auth]
    values={round(float(c["value"]),10) for c in top}
    if len(values)==1:
        return sorted(top,key=lambda c:(c["amendment_order"],c["page"]))[-1],None
    signaled=[c for c in top if c["precedence_signal"]]
    if signaled:
        return sorted(signaled,key=lambda c:(c["amendment_order"],c["page"]))[-1],None
    return None,"conflicting_same_authority_terms"

def _apply_contract_precedence(rules,pages):
    labor=[];sub=[]
    for p in pages:
        text=" ".join(_contract_page_text(p).split())
        if not text:continue
        auth=_contract_authority(text)
        if auth<0:continue
        m=re.search(r"(?i)(?:multiplier|billing\s+factor)[^.]{0,140}?([0-9]+(?:\.[0-9]+)?)[^.]{0,180}?(?:actual\s+(?:hourly\s+)?(?:labor|payroll|salary)\s+rate|actual\s+hourly\s+rate)",text)
        if not m:
            mm=re.search(r"(?i)(?:overall\s+)?multiplier\s+(?:of|is|=)\s*([0-9]+(?:\.[0-9]+)?)",text)
            rel=re.search(r"(?i)(?:multiplier[^.]{0,120}?applied\s+to[^.]{0,80}?actual\s+(?:hourly\s+)?(?:labor|payroll|salary)\s+rate|actual\s+(?:hourly\s+)?(?:labor|payroll|salary)\s+rate[^.]{0,120}?multiplier)",text)
            if mm and rel:m=mm
        if m:
            labor.append(_candidate("labor_formula.payroll_multiplier",m.group(1),p,m.group(0)))
        sm=re.search(r"(?i)(?:subcontractor|subcontract)[^.\n|]{0,160}?(?:markup|mark[- ]?up|fixed\s+fee|fee)[^0-9]{0,80}([0-9]+(?:\.[0-9]+)?)\s*(?:%|percent)",text)
        if sm:
            sub.append(_candidate("subcontractor.markup_cap_pct",sm.group(1),p,sm.group(0)))
        for table in p.get("tables",[]) or []:
            for rr in table.get("rows",[]) or []:
                row=" | ".join(str(c or "") for c in rr.get("cells",[]) or [])
                if re.search(r"(?i)subcontract",row):
                    fm=re.search(r"([0-9]+(?:\.[0-9]+)?)\s*(?:%|percent)",row,re.I)
                    if fm:sub.append(_candidate("subcontractor.markup_cap_pct",fm.group(1),p,row))
    rules.setdefault("_contract_precedence",{})
    rules.setdefault("_superseded_evidence",[])
    for rule,cands,section,key in [
        ("labor_formula.payroll_multiplier",labor,"labor_formula","payroll_multiplier"),
        ("subcontractor.markup_cap_pct",sub,"subcontractor","markup_cap_pct")]:
        if not cands:continue
        chosen,problem=_choose_governing(cands)
        old=[e for e in rules.get("_evidence",[]) if e.get("rule")==rule]
        if old:rules["_superseded_evidence"].extend(old)
        rules["_evidence"]=[e for e in rules.get("_evidence",[]) if e.get("rule")!=rule]
        rules["_contract_precedence"][rule]={"candidates":cands,"status":"resolved" if chosen else "review","problem":problem}
        if chosen:
            rules.setdefault(section,{})[key]=chosen["value"]
            ev={k:chosen.get(k) for k in ("rule","value","source","page","excerpt","via","ocr_confidence") if chosen.get(k) is not None}
            rules["_evidence"].append(ev)
            rules["_contract_precedence"][rule]["governing"]=chosen
        else:
            rules.setdefault(section,{}).pop(key,None)
            rules["_unknown"].append(f"Conflicting contract terms require review before applying {rule}.")
    return rules

def extract_contract_rules(pages):
'''
replace_once(extract, precedence_anchor, precedence_helpers)

# Apply precedence only after all pages/tables have been parsed.
end_anchor = '''    if rules["_ocr_required_pages"]:rules["_unknown"].append(f"OCR required for pages: {rules['_ocr_required_pages']}")\n    return rules\n'''
end_replacement = '''    rules=_apply_contract_precedence(rules,pages)\n    rules["_ocr_required_pages"]=[p["page"] for p in pages if p.get("ocr_required")]\n    if rules["_ocr_required_pages"]:rules["_unknown"].append(f"OCR required for pages: {rules['_ocr_required_pages']}")\n    return rules\n'''
replace_once(extract, end_anchor, end_replacement)

# 3) Resolve OCR-required CONTRACT pages before contract-rule extraction. This intentionally
# OCRs only pages that ordinary PDF extraction marked unreadable; readable text remains the
# source of truth. OCR must meet a minimum confidence threshold before it can enter rules.
pipeline_import = '''from pathlib import Path\nfrom .ingest import ingest_document,ingest_csv\n'''
pipeline_import_new = '''from pathlib import Path\nimport subprocess,tempfile\nfrom .ingest import ingest_document,ingest_csv\nfrom .vision_ocr import TesseractVisionAdapter\n'''
replace_once(pipeline,pipeline_import,pipeline_import_new)

pipeline_anchor = '''def run_audit(contract_path,invoice_path,field_csv=None,ai_proposals=None,evidence_paths=None):\n    pages=ingest_document(contract_path);rules=extract_contract_rules(pages);a,rj=apply_ai(rules,pages,ai_proposals)\n'''
pipeline_new = r'''def _resolve_contract_ocr(contract_path,pages):
    p=Path(contract_path)
    needed=[pg for pg in pages if pg.get("ocr_required")]
    if p.suffix.lower()!=".pdf" or not needed:return pages
    adapter=TesseractVisionAdapter()
    for pg in needed:
        page_no=int(pg["page"])
        try:
            with tempfile.TemporaryDirectory(prefix="audit_contract_ocr_") as td:
                stem=Path(td)/"page"
                r=subprocess.run(["pdftoppm","-f",str(page_no),"-l",str(page_no),"-singlefile","-png","-r","220",str(p),str(stem)],capture_output=True,text=True)
                if r.returncode:continue
                img=Path(str(stem)+".png")
                if not img.exists():continue
                ocr=adapter.extract_image(img,page=page_no)
                conf=float(ocr.get("mean_confidence") or 0)
                text=ocr.get("text") or ""
                if conf>=80.0 and len(text.strip())>=20:
                    pg["text"]=text
                    pg["ocr_required"]=False
                    pg["ocr_confidence"]=conf
                    pg["ocr_engine"]=ocr.get("engine","tesseract")
        except Exception:
            continue
    return pages

def run_audit(contract_path,invoice_path,field_csv=None,ai_proposals=None,evidence_paths=None):
    pages=ingest_document(contract_path);pages=_resolve_contract_ocr(contract_path,pages);rules=extract_contract_rules(pages);a,rj=apply_ai(rules,pages,ai_proposals)
'''
replace_once(pipeline,pipeline_anchor,pipeline_new)

# 4) Formula-derived labor billing from independent payroll evidence.
labor_anchor = '''    # Field/backup evidence reconciliation. These findings require explicit matched records.\n'''
labor_insert = '''    # Formula-derived labor billing from independent payroll evidence.\n    mult=rules.get('labor_formula',{}).get('payroll_multiplier')\n    if mult is not None:\n        for inv in invoices:\n            if not isinstance(inv.get('hours'),(int,float)) or not isinstance(inv.get('rate'),(int,float)):\n                continue\n            payroll_rates=[]\n            for ev in inv.get('_support_evidence') or []:\n                vals=ev.get('values') or {}\n                r=vals.get('rate')\n                if isinstance(r,(int,float)):\n                    payroll_rates.append(float(r))\n            if len(payroll_rates)==1:\n                allowed=payroll_rates[0]*float(mult); billed=float(inv['rate']); h=float(inv['hours'])\n                if billed>allowed+1e-9:\n                    add(f,'RATE_MISMATCH','OVERBILLED',(billed-allowed)*h,f"Formula labor rate: payroll ${payroll_rates[0]:.4f}/hr x {float(mult):g} = ${allowed:.4f}/hr; billed ${billed:.4f}/hr for {h:g} hours.",inv['_evidence'],cev(rules,'labor_formula.payroll_multiplier'),(inv.get('_support_evidence') or [None])[0])\n\n    # Field/backup evidence reconciliation. These findings require explicit matched records.\n'''
replace_once(core, labor_anchor, labor_insert)

# 5) Duplicate safety: stable invoice+line identity required for automatic HIGH duplicate.
old_dup = '''    # Duplicates and unsupported charges.\n    seen={}\n    for inv in invoices:\n        sig=(inv.get('vendor'),inv.get('service_date'),inv.get('description'),inv.get('amount'))\n        if all(x not in (None,'') for x in sig):\n            if sig in seen:add(f,'DUPLICATE_CHARGE','OVERBILLED',float(inv.get('amount',0) or 0),'Possible duplicate charge.',inv['_evidence'])\n            else:seen[sig]=inv['_evidence']\n'''
new_dup = '''    # Duplicates: HIGH-confidence automatic recovery requires a repeated stable line identity.\n    # Repeated vendor/date/description/amount alone is common in legitimate labor billing and is not enough.\n    seen={}\n    for inv in invoices:\n        line_id=inv.get('id')\n        invoice_id=inv.get('invoice_id')\n        sig=(invoice_id,line_id) if invoice_id not in (None,'') and line_id not in (None,'') else None\n        if sig is not None:\n            if sig in seen:\n                add(f,'DUPLICATE_CHARGE','OVERBILLED',float(inv.get('amount',0) or 0),'Duplicate invoice-line identity detected.',inv['_evidence'])\n            else:\n                seen[sig]=inv['_evidence']\n'''
replace_once(core, old_dup, new_dup)

# 6) Conservative evidence resolution.
old_support = '''            for target,src in [('work_authorized','authorized'),('accepted','accepted'),('supported','supported')]:\n                vals={r[src] for r in candidates if src in r}\n                if len(vals)==1:inv[target]=vals.pop()\n'''
new_support = '''            for target,src in [('work_authorized','authorized'),('accepted','accepted')]:\n                vals={r[src] for r in candidates if src in r}\n                if len(vals)==1:inv[target]=vals.pop()\n            support_vals={r['supported'] for r in candidates if 'supported' in r}\n            # Conservative evidence resolution: only unanimous affirmative HIGH-confidence\n            # support can clear a documentation gap. Explicit negative, conflict, or absence\n            # of an affirmative support value never auto-clears the invoice line.\n            if support_vals=={True}:\n                inv['supported']=True\n            elif False in support_vals:\n                inv['supported']=False\n'''
replace_once(evidence, old_support, new_support)

for p in (core, extract, evidence, pipeline):
    compile(p.read_text(), str(p), 'exec')
print('Applied Audit hardening including contract OCR + precedence successfully')
