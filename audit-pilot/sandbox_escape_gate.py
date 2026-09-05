from pathlib import Path
import json, tempfile
from sealed_room import run_sandbox_escape_probe

with tempfile.TemporaryDirectory() as td:
    p=Path(td)/'original.txt'; p.write_text('ORIGINAL EVIDENCE ONLY',encoding='utf-8')
    r=run_sandbox_escape_probe(str(p))
    print(json.dumps(r,indent=2))
    assert r['ok'] is True,r
    assert r['returncode']==0,r
    assert r['source_files']==['SOURCE-0001.txt'],r
    assert all(v is False for v in r['attempts'].values()),r
print('DISPOSABLE_SANDBOX_ESCAPE_GATE_PASS')
