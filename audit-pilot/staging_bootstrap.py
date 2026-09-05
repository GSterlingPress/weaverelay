from __future__ import annotations
import base64, os, shutil, ssl, subprocess, sys, tarfile, urllib.request
from pathlib import Path

REPO='GSterlingPress/weaverelay'
COMMIT=os.environ.get('ZERO_DAVE_COMMIT','').strip()
if not COMMIT:
    raise RuntimeError('ZERO_DAVE_COMMIT is required')
SOURCE_URL=f'https://github.com/{REPO}/archive/{COMMIT}.tar.gz'
CTX=ssl._create_unverified_context()

print(f'ZERO_DAVE_BOOTSTRAP_START commit={COMMIT}',flush=True)
work=Path('/tmp/zero-dave-bootstrap'); shutil.rmtree(work,ignore_errors=True); work.mkdir(parents=True)
tgz=work/'source.tar.gz'
with urllib.request.urlopen(SOURCE_URL,context=CTX,timeout=120) as r:
    tgz.write_bytes(r.read())
print(f'ZERO_DAVE_SOURCE_BYTES {tgz.stat().st_size}',flush=True)
with tarfile.open(tgz,'r:gz') as tf: tf.extractall(work)
roots=[p for p in work.iterdir() if p.is_dir() and p.name.startswith('weaverelay-')]
if len(roots)!=1: raise RuntimeError(f'unexpected source roots: {roots}')
src=roots[0]/'audit-pilot'
app=Path('/app'); shutil.rmtree(app,ignore_errors=True); app.mkdir(parents=True)

encoded=b''.join(p.read_bytes() for p in sorted(src.glob('runtime.*')))
archive=work/'audit-runtime.tar.xz'; archive.write_bytes(base64.b64decode(encoded))
with tarfile.open(archive,'r:xz') as tf: tf.extractall(app)
print('ZERO_DAVE_RUNTIME_EXTRACTED',flush=True)

subprocess.check_call([sys.executable,str(src/'hardening_patch.py'),str(app)])
subprocess.check_call([sys.executable,str(src/'overall_factor_patch.py'),str(app)])
for name in ('source_registry.py','consensus.py','financial_catalog.py','analyzer_b.py','analyzer_c.py','zero_dave_orchestrator.py','customer_reports.py','zero_dave_app.py'):
    shutil.copy2(src/name,app/name)
print('ZERO_DAVE_PATCHED',flush=True)

subprocess.check_call([sys.executable,'-m','pip','install','--no-cache-dir','--trusted-host','pypi.org','--trusted-host','files.pythonhosted.org','-r',str(app/'requirements.txt'),'reportlab','pillow','pillow-heif','extract-msg','pypdf','openpyxl','httpx'])
print('ZERO_DAVE_DEPS_READY',flush=True)
os.chdir(app)
port=os.getenv('PORT','8080')
os.execvp(sys.executable,[sys.executable,'-m','uvicorn','zero_dave_app:app','--host','0.0.0.0','--port',port,'--workers','1'])
