from pathlib import Path
import sys

root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('/app')
core = root / 'audit_engine' / 'core.py'
extract = root / 'audit_engine' / 'extract.py'
evidence = root / 'audit_engine' / 'evidence.py'


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
formula_insert = '''        # Formula-derived labor pricing. Only explicit multiplier language becomes a rule.\n        m=re.search(r"(?i)(?:multiplier|billing\\s+factor)[^.]{0,120}?([0-9]+(?:\\.[0-9]+)?)[^.]{0,160}?(?:applied\\s+to|times|x|multiplied\\s+by)?[^.]{0,80}?(?:actual\\s+(?:hourly\\s+)?(?:labor|payroll|salary)\\s+rate|actual\\s+hourly\\s+rate)",text)\n        if not m:\n            m=re.search(r"(?i)(?:actual\\s+(?:hourly\\s+)?(?:labor|payroll|salary)\\s+rate|actual\\s+hourly\\s+rate)[^.]{0,160}?(?:multiplied\\s+by|times|x|multiplier\\s+(?:of|is)?)[^0-9]{0,30}([0-9]+(?:\\.[0-9]+)?)",text)\n        if m:\n            v=float(m.group(1));rules["labor_formula"]["payroll_multiplier"]=v;add_ev(rules,"labor_formula.payroll_multiplier",v,p,m.group(0))\n\n        # Utility-specific commercial controls. Only explicit clauses become rules.\n'''
replace_once(extract, formula_anchor, formula_insert)

old_sub = '''        m=re.search(r"(?i)(?:subcontractor|subcontract)[^.]{0,100}?(?:markup|mark[- ]?up)[^0-9]{0,30}(?:not\\s+to\\s+exceed|maximum|capped?\\s+at|of)?\\s*([0-9]+(?:\\.[0-9]+)?)\\s*%",text)\n        if m:\n            v=float(m.group(1));rules["subcontractor"]["markup_cap_pct"]=v;add_ev(rules,"subcontractor.markup_cap_pct",v,p,m.group(0))\n'''
new_sub = '''        m=re.search(r"(?i)(?:subcontractor|subcontract)[^.]{0,120}?(?:markup|mark[- ]?up|fixed\\s+fee|fee)[^0-9]{0,50}(?:should\\s+(?:only\\s+)?be|shall\\s+(?:only\\s+)?be|not\\s+to\\s+exceed|maximum|capped?\\s+at|limited\\s+to|of|is)?\\s*([0-9]+(?:\\.[0-9]+)?)\\s*(?:%|percent)",text)\n        if m:\n            v=float(m.group(1));rules["subcontractor"]["markup_cap_pct"]=v;add_ev(rules,"subcontractor.markup_cap_pct",v,p,m.group(0))\n'''
replace_once(extract, old_sub, new_sub)

labor_anchor = '''    # Field/backup evidence reconciliation. These findings require explicit matched records.\n'''
labor_insert = '''    # Formula-derived labor billing from independent payroll evidence.\n    mult=rules.get('labor_formula',{}).get('payroll_multiplier')\n    if mult is not None:\n        for inv in invoices:\n            if not isinstance(inv.get('hours'),(int,float)) or not isinstance(inv.get('rate'),(int,float)):\n                continue\n            payroll_rates=[]\n            for ev in inv.get('_support_evidence') or []:\n                vals=ev.get('values') or {}\n                r=vals.get('rate')\n                if isinstance(r,(int,float)):\n                    payroll_rates.append(float(r))\n            if len(payroll_rates)==1:\n                allowed=payroll_rates[0]*float(mult); billed=float(inv['rate']); h=float(inv['hours'])\n                if billed>allowed+1e-9:\n                    add(f,'RATE_MISMATCH','OVERBILLED',(billed-allowed)*h,f"Formula labor rate: payroll ${payroll_rates[0]:.4f}/hr x {float(mult):g} = ${allowed:.4f}/hr; billed ${billed:.4f}/hr for {h:g} hours.",inv['_evidence'],cev(rules,'labor_formula.payroll_multiplier'),(inv.get('_support_evidence') or [None])[0])\n\n    # Field/backup evidence reconciliation. These findings require explicit matched records.\n'''
replace_once(core, labor_anchor, labor_insert)

old_dup = '''    # Duplicates and unsupported charges.\n    seen={}\n    for inv in invoices:\n        sig=(inv.get('vendor'),inv.get('service_date'),inv.get('description'),inv.get('amount'))\n        if all(x not in (None,'') for x in sig):\n            if sig in seen:add(f,'DUPLICATE_CHARGE','OVERBILLED',float(inv.get('amount',0) or 0),'Possible duplicate charge.',inv['_evidence'])\n            else:seen[sig]=inv['_evidence']\n'''
new_dup = '''    # Duplicates: HIGH-confidence automatic recovery requires a repeated stable line identity.\n    # Repeated vendor/date/description/amount alone is common in legitimate labor billing and is not enough.\n    seen={}\n    for inv in invoices:\n        line_id=inv.get('id')\n        invoice_id=inv.get('invoice_id')\n        sig=(invoice_id,line_id) if invoice_id not in (None,'') and line_id not in (None,'') else None\n        if sig is not None:\n            if sig in seen:\n                add(f,'DUPLICATE_CHARGE','OVERBILLED',float(inv.get('amount',0) or 0),'Duplicate invoice-line identity detected.',inv['_evidence'])\n            else:\n                seen[sig]=inv['_evidence']\n'''
replace_once(core, old_dup, new_dup)

old_support = '''            for target,src in [('work_authorized','authorized'),('accepted','accepted'),('supported','supported')]:\n                vals={r[src] for r in candidates if src in r}\n                if len(vals)==1:inv[target]=vals.pop()\n'''
new_support = '''            for target,src in [('work_authorized','authorized'),('accepted','accepted')]:\n                vals={r[src] for r in candidates if src in r}\n                if len(vals)==1:inv[target]=vals.pop()\n            support_vals={r['supported'] for r in candidates if 'supported' in r}\n            if support_vals=={False}:\n                inv['supported']=False\n            elif True in support_vals or (inv.get('support_required') and candidates):\n                # A HIGH-confidence matched supporting record resolves a documentation gap unless it explicitly says unsupported.\n                inv['supported']=True\n'''
replace_once(evidence, old_support, new_support)

for p in (core, extract, evidence):
    compile(p.read_text(), str(p), 'exec')
print('Applied four-failure Audit hardening successfully')
