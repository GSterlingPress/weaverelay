from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Any
import copy, hashlib, json, shutil, tempfile


@dataclass(frozen=True)
class SealedEvidence:
    contract: str
    invoice: str
    field: str | None
    evidence: tuple[str, ...]


def _sha256(path: str) -> str:
    h=hashlib.sha256()
    with open(path,'rb') as f:
        for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
    return h.hexdigest()


def source_fingerprints(contract:str,invoice:str,field:str|None,evidence:list[str])->dict[str,str]:
    paths=[contract,invoice]+([field] if field else [])+list(evidence)
    return {_sha256(p):Path(p).name for p in paths}


def _copy_source(src:str,room:Path,index:int)->str:
    # Deliberately neutral filenames: no analyzer output, catalog, finding or peer clue is copied.
    suffix=Path(src).suffix.lower()
    dst=room/f'SOURCE-{index:04d}{suffix}'
    shutil.copy2(src,dst)
    return str(dst)


def make_sealed_evidence(contract:str,invoice:str,field:str|None,evidence:list[str],room:Path)->SealedEvidence:
    i=1
    c=_copy_source(contract,room,i); i+=1
    inv=_copy_source(invoice,room,i); i+=1
    fld=None
    if field:
        fld=_copy_source(field,room,i); i+=1
    ev=[]
    for p in evidence:
        ev.append(_copy_source(p,room,i)); i+=1
    return SealedEvidence(c,inv,fld,tuple(ev))


def run_sealed(analyzer_name:str,runner:Callable[[SealedEvidence],dict],*,contract:str,invoice:str,field:str|None,evidence:list[str])->dict:
    """Run one analyzer with only private copies of original evidence.

    The runner receives no peer outputs, peer catalogs, consensus state, disagreement hints,
    target dollars, or prior analyzer results. Its temporary room is destroyed after output.
    """
    with tempfile.TemporaryDirectory(prefix=f'zero_dave_room_{analyzer_name}_') as td:
        sealed=make_sealed_evidence(contract,invoice,field,evidence,Path(td))
        result=runner(sealed)
        # Deep-copy before the room is destroyed so later consensus sees only committed output.
        committed=copy.deepcopy(result)
    committed['sealed_room']={
        'analyzer':analyzer_name,
        'peer_outputs_available':False,
        'peer_catalogs_available':False,
        'consensus_available':False,
        'disagreement_hints_available':False,
        'prior_peer_results_available':False,
        'source_policy':'private byte-identical copies of original customer evidence only',
    }
    return committed


def isolation_attestation(results:dict[str,dict],fingerprints:dict[str,str])->dict[str,Any]:
    return {
        'policy':'SEALED_ROOM_V1',
        'same_original_evidence_fingerprints':sorted(fingerprints.keys()),
        'analyzers':{
            k:{
                'committed_before_consensus':True,
                'peer_outputs_available':False,
                'peer_catalogs_available':False,
                'consensus_available':False,
                'disagreement_hints_available':False,
            } for k in ('A','B','C') if k in results
        },
        'consensus_is_only_cross_analyzer_reader':True,
        'reananalysis_policy':'fresh sealed room from original evidence only; no peer answer, amount, rule, location, or disagreement clue may be supplied',
    }
