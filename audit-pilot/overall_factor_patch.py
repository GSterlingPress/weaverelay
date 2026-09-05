from pathlib import Path
import sys

root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('/app')
extract = root / 'audit_engine' / 'extract.py'
text = extract.read_text()

# Narrow real-contract fallback only. The Broward agreement says the hourly raw
# salary rate is "adjusted by an overall factor of 2.99". We require the salary/
# payroll relationship and the explicit overall-factor wording in the same clause.
formula_anchor = '''            if mm and relation:\n                m=mm\n        if m:\n'''
formula_insert = '''            if mm and relation:\n                m=mm\n        if not m:\n            m=re.search(r"(?i)(?:(?:hourly\\s+raw|raw\\s+hourly)\\s+salary\\s+rate|actual\\s+(?:hourly\\s+)?(?:labor|payroll|salary)\\s+rate)[^.]{0,180}?adjusted\\s+by\\s+(?:an?\\s+)?overall\\s+factor\\s+(?:of\\s+)?([0-9]+(?:\\.[0-9]+)?)",text)\n        if m:\n'''
if formula_anchor not in text:
    raise SystemExit('primary overall-factor insertion target not found')
text=text.replace(formula_anchor,formula_insert,1)

precedence_anchor = '''            if mm and rel:m=mm\n        if m:\n            labor.append(_candidate("labor_formula.payroll_multiplier",m.group(1),p,m.group(0)))\n'''
precedence_insert = '''            if mm and rel:m=mm\n        if not m:\n            m=re.search(r"(?i)(?:(?:hourly\\s+raw|raw\\s+hourly)\\s+salary\\s+rate|actual\\s+(?:hourly\\s+)?(?:labor|payroll|salary)\\s+rate)[^.]{0,180}?adjusted\\s+by\\s+(?:an?\\s+)?overall\\s+factor\\s+(?:of\\s+)?([0-9]+(?:\\.[0-9]+)?)",text)\n        if m:\n            labor.append(_candidate("labor_formula.payroll_multiplier",m.group(1),p,m.group(0)))\n'''
if precedence_anchor not in text:
    raise SystemExit('precedence overall-factor insertion target not found')
text=text.replace(precedence_anchor,precedence_insert,1)

extract.write_text(text)
compile(text,str(extract),'exec')
print('Applied narrow overall-factor labor-language fallback successfully')
