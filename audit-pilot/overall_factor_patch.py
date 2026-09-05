from pathlib import Path
import sys

root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('/app')
extract = root / 'audit_engine' / 'extract.py'
text = extract.read_text()

replacements = [
(
'''        m=re.search(r"(?i)(?:multiplier|billing\\s+factor)[^.]{0,120}?([0-9]+(?:\\.[0-9]+)?)[^.]{0,160}?(?:applied\\s+to|times|x|multiplied\\s+by)?[^.]{0,80}?(?:actual\\s+(?:hourly\\s+)?(?:labor|payroll|salary)\\s+rate|actual\\s+hourly\\s+rate)",text)\n''',
'''        m=re.search(r"(?i)(?:multiplier|billing\\s+factor|(?:overall|adjustment|loaded)\\s+factor)[^.]{0,120}?([0-9]+(?:\\.[0-9]+)?)[^.]{0,160}?(?:applied\\s+to|times|x|multiplied\\s+by)?[^.]{0,80}?(?:actual\\s+(?:hourly\\s+)?(?:labor|payroll|salary)\\s+rate|actual\\s+hourly\\s+rate|(?:hourly\\s+raw|raw\\s+hourly)\\s+salary\\s+rate)",text)\n'''
),
(
'''            m=re.search(r"(?i)(?:actual\\s+(?:hourly\\s+)?(?:labor|payroll|salary)\\s+rate|actual\\s+hourly\\s+rate)[^.]{0,160}?(?:multiplied\\s+by|times|x|multiplier\\s+(?:of|is)?)[^0-9]{0,30}([0-9]+(?:\\.[0-9]+)?)",text)\n''',
'''            m=re.search(r"(?i)(?:actual\\s+(?:hourly\\s+)?(?:labor|payroll|salary)\\s+rate|actual\\s+hourly\\s+rate|(?:hourly\\s+raw|raw\\s+hourly)\\s+salary\\s+rate)[^.]{0,160}?(?:multiplied\\s+by|times|x|(?:adjusted\\s+by\\s+(?:an?\\s+)?)?(?:overall\\s+|adjustment\\s+|loaded\\s+)?(?:factor|multiplier)\\s*(?:of|is|=)?)[^0-9]{0,30}([0-9]+(?:\\.[0-9]+)?)",text)\n'''
),
(
'''            mm=re.search(r"(?i)(?:overall\\s+)?multiplier\\s+(?:of|is|=)\\s*([0-9]+(?:\\.[0-9]+)?)",text)\n''',
'''            mm=re.search(r"(?i)(?:(?:overall|adjustment|loaded)\\s+factor|(?:overall\\s+)?multiplier)\\s+(?:of|is|=)\\s*([0-9]+(?:\\.[0-9]+)?)",text)\n'''
),
(
'''            relation=re.search(r"(?i)(?:the\\s+)?multiplier\\s+is\\s+applied\\s+to\\s+the\\s+actual\\s+(?:hourly\\s+)?(?:labor|payroll|salary)\\s+rate|(?:actual\\s+(?:hourly\\s+)?(?:labor|payroll|salary)\\s+rate)[^.]{0,100}?(?:times|multiplier)",text)\n''',
'''            relation=re.search(r"(?i)(?:(?:the\\s+)?(?:multiplier|(?:overall|adjustment|loaded)\\s+factor)\\s+is\\s+applied\\s+to\\s+the\\s+(?:actual\\s+(?:hourly\\s+)?(?:labor|payroll|salary)\\s+rate|(?:hourly\\s+raw|raw\\s+hourly)\\s+salary\\s+rate)|(?:actual\\s+(?:hourly\\s+)?(?:labor|payroll|salary)\\s+rate|(?:hourly\\s+raw|raw\\s+hourly)\\s+salary\\s+rate)[^.]{0,120}?(?:times|multiplier|adjusted\\s+by[^.]{0,30}?factor))",text)\n'''
),
(
'''        m=re.search(r"(?i)(?:multiplier|billing\\s+factor)[^.]{0,140}?([0-9]+(?:\\.[0-9]+)?)[^.]{0,180}?(?:actual\\s+(?:hourly\\s+)?(?:labor|payroll|salary)\\s+rate|actual\\s+hourly\\s+rate)",text)\n''',
'''        m=re.search(r"(?i)(?:multiplier|billing\\s+factor|(?:overall|adjustment|loaded)\\s+factor)[^.]{0,140}?([0-9]+(?:\\.[0-9]+)?)[^.]{0,180}?(?:actual\\s+(?:hourly\\s+)?(?:labor|payroll|salary)\\s+rate|actual\\s+hourly\\s+rate|(?:hourly\\s+raw|raw\\s+hourly)\\s+salary\\s+rate)",text)\n'''
),
(
'''            mm=re.search(r"(?i)(?:overall\\s+)?multiplier\\s+(?:of|is|=)\\s*([0-9]+(?:\\.[0-9]+)?)",text)\n            rel=re.search(r"(?i)(?:multiplier[^.]{0,120}?applied\\s+to[^.]{0,80}?actual\\s+(?:hourly\\s+)?(?:labor|payroll|salary)\\s+rate|actual\\s+(?:hourly\\s+)?(?:labor|payroll|salary)\\s+rate[^.]{0,120}?multiplier)",text)\n            if mm and rel:m=mm\n''',
'''            mm=re.search(r"(?i)(?:(?:overall|adjustment|loaded)\\s+factor|(?:overall\\s+)?multiplier)\\s+(?:of|is|=)\\s*([0-9]+(?:\\.[0-9]+)?)",text)\n            rel=re.search(r"(?i)(?:(?:multiplier|(?:overall|adjustment|loaded)\\s+factor)[^.]{0,140}?applied\\s+to[^.]{0,80}?(?:actual\\s+(?:hourly\\s+)?(?:labor|payroll|salary)\\s+rate|(?:hourly\\s+raw|raw\\s+hourly)\\s+salary\\s+rate)|(?:actual\\s+(?:hourly\\s+)?(?:labor|payroll|salary)\\s+rate|(?:hourly\\s+raw|raw\\s+hourly)\\s+salary\\s+rate)[^.]{0,160}?(?:multiplier|adjusted\\s+by[^.]{0,40}?factor))",text)\n            if mm and rel:m=mm\n        if not m:\n            m=re.search(r"(?i)(?:actual\\s+(?:hourly\\s+)?(?:labor|payroll|salary)\\s+rate|(?:hourly\\s+raw|raw\\s+hourly)\\s+salary\\s+rate)[^.]{0,180}?adjusted\\s+by\\s+(?:an?\\s+)?(?:overall\\s+|adjustment\\s+|loaded\\s+)?factor\\s+(?:of\\s+)?([0-9]+(?:\\.[0-9]+)?)",text)\n'''
),
]

for old,new in replacements:
    if old not in text:
        raise SystemExit('overall-factor patch target not found: '+old[:100])
    text=text.replace(old,new,1)

extract.write_text(text)
compile(text,str(extract),'exec')
print('Applied narrow overall-factor labor-language patch successfully')
