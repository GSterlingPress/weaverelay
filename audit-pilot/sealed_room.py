from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any
import hashlib, json, os, secrets, shutil, subprocess, sys, tempfile

@dataclass(frozen=True)
class SealedEvidence:
    contract: str; invoice: str; field: str | None; evidence: tuple[str, ...]

def _sha256(path: str) -> str:
    h=hashlib.sha256()
    with open(path,'rb') as f:
        for chunk in iter(lambda:f.read(1024*1024),b''): h.update(chunk)
    return h.hexdigest()

def source_fingerprints(contract: str, invoice: str, field: str | None, evidence: list[str]) -> dict[str,str]:
    paths=[contract,invoice]+([field] if field else [])+list(evidence)
    return {_sha256(p):Path(p).name for p in paths}

def _copy_source(src: str, room: Path, index: int) -> str:
    dst=room/f'SOURCE-{index:04d}{Path(src).suffix.lower()}'; shutil.copy2(src,dst); return str(dst)

def make_sealed_evidence(contract: str, invoice: str, field: str | None, evidence: list[str], room: Path) -> SealedEvidence:
    i=1; c=_copy_source(contract,room,i); i+=1; inv=_copy_source(invoice,room,i); i+=1; fld=None
    if field: fld=_copy_source(field,room,i); i+=1
    ev=[]
    for p in evidence: ev.append(_copy_source(p,room,i)); i+=1
    return SealedEvidence(c,inv,fld,tuple(ev))

def _bwrap_base(room: Path) -> list[str]:
    """Build a fail-closed Linux namespace sandbox.

    No host root is mounted. Only runtime libraries/binaries, read-only application code,
    and this invocation's private /work are visible. Network, PID, IPC, UTS and cgroup
    namespaces are unshared. /tmp and /dev are private. The sandbox disappears on exit.
    """
    bwrap=shutil.which('bwrap')
    if not bwrap: raise RuntimeError('disposable sandbox unavailable: bubblewrap is required')
    cmd=[bwrap,'--die-with-parent','--new-session','--unshare-user','--unshare-pid','--unshare-net','--unshare-ipc','--unshare-uts','--unshare-cgroup','--clearenv']
    for p in ('/usr','/bin','/lib','/lib64'):
        if Path(p).exists(): cmd += ['--ro-bind',p,p]
    # Minimal OS metadata required by Python/subprocess utilities; never mount host /tmp,/proc data or job storage.
    for p in ('/etc/ssl','/etc/ca-certificates','/etc/fonts','/etc/mime.types'):
        if Path(p).exists(): cmd += ['--ro-bind',p,p]
    app=Path(__file__).parent.resolve()
    cmd += ['--ro-bind',str(app),'/app','--bind',str(room),'/work','--tmpfs','/tmp','--dev','/dev','--proc','/proc','--chdir','/work',
            '--setenv','PATH','/usr/local/bin:/usr/bin:/bin','--setenv','PYTHONHASHSEED','0']
    return cmd

def _sandbox_python(room: Path, script: str, args: list[str], analyzer: str | None=None) -> subprocess.CompletedProcess:
    cmd=_bwrap_base(room)
    if analyzer: cmd += ['--setenv','ZERO_DAVE_ANALYZER',analyzer]
    cmd += [sys.executable,script,*args]
    return subprocess.run(cmd,capture_output=True,text=True,timeout=300,env={'PATH':os.environ.get('PATH','')})

def run_sealed_process(analyzer_name: str, *, audit_id: str, contract: str, invoice: str, field: str | None, evidence: list[str]) -> dict:
    """Memoryless analyzer in a disposable OS namespace sandbox over original evidence only."""
    with tempfile.TemporaryDirectory(prefix='zero_dave_parent_') as td:
        room=Path(td).resolve(); sealed=make_sealed_evidence(contract,invoice,field,evidence,room)
        input_path=room/'INPUT.json'; output_path=room/'COMMITTED.json'; opaque=f'RUN-{secrets.token_hex(16)}'
        def inside(p: str|None)->str|None:
            return f'/work/{Path(p).name}' if p else None
        envelope={'analyzer':analyzer_name,'audit_id':opaque,'contract':inside(sealed.contract),'invoice':inside(sealed.invoice),'field':inside(sealed.field),'evidence':[inside(x) for x in sealed.evidence]}
        input_path.write_text(json.dumps(envelope),encoding='utf-8')
        cp=_sandbox_python(room,'/app/zero_dave_process_worker.py',['/work/INPUT.json','/work/COMMITTED.json'],analyzer_name)
        if cp.returncode!=0: raise RuntimeError(f'analyzer {analyzer_name} disposable sandbox failed: {cp.stderr[-2000:]}')
        if not output_path.exists(): raise RuntimeError(f'analyzer {analyzer_name} did not commit output')
        committed=json.loads(output_path.read_text(encoding='utf-8'))
    committed['sealed_room']={'analyzer':analyzer_name,'process_boundary':'disposable Linux namespace sandbox','fresh_os_child_process':True,'network_namespace_isolated':True,'pid_namespace_isolated':True,'ipc_namespace_isolated':True,'host_root_mounted':False,'shared_writable_filesystem':False,'persistent_audit_identity_available':False,'prior_pass_identity_available':False,'peer_outputs_available':False,'peer_catalogs_available':False,'consensus_available':False,'disagreement_hints_available':False,'prior_peer_results_available':False,'prior_self_results_available':False,'parent_environment_inherited':False,'source_policy':'private byte-identical copies of immutable original customer evidence only'}
    return committed

def run_sandbox_escape_probe(source: str) -> dict:
    """Actively attempts peer/parent filesystem, environment, process and network escape."""
    app=Path(__file__).parent.resolve()
    with tempfile.TemporaryDirectory(prefix='zero_dave_escape_parent_') as td:
        root=Path(td); room=root/'room'; room.mkdir(); _copy_source(source,room,1)
        # Deliberate secrets outside the mounted room. A correct sandbox cannot see either.
        (root/'PARENT-SECRET.txt').write_text('PARENT_SECRET_SHOULD_NEVER_BE_VISIBLE',encoding='utf-8')
        peer=root/'peer'; peer.mkdir(); (peer/'PEER-RESULT.json').write_text('{"amount":999999}',encoding='utf-8')
        env=os.environ.copy(); env['ZERO_DAVE_PARENT_SECRET']='PARENT_SECRET_SHOULD_NEVER_BE_VISIBLE'
        cmd=_bwrap_base(room)+[sys.executable,'/app/sandbox_escape_probe.py']
        cp=subprocess.run(cmd,capture_output=True,text=True,timeout=60,env=env)
        result_path=room/'ESCAPE-RESULT.json'
        if not result_path.exists(): raise RuntimeError(f'escape probe failed before attestation: {cp.stderr[-2000:]}')
        result=json.loads(result_path.read_text(encoding='utf-8')); result['returncode']=cp.returncode
        return result

def isolation_attestation(results: dict[str,dict], fingerprints: dict[str,str]) -> dict[str,Any]:
    return {'policy':'SEALED_ROOM_V4_DISPOSABLE_SANDBOX','same_original_evidence_fingerprints':sorted(fingerprints.keys()),'analyzers':{k:{'committed_before_consensus':True,'disposable_namespace_sandbox':True,'network_namespace_isolated':True,'pid_namespace_isolated':True,'shared_writable_filesystem':False,'persistent_audit_identity_available':False,'prior_pass_identity_available':False,'prior_self_results_available':False,'parent_environment_inherited':False,'peer_outputs_available':False,'peer_catalogs_available':False,'consensus_available':False,'disagreement_hints_available':False} for k in ('A','B','C') if k in results},'consensus_is_only_cross_analyzer_reader':True,'reananalysis_policy':'every invocation is a fresh disposable sandbox from byte-identical immutable original evidence; only consensus retains history; no prior self/peer output, identity, disagreement clue, network, peer filesystem or peer process access is supplied'}
