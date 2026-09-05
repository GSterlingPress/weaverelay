from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
from uuid import uuid4
import json

from audit_engine.pipeline import run_audit
from source_registry import SourceRegistry
from financial_catalog import build_financial_catalog
from consensus import build_consensus


ANALYZERS = ("A", "B", "C")


def _audit_id() -> str:
    now=datetime.now(timezone.utc).strftime("%Y%m%d")
    return f"AUD-{now}-{uuid4().hex[:8].upper()}"


def _engine_run(profile: str, contract: str, invoice: str, field: str | None, evidence: list[str]) -> dict:
    # Three isolated calls deliberately receive no other analyzer output. Evidence
    # order is varied to catch accidental order-dependence without changing source.
    if profile == "A": ordered=list(evidence)
    elif profile == "B": ordered=list(reversed(evidence))
    else:
        ordered=sorted(evidence, key=lambda p: sha256(Path(p).read_bytes()).hexdigest())
    result=run_audit(contract, invoice, field, evidence_paths=ordered)
    result=deepcopy(result)
    result["analyzer"] = profile
    result["analyzer_run_policy"] = "isolated-no-peer-output"
    return result


def _annotate_findings_with_registry(result: dict, registry: SourceRegistry, contract: str, invoice: str, evidence: list[str]) -> None:
    contract_id=registry.doc_id_for_path(contract)
    invoice_id=registry.doc_id_for_path(invoice)
    evidence_ids=[registry.doc_id_for_path(p) for p in evidence]
    for finding in result.get("findings", []) or []:
        finding.setdefault("canonical_sources", {})
        finding["canonical_sources"].update({
            "contract_document": contract_id,
            "invoice_document": invoice_id,
            "evidence_documents": [x for x in evidence_ids if x],
        })
        # Existing engine provenance, when present, is retained untouched. The
        # customer report can display canonical IDs alongside it.


def run_zero_dave_audit(
    *,
    contract: str,
    invoice: str,
    field: str | None = None,
    evidence: list[str] | None = None,
    original_names: dict[str, str] | None = None,
) -> dict:
    evidence=list(evidence or [])
    original_names=original_names or {}
    audit_id=_audit_id()
    registry=SourceRegistry(audit_id)
    registry.add(contract,"contract",original_names.get(contract))
    registry.add(invoice,"invoice",original_names.get(invoice))
    if field:
        registry.add(field,"field",original_names.get(field))
    for path in evidence:
        registry.add(path,"evidence",original_names.get(path))

    analyzer_results={}
    analyzer_catalogs={}
    for profile in ANALYZERS:
        # Dedicated decipher/catalog pass first, then a dedicated financial audit.
        analyzer_catalogs[profile]=build_financial_catalog(registry, profile)
        run=_engine_run(profile,contract,invoice,field,evidence)
        _annotate_findings_with_registry(run,registry,contract,invoice,evidence)
        analyzer_results[profile]=run

    consensus=build_consensus(analyzer_results)

    # Complete-package guard: unresolved referenced financial exhibits/schedules
    # are disclosed. We do not infer the missing term from another source.
    missing_refs=[]
    for profile,catalog in analyzer_catalogs.items():
        for ref in catalog.get("references",[]):
            if ref.get("appears_present_by_filename") is False:
                missing_refs.append({"analyzer":profile,**ref})

    result={
        "audit_id":audit_id,
        "product":"Zero-Dave Audit",
        "mode":"private-staging",
        "created_at":datetime.now(timezone.utc).isoformat(),
        "source_registry":registry.manifest(),
        "analyzer_catalogs":analyzer_catalogs,
        "analyzer_results":analyzer_results,
        "consensus":consensus,
        "complete_package_review":{
            "possible_missing_references":missing_refs,
            "financially_relevant_missing_reference_blocks_auto_release":True,
        },
        "independence":{
            "independent_decipher_catalog_passes":True,
            "isolated_financial_audit_runs":True,
            "peer_outputs_hidden_until_comparison":True,
            "shared_deterministic_engine_kernel":True,
            "customer_triple_independent_badge_allowed":False,
            "note":"Staging foundation: A/B/C have independent catalog passes and isolated audit runs, but still share the validated deterministic financial kernel. This must be replaced by genuinely distinct analyzer implementations before claiming three independent financial engines to customers.",
        },
    }
    return result


def write_manifest(result: dict, path: str | Path) -> None:
    Path(path).write_text(json.dumps(result,indent=2,default=str),encoding="utf-8")
