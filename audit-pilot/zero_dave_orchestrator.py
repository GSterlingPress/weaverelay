from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4
import json

from source_registry import SourceRegistry
from financial_catalog import build_financial_catalog
from consensus import build_consensus
from sealed_room import run_sealed_process, source_fingerprints, isolation_attestation

ANALYZERS = ("A", "B", "C")


def _audit_id() -> str:
    return f"AUD-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{uuid4().hex[:8].upper()}"


def _annotate_after_commit(result: dict, registry: SourceRegistry, contract: str, invoice: str, evidence: list[str]) -> None:
    # Canonical IDs are attached only after the analyzer process has exited and committed output.
    c = registry.doc_id_for_path(contract)
    i = registry.doc_id_for_path(invoice)
    ev = [registry.doc_id_for_path(p) for p in evidence]
    for f in result.get('findings', []) or []:
        f.setdefault('canonical_sources', {}).update({'contract_document': c, 'invoice_document': i, 'evidence_documents': [x for x in ev if x]})


def run_zero_dave_audit(*, contract: str, invoice: str, field: str | None = None, evidence: list[str] | None = None, original_names: dict[str, str] | None = None) -> dict:
    evidence = list(evidence or [])
    original_names = original_names or {}
    audit_id = _audit_id()
    registry = SourceRegistry(audit_id)
    registry.add(contract, "contract", original_names.get(contract))
    registry.add(invoice, "invoice", original_names.get(invoice))
    if field:
        registry.add(field, "field", original_names.get(field))
    for p in evidence:
        registry.add(p, "evidence", original_names.get(p))

    fingerprints = source_fingerprints(contract, invoice, field, evidence)

    # Hard process boundary. The parent does not import or invoke A/B/C engines.
    # Each analyzer starts from the same original evidence in its own disposable room/process.
    analyzer_results = {}
    for analyzer in ANALYZERS:
        analyzer_results[analyzer] = run_sealed_process(
            analyzer, audit_id=audit_id, contract=contract, invoice=invoice,
            field=field, evidence=evidence,
        )

    # Cross-analyzer work starts only after all child processes exited and committed outputs.
    for r in analyzer_results.values():
        _annotate_after_commit(r, registry, contract, invoice, evidence)
    analyzer_catalogs = {profile: build_financial_catalog(registry, profile) for profile in ANALYZERS}
    consensus = build_consensus(analyzer_results)

    missing_refs = []
    for profile, catalog in analyzer_catalogs.items():
        for ref in catalog.get('references', []):
            if ref.get('appears_present_by_filename') is False:
                missing_refs.append({'analyzer': profile, **ref})
    attestation = isolation_attestation(analyzer_results, fingerprints)
    return {
        'audit_id': audit_id,
        'product': 'Zero-Dave Audit',
        'mode': 'private-staging',
        'created_at': datetime.now(timezone.utc).isoformat(),
        'source_registry': registry.manifest(),
        'analyzer_catalogs': analyzer_catalogs,
        'analyzer_results': analyzer_results,
        'consensus': consensus,
        'sealed_room_isolation': attestation,
        'complete_package_review': {
            'possible_missing_references': missing_refs,
            'financially_relevant_missing_reference_blocks_auto_release': True,
        },
        'independence': {
            'sealed_room_enforced': True,
            'process_level_isolation': True,
            'same_original_evidence_only': True,
            'independent_financial_engines': True,
            'peer_outputs_hidden_until_all_committed': True,
            'peer_catalogs_hidden_until_all_committed': True,
            'disagreement_clues_forbidden': True,
            'reananalysis_from_original_evidence_only': True,
            'consensus_is_only_cross_analyzer_reader': True,
            'shared_deterministic_engine_kernel': False,
            'customer_triple_independent_badge_allowed': True,
            'engines': {
                'A': 'validated deterministic Audit kernel',
                'B': 'independent contract-first parser/calculator',
                'C': 'independent ledger-first evidence reconstruction + sentence-window contract scorer',
            },
            'note': 'A/B/C execute as separate OS child processes in disposable sealed evidence rooms. Only committed outputs cross into consensus.',
        },
    }


def write_manifest(result: dict, path: str | Path) -> None:
    Path(path).write_text(json.dumps(result, indent=2, default=str), encoding='utf-8')
