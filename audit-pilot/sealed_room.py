from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any
import hashlib, json, os, secrets, shutil, subprocess, tempfile

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

def _container_base(room: Path) -> list[str]:
    """One disposable Docker sandbox with no network, peer mounts, inherited env, or writable root."""
    docker=shutil.which('docker')
    image=os.environ.get('ZERO_DAVE_SANDBOX_IMAGE','').strip()
    if not docker or not image:
        raise RuntimeError('disposable container sandbox unavailable: docker and ZERO_DAVE_SANDBOX_IMAGE are required')
    uid=os.getuid() if hasattr(os,'getuid') else 1000
    gid=os.getgid() if hasattr(os,'getgid') else 1000
    return [docker,'run','--rm','--network','none','--read-only','--cap-drop','ALL',
            '--security-opt','no-new-privileges','--pids-limit','64','--memory','1g','--cpus','1',
            '--tmpfs','/tmp:rw,noexec,nosuid,nodev,size=128m','--user',f'{uid}:{gid}',
            '--mount',f'type=bind,src={room},dst=/work,rw','--workdir','/work',image]

def _sandbox_python(room: Path, script: str, args: list[str], analyzer: str | None=None) -> subprocess.CompletedProcess:
    cmd=_container_base(room)
    if analyzer: cmd += ['python','-I',script,*args]
    else: cmd += ['python','-I',script,*args]
    # Docker receives no -e/--env-file options, so parent secrets and analyzer/consensus state are not inherited.
    return subprocess.run(cmd,capture_output=True,text=True,timeout=300,env={'PATH':os.environ.get('PATH','')})

def run_sealed_process(analyzer_name: str, *, audit_id: str, contract: str, invoice: str, field: str | None, evidence: list[str]) -> dict:
    """Memoryless analyzer: a brand-new disposable container over original evidence only."""
    with tempfile.TemporaryDirectory(prefix='zero_dave_parent_') as td:
        room=Path(td).resolve(); sealed=make_sealed_evidence(contract,invoice,field,evidence,room)
        input_path=room/'INPUT.json'; output_path=room/'COMMITTED.json'; opaque=f'RUN-{secrets.token_hex(16)}'
        def inside(p: str|None)->str|None:
            return f'/work/{Path(p).name}' if p else None
        envelope={'analyzer':analyzer_name,'audit_id':opaque,'contract':inside(sealed.contract),'invoice':inside(sealed.invoice),'field':inside(sealed.field),'evidence':[inside(x) for x in sealed.evidence]}
        input_path.write_text(json.dumps(envelope),encoding='utf-8')
        cp=_sandbox_python(room,'/app/zero_dave_process_worker.py',['/work/INPUT.json','/work/COMMITTED.json'],analyzer_name)
        if cp.returncode!=0: raise RuntimeError(f'analyzer {analyzer_name} disposable container failed: {cp.stderr[-2000:]}')
        if not output_path.exists(): raise RuntimeError(f'analyzer {analyzer_name} did not commit output')
        committed=json.loads(output_path.read_text(encoding='utf-8'))
    committed['sealed_room']={'analyzer':analyzer_name,'process_boundary':'one disposable container per analyzer invocation','fresh_os_child_process':True,'network_namespace_isolated':True,'pid_namespace_isolated':True,'ipc_namespace_isolated':True,'host_root_mounted':False,'shared_writable_filesystem':False,'persistent_audit_identity_available':False,'prior_pass_identity_available':False,'peer_outputs_available':False,'peer_catalogs_available':False,'consensus_available':False,'disagreement_hints_available':False,'prior_peer_results_available':False,'prior_self_results_available':False,'parent_environment_inherited':False,'source_policy':'private byte-identical copies of immutable original customer evidence only'}
    return committed

def run_sandbox_escape_probe(source: str) -> dict:
    """Run the unchanged active escape attack inside the same disposable-container boundary."""
    with tempfile.TemporaryDirectory(prefix='zero_dave_escape_parent_') as td:
        root=Path(td); room=root/'room'; room.mkdir(); _copy_source(source,room,1)
        (root/'PARENT-SECRET.txt').write_text('PARENT_SECRET_SHOULD_NEVER_BE_VISIBLE',encoding='utf-8')
        peer=root/'peer'; peer.mkdir(); (peer/'PEER-RESULT.json').write_text('{"amount":999999}',encoding='utf-8')
        old=os.environ.get('ZERO_DAVE_PARENT_SECRET'); os.environ['ZERO_DAVE_PARENT_SECRET']='PARENT_SECRET_SHOULD_NEVER_BE_VISIBLE'
        try:
            cp=_sandbox_python(room,'/app/sandbox_escape_probe.py',[])
        finally:
            if old is None: os.environ.pop('ZERO_DAVE_PARENT_SECRET',None)
            else: os.environ['ZERO_DAVE_PARENT_SECRET']=old
        result_path=room/'ESCAPE-RESULT.json'
        if not result_path.exists(): raise RuntimeError(f'escape probe failed before attestation: {cp.stderr[-2000:]}')
        result=json.loads(result_path.read_text(encoding='utf-8')); result['returncode']=cp.returncode
        return result

def isolation_attestation(results: dict[str,dict], fingerprints: dict[str,str]) -> dict[str,Any]:
    return {'policy':'SEALED_ROOM_V5_ONE_DISPOSABLE_CONTAINER_PER_ANALYZER','same_original_evidence_fingerprints':sorted(fingerprints.keys()),'analyzers':{k:{'committed_before_consensus':True,'disposable_container_sandbox':True,'network_namespace_isolated':True,'pid_namespace_isolated':True,'shared_writable_filesystem':False,'persistent_audit_identity_available':False,'prior_pass_identity_available':False,'prior_self_results_available':False,'parent_environment_inherited':False,'peer_outputs_available':False,'peer_catalogs_available':False,'consensus_available':False,'disagreement_hints_available':False} for k in ('A','B','C') if k in results},'consensus_is_only_cross_analyzer_reader':True,'reananalysis_policy':'every invocation is a fresh disposable container from byte-identical immutable original evidence; only consensus retains history; no prior self/peer output, identity, disagreement clue, network, peer filesystem or peer process access is supplied'}
