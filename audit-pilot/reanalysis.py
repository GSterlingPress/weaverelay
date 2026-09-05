from __future__ import annotations

from copy import deepcopy
from typing import Any

from consensus import build_consensus
from sealed_room import run_sealed_process

ANALYZERS = ('A', 'B', 'C')


def _budget(consensus: dict) -> int:
    return max((int(f.get('reconciliation_budget') or 0) for f in consensus.get('findings', []) if f.get('state') == 'UNRESOLVED'), default=0)


def _snapshot(pass_no: int, results: dict, consensus: dict) -> dict:
    return {
        'pass': pass_no,
        'analyzer_results': deepcopy(results),
        'consensus': deepcopy(consensus),
    }


def run_clue_free_reanalysis(*, audit_id: str, contract: str, invoice: str, field: str | None, evidence: list[str], initial_results: dict[str, dict], initial_consensus: dict[str, Any]) -> dict:
    """Resolve disagreement by fresh independent passes over originals only.

    The controller may observe consensus, but it never sends any consensus fact, peer
    answer, amount, rule, source location, divergence stage, or target back to A/B/C.
    A retry envelope is therefore byte-for-byte the normal sealed analyzer envelope
    except for a fresh room/process created internally by run_sealed_process.
    """
    history = [_snapshot(0, initial_results, initial_consensus)]
    current_results = deepcopy(initial_results)
    current_consensus = deepcopy(initial_consensus)
    max_passes = _budget(current_consensus)

    for pass_no in range(1, max_passes + 1):
        if not any(f.get('state') == 'UNRESOLVED' for f in current_consensus.get('findings', [])):
            break
        fresh = {}
        # All three rerun. Selecting only the dissenting engine would itself leak which
        # engine differed. No peer-derived source subset or disagreement clue is supplied.
        for analyzer in ANALYZERS:
            fresh[analyzer] = run_sealed_process(
                analyzer,
                audit_id=audit_id,
                contract=contract,
                invoice=invoice,
                field=field,
                evidence=evidence,
            )
        current_results = fresh
        current_consensus = build_consensus(current_results)
        history.append(_snapshot(pass_no, current_results, current_consensus))

    unresolved = [f for f in current_consensus.get('findings', []) if f.get('state') == 'UNRESOLVED']
    initial_unresolved = any(f.get('state') == 'UNRESOLVED' for f in initial_consensus.get('findings', []))
    resolved = initial_unresolved and not unresolved
    if resolved:
        for f in current_consensus.get('findings', []):
            if f.get('state') == 'VERIFIED':
                f['state'] = 'RECONCILED'
                f['note'] = 'Initial disagreement resolved only after clue-free fresh sealed-room reanalysis from the original evidence; original outputs are preserved.'

    return {
        'final_analyzer_results': current_results,
        'final_consensus': current_consensus,
        'history': history,
        'passes_used': len(history) - 1,
        'max_passes': max_passes,
        'resolved_after_initial_disagreement': resolved,
        'persistent_disagreement': bool(unresolved),
        'policy': {
            'all_analyzers_rerun_each_pass': True,
            'fresh_child_process_each_run': True,
            'fresh_sealed_room_each_run': True,
            'original_evidence_only': True,
            'peer_outputs_supplied_to_analyzers': False,
            'peer_amounts_supplied_to_analyzers': False,
            'peer_rules_supplied_to_analyzers': False,
            'peer_source_locations_supplied_to_analyzers': False,
            'divergence_stage_supplied_to_analyzers': False,
            'target_answer_supplied_to_analyzers': False,
            'majority_vote_authorizes_money': False,
        },
    }
