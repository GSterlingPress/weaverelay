from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any
import hashlib
import json
import os
import secrets
import shutil
import subprocess
import sys
import tempfile


@dataclass(frozen=True)
class SealedEvidence:
    contract: str
    invoice: str
    field: str | None
    evidence: tuple[str, ...]


def _sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def source_fingerprints(contract: str, invoice: str, field: str | None, evidence: list[str]) -> dict[str, str]:
    paths = [contract, invoice] + ([field] if field else []) + list(evidence)
    return {_sha256(p): Path(p).name for p in paths}


def _copy_source(src: str, room: Path, index: int) -> str:
    suffix = Path(src).suffix.lower()
    dst = room / f'SOURCE-{index:04d}{suffix}'
    shutil.copy2(src, dst)
    return str(dst)


def make_sealed_evidence(contract: str, invoice: str, field: str | None, evidence: list[str], room: Path) -> SealedEvidence:
    i = 1
    c = _copy_source(contract, room, i); i += 1
    inv = _copy_source(invoice, room, i); i += 1
    fld = None
    if field:
        fld = _copy_source(field, room, i); i += 1
    ev = []
    for p in evidence:
        ev.append(_copy_source(p, room, i)); i += 1
    return SealedEvidence(c, inv, fld, tuple(ev))


def run_sealed_process(analyzer_name: str, *, audit_id: str, contract: str, invoice: str, field: str | None, evidence: list[str]) -> dict:
    """Execute one analyzer as a memoryless fresh analysis of original evidence.

    The parent audit_id is intentionally NOT disclosed to the child. Every invocation gets
    a new opaque run identity, generic source filenames, a fresh private directory, a fresh
    interpreter and a scrubbed environment. The only substantive inputs are byte-identical
    copies of the original customer documents. Prior passes and peer outputs never enter the
    room or envelope. The caller/consensus layer alone retains job and pass history.
    """
    app_root = Path(__file__).parent.resolve()
    worker = app_root / 'zero_dave_process_worker.py'
    with tempfile.TemporaryDirectory(prefix=f'zero_dave_room_{analyzer_name}_') as td:
        room = Path(td).resolve()
        sealed = make_sealed_evidence(contract, invoice, field, evidence, room)
        input_path = room / 'INPUT.json'
        output_path = room / 'COMMITTED.json'
        # Never expose the persistent customer/job identity to an analyzer. A rerun must
        # be indistinguishable at its input boundary from a first analysis of new material.
        opaque_run_id = f'RUN-{secrets.token_hex(16)}'
        envelope = {
            'analyzer': analyzer_name,
            'audit_id': opaque_run_id,
            'contract': sealed.contract,
            'invoice': sealed.invoice,
            'field': sealed.field,
            'evidence': list(sealed.evidence),
        }
        input_path.write_text(json.dumps(envelope), encoding='utf-8')
        # -I intentionally ignores PYTHONPATH. Add only the application code root explicitly
        # inside the isolated interpreter; do not inherit the parent's import path or state.
        bootstrap = (
            "import runpy,sys;"
            f"sys.path.insert(0,{str(app_root)!r});"
            f"sys.argv=[{str(worker)!r},{str(input_path)!r},{str(output_path)!r}];"
            f"runpy.run_path({str(worker)!r},run_name='__main__')"
        )
        env = {
            'PATH': os.environ.get('PATH', ''),
            'PYTHONHASHSEED': '0',
            'ZERO_DAVE_ANALYZER': analyzer_name,
        }
        cp = subprocess.run(
            [sys.executable, '-I', '-c', bootstrap],
            cwd=str(room), env=env, capture_output=True, text=True, timeout=300,
        )
        if cp.returncode != 0:
            raise RuntimeError(f'analyzer {analyzer_name} child process failed: {cp.stderr[-2000:]}')
        if not output_path.exists():
            raise RuntimeError(f'analyzer {analyzer_name} did not commit output')
        committed = json.loads(output_path.read_text(encoding='utf-8'))
        child_pid_isolated = True
    committed['sealed_room'] = {
        'analyzer': analyzer_name,
        'process_boundary': 'fresh OS child process',
        'child_pid_isolated': child_pid_isolated,
        'persistent_audit_identity_available': False,
        'prior_pass_identity_available': False,
        'peer_outputs_available': False,
        'peer_catalogs_available': False,
        'consensus_available': False,
        'disagreement_hints_available': False,
        'prior_peer_results_available': False,
        'prior_self_results_available': False,
        'parent_environment_inherited': False,
        'source_policy': 'private byte-identical copies of original customer evidence only',
    }
    return committed


def isolation_attestation(results: dict[str, dict], fingerprints: dict[str, str]) -> dict[str, Any]:
    return {
        'policy': 'SEALED_ROOM_V3_MEMORYLESS_CHILD_PROCESS',
        'same_original_evidence_fingerprints': sorted(fingerprints.keys()),
        'analyzers': {
            k: {
                'committed_before_consensus': True,
                'fresh_os_child_process': True,
                'persistent_audit_identity_available': False,
                'prior_pass_identity_available': False,
                'prior_self_results_available': False,
                'parent_environment_inherited': False,
                'peer_outputs_available': False,
                'peer_catalogs_available': False,
                'consensus_available': False,
                'disagreement_hints_available': False,
            } for k in ('A', 'B', 'C') if k in results
        },
        'consensus_is_only_cross_analyzer_reader': True,
        'reananalysis_policy': 'every invocation is a fresh memoryless analysis from byte-identical original evidence; only consensus retains job/pass history; no prior self/peer answer, amount, rule, location, identity, or disagreement clue may be supplied',
    }
