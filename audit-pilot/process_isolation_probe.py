from __future__ import annotations
import json, os, subprocess, sys, tempfile
from pathlib import Path

MARKER="PEER_RESULT_MARKER"

def main():
    worker=Path(__file__).with_name("process_isolation_probe_worker.py").resolve()
    results={}
    with tempfile.TemporaryDirectory() as td:
        parent=Path(td)
        (parent/"peer-result.json").write_text(json.dumps({"marker":MARKER}),encoding="utf-8")
        os.environ["PARENT_PEER_MARKER"]=MARKER
        for analyzer in ("A","B","C"):
            with tempfile.TemporaryDirectory() as rd:
                room=Path(rd)
                src=room/"SOURCE.txt"; src.write_text("neutral evidence",encoding="utf-8")
                inp=room/"INPUT.json"; out=room/"OUTPUT.json"
                inp.write_text(json.dumps({"analyzer":analyzer,"sources":[str(src)]}),encoding="utf-8")
                env={"PATH":os.environ.get("PATH",""),"ZERO_DAVE_ANALYZER":analyzer}
                cp=subprocess.run([sys.executable,"-I",str(worker),str(inp),str(out)],cwd=str(room),env=env,capture_output=True,text=True,timeout=30)
                assert cp.returncode==0,(analyzer,cp.stderr)
                r=json.loads(out.read_text(encoding="utf-8"))
                assert not r["peer_marker_visible"],r
                assert not r["peer_file_in_room"],r
                results[analyzer]=r
    print(json.dumps({"ok":True,"policy":"SEALED_ROOM_V2_CHILD_PROCESS","analyzers":results},indent=2))

if __name__=="__main__": main()
