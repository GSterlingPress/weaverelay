from pathlib import Path
import re


def _canon(v):
    return re.sub(r'[^a-z0-9]+','_',str(v or '').lower()).strip('_')


def _record_key(r):
    vals=tuple(sorted((k,str(v)) for k,v in r.items() if k not in {'extraction_confidence'}))
    return vals


def _multi_semantic_pdf(path):
    """Extract every independently-supported semantic evidence family from a PDF.

    A document's UI classification is routing/help metadata, not a destructive schema.
    One physical document may therefore emit mileage, contractor-backup, equipment,
    work-order, completion and timesheet evidence simultaneously.
    """
    import pdfplumber
    p=Path(path); out=[]
    with pdfplumber.open(p) as pdf:
        for pno,page in enumerate(pdf.pages,1):
            text=page.extract_text() or ''
            lines=[x.strip() for x in text.splitlines() if x.strip()]
            current_wo=None
            for line in lines:
                wm=re.search(r'\bWO-[0-9A-Z-]+\b',line,re.I)
                line_wo=wm.group(0).upper() if wm else current_wo
                low=line.lower()
                if wm and any(x in low for x in ('work order','mileage','completion','subcontract','traffic','vendor','third-party','third party')):
                    current_wo=wm.group(0).upper(); line_wo=current_wo

                # Third-party/subcontract support: line-local WO wins, so mixed docs do not
                # need to be classified as a subcontractor invoice to contribute cost proof.
                if line_wo and '$' in line and re.search(r'(?i)traffic|subcontract|third[- ]party|vendor',line):
                    am=re.search(r'\$\s*([0-9][0-9,]*(?:\.\d{2})?)',line)
                    if am:
                        out.append({'source':p.name,'page':pno,'record_type':'contractor_backup','work_order_id':line_wo,'description':line,'amount':float(am.group(1).replace(',','')),'supported':True,'extraction_confidence':'HIGH'})

                # Explicit unauthorized work can coexist with any other evidence family.
                if line_wo and re.search(r'(?i)\bnot authorized\b|\bunauthorized\b',line):
                    name=re.split(r'(?i)\bnot authorized\b|\bunauthorized\b',line,1)[0].strip(' :-')
                    out.append({'source':p.name,'page':pno,'record_type':'work_order','work_order_id':line_wo,'authorized':False,'equipment_key':_canon(name),'description':line,'extraction_confidence':'HIGH'})

            # Mileage sections are independently extracted even in a mixed support PDF.
            for mm in re.finditer(r'(?i)mileage\s+log\s*-?\s*(WO-[0-9A-Z-]+)',text):
                wo=mm.group(1).upper(); tail=text[mm.end():]
                next_header=re.search(r'(?im)^\s*(?:WO-[0-9A-Z-]+|[A-Z][A-Z /_-]{4,}:)\s*$',tail)
                section=tail[:next_header.start()] if next_header else tail
                totals=[float(x) for x in re.findall(r'(?im)^\s*TOTAL\s+(\d+(?:\.\d+)?)\s*$',section)]
                if totals:
                    out.append({'source':p.name,'page':pno,'record_type':'mileage_log','work_order_id':wo,'miles':max(totals),'supported':True,'extraction_confidence':'HIGH'})
    return out


def apply_v14():
    import audit_engine.relationship as rel
    import audit_engine.evidence as ev
    import v12_patch

    old_ingest=ev.ingest_evidence
    def ingest(paths):
        result=old_ingest(paths)
        records=result.setdefault('records',[])
        seen={_record_key(r) for r in records}
        for path in paths or []:
            if Path(path).suffix.lower()!='.pdf':
                continue
            for r in _multi_semantic_pdf(path):
                k=_record_key(r)
                if k not in seen:
                    records.append(r);seen.add(k)
        return result

    ev.ingest_evidence=ingest
    rel.ingest_evidence=ingest
    # V12 relationship code can retain a module-level reference.
    v12_patch._ingest_evidence=ingest
