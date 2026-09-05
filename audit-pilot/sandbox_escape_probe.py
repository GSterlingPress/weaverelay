from __future__ import annotations
import json, os, socket, subprocess, sys
from pathlib import Path


def _try_read(path: str) -> bool:
    try:
        Path(path).read_bytes(); return True
    except Exception:
        return False


def main() -> int:
    room=Path('/work')
    source_files=sorted(p.name for p in room.glob('SOURCE-*'))
    attempts={
        'peer_marker_visible': _try_read('/peer/PEER-RESULT.json') or _try_read('/tmp/PEER-RESULT.json'),
        'parent_marker_visible': _try_read('/parent/PARENT-SECRET.txt') or _try_read('/tmp/PARENT-SECRET.txt'),
        'host_root_visible': _try_read('/host/etc/hostname'),
        'docker_socket_visible': Path('/var/run/docker.sock').exists(),
        'parent_env_visible': bool(os.environ.get('ZERO_DAVE_PARENT_SECRET')),
        'other_process_visible': False,
        'network_connect_succeeded': False,
    }
    try:
        ps=subprocess.run(['ps','-eo','pid,comm'],capture_output=True,text=True,timeout=5)
        lines=[x for x in ps.stdout.splitlines()[1:] if x.strip()]
        attempts['other_process_visible']=len(lines)>2
    except Exception:
        pass
    try:
        s=socket.socket(); s.settimeout(1); s.connect(('1.1.1.1',53)); attempts['network_connect_succeeded']=True; s.close()
    except Exception:
        pass
    out={'source_files':source_files,'attempts':attempts,'ok':len(source_files)>=1 and not any(attempts.values())}
    Path('/work/ESCAPE-RESULT.json').write_text(json.dumps(out),encoding='utf-8')
    return 0 if out['ok'] else 1

if __name__=='__main__': raise SystemExit(main())
