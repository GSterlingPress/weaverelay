from __future__ import annotations

from dataclasses import dataclass, asdict
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Iterable


MONEY_TOLERANCE = Decimal("0.01")


@dataclass
class AnalyzerTrace:
    analyzer: str
    finding_key: str
    status: str
    amount: Decimal
    rule: Any
    rule_source: Any
    invoice_source: Any
    evidence_source: Any
    formula: Any
    inputs: Any
    confidence: str
    raw_finding: dict

    def to_dict(self) -> dict:
        d = asdict(self)
        d["amount"] = float(self.amount)
        return d


@dataclass
class ConsensusFinding:
    finding_id: str
    state: str
    verified_amount: Decimal
    potential_amount: Decimal
    materiality_band: str
    reconciliation_budget: int
    divergence_stage: str | None
    traces: list[AnalyzerTrace]
    note: str

    def to_dict(self) -> dict:
        return {
            "finding_id": self.finding_id,
            "state": self.state,
            "verified_amount": float(self.verified_amount),
            "potential_amount": float(self.potential_amount),
            "materiality_band": self.materiality_band,
            "reconciliation_budget": self.reconciliation_budget,
            "divergence_stage": self.divergence_stage,
            "traces": [t.to_dict() for t in self.traces],
            "note": self.note,
        }


def _money(value: Any) -> Decimal:
    try:
        return Decimal(str(value or 0)).quantize(MONEY_TOLERANCE, rounding=ROUND_HALF_UP)
    except Exception:
        return Decimal("0.00")


def materiality_policy(amount: Decimal) -> tuple[str, int]:
    a = abs(amount)
    if a < Decimal("25"):
        return "micro", 0
    if a < Decimal("100"):
        return "low", 1
    if a < Decimal("900"):
        return "moderate", 2
    if a < Decimal("5000"):
        return "high", 3
    if a < Decimal("25000"):
        return "very-high", 3
    return "maximum", 3


def finding_key(finding: dict) -> str:
    # Prefer stable invoice/line identity. Fall back to semantic identity; never
    # use amount alone because that can merge unrelated charges.
    for keys in (
        ("invoice_id", "line_id", "code"),
        ("invoice", "line", "code"),
        ("invoice_id", "description", "code"),
        ("description", "code", "status"),
    ):
        vals = [str(finding.get(k, "")).strip() for k in keys]
        if any(vals) and all(vals):
            return "|".join(vals)
    return "|".join(
        str(finding.get(k, "")).strip()
        for k in ("code", "status", "description", "vendor", "date")
    )


def trace_from_finding(analyzer: str, finding: dict) -> AnalyzerTrace:
    return AnalyzerTrace(
        analyzer=analyzer,
        finding_key=finding_key(finding),
        status=str(finding.get("status") or "UNKNOWN"),
        amount=_money(finding.get("amount")),
        rule=finding.get("rule") or finding.get("allowed") or finding.get("contract_rule"),
        rule_source=finding.get("rule_source") or finding.get("contract_source") or finding.get("source"),
        invoice_source=finding.get("invoice_source") or finding.get("invoice_ref") or finding.get("line_source"),
        evidence_source=finding.get("evidence_source") or finding.get("evidence") or finding.get("matched_evidence"),
        formula=finding.get("formula") or finding.get("calculation") or finding.get("math"),
        inputs=finding.get("inputs") or finding.get("values") or finding.get("details"),
        confidence=str(finding.get("confidence") or "UNKNOWN"),
        raw_finding=finding,
    )


def _canon(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, (dict, list, tuple)):
        import json
        return json.dumps(value, sort_keys=True, default=str, separators=(",", ":"))
    return str(value).strip()


def first_divergence(traces: Iterable[AnalyzerTrace]) -> str | None:
    ts = list(traces)
    if len(ts) < 3:
        return "missing-analyzer"
    stages = (
        ("classification", lambda t: t.status),
        ("contract-rule", lambda t: t.rule),
        ("contract-source", lambda t: t.rule_source),
        ("invoice-source", lambda t: t.invoice_source),
        ("evidence-source", lambda t: t.evidence_source),
        ("formula", lambda t: t.formula),
        ("inputs", lambda t: t.inputs),
        ("amount", lambda t: t.amount),
    )
    for name, getter in stages:
        vals = [_canon(getter(t)) for t in ts]
        if len(set(vals)) != 1:
            return name
    return None


def build_consensus(analyzer_results: dict[str, dict]) -> dict:
    grouped: dict[str, list[AnalyzerTrace]] = {}
    for analyzer, result in analyzer_results.items():
        for finding in result.get("findings", []) or []:
            t = trace_from_finding(analyzer, finding)
            grouped.setdefault(t.finding_key, []).append(t)

    findings: list[ConsensusFinding] = []
    verified_total = Decimal("0.00")
    unresolved_total = Decimal("0.00")

    for idx, (key, traces) in enumerate(sorted(grouped.items()), start=1):
        amounts = [t.amount for t in traces]
        potential = max([abs(a) for a in amounts], default=Decimal("0.00"))
        band, budget = materiality_policy(potential)
        divergence = first_divergence(traces)
        complete = {t.analyzer for t in traces} == {"A", "B", "C"}
        if complete and divergence is None:
            amount = traces[0].amount
            state = "VERIFIED"
            note = "All three analyzer traces agree at every compared stage."
            if amount > 0:
                verified_total += amount
        else:
            amount = Decimal("0.00")
            state = "UNRESOLVED"
            note = "Excluded from verified total pending automated trace reconciliation."
            unresolved_total += potential
        findings.append(ConsensusFinding(
            finding_id=f"F-{idx:04d}",
            state=state,
            verified_amount=amount,
            potential_amount=potential,
            materiality_band=band,
            reconciliation_budget=budget,
            divergence_stage=divergence,
            traces=traces,
            note=note,
        ))

    return {
        "findings": [f.to_dict() for f in findings],
        "verified_total": float(verified_total),
        "unresolved_potential_total": float(unresolved_total),
        "policy": {
            "majority_vote_authorizes_money": False,
            "persistent_disagreement_in_verified_total": False,
            "materiality_weighted_reanalysis": True,
            "max_reconciliation_passes": 3,
        },
    }
