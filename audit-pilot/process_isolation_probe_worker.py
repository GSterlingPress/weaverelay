from __future__ import annotations
import json, os, sys
from pathlib import Path

def main():
    inp=Path(sys.argv[1]); out=Path(sys.argv[2])
    envelope=json.loads(inp.read_text(encoding="utf-8"))
    marker_visible="PARENT_PEER_MARKER" in os.environ
    peer_file=any("peer-result" in p.name.lower() for p in Path.cwd().iterdir())
    result={"analyzer":envelope["analyzer"],"peer_marker_visible":marker_visible,"peer_file_in_room":peer_file,"source_count":len(envelope.get("sources") or []),"pid":os.getpid()}
    out.write_text(json.dumps(result),encoding="utf-8")

if __name__=="__main__": main()
