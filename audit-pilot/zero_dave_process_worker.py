from __future__ import annotations

import json
import os
import re
import sys
from copy import deepcopy
from pathlib import Path


def _strings(v):
    if isinstance(v, str):
        yield v
    elif isinstance(v, dict):
        for x in v.values():
            yield from _strings(x)
    elif isinstance(v, (list, tuple)):
        for x in v:
            yield from _strings(x)


def _a_inputs_from_own_finding(f: dict, code: str, mult, cap) -> dict:
    existing = f.get("inputs") or f.get("values") or f.get("details")
    if isinstance(existing, dict) and existing:
        return existing
    text = " ".join(_strings(f))
    if code == "RATE_MISMATCH":
        m = re.search(r"payroll\s*\$?([0-9.,]+)\s*/?hr\s*x\s*([0-9.]+).*?billed\s*\$?([0-9.,]+)\s*/?hr\s*for\s*([0-9.,]+)\s*hours", text, re.I)
        if m:
            return {"billed_rate": float(m.group(3).replace(',', '')), "payroll_rate": float(m.group(1).replace(',', '')), "multiplier": float(m.group(2)), "hours": float(m.group(4).replace(',', ''))}
        out = {}
        for canon, names in {"billed_rate": ("billed_rate", "rate"), "payroll_rate": ("payroll_rate", "actual_rate"), "hours": ("hours", "quantity", "qty")}.items():
            for n in names:
                if f.get(n) not in (None, ''):
                    try:
                        out[canon] = float(f[n]); break
                    except Exception:
                        pass
        if mult is not None:
            out["multiplier"] = float(mult)
        return out
    if code == "SUBCONTRACTOR_MARKUP_EXCEEDED":
        out = {}
        for canon, names in {"base_cost": ("base_cost", "subcontractor_base_cost", "subcontractor_cost"), "billed_pct": ("billed_pct", "markup_pct", "fee_pct")}.items():
            for n in names:
                if f.get(n) not in (None, ''):
                    try:
                        out[canon] = float(f[n]); break
                    except Exception:
                        pass
        if cap is not None:
            out["cap_pct"] = float(cap)
        return out
    return {}


def _normalize_a_traces(result: dict) -> None:
    rules = result.get("rules") or {}
    mult = ((rules.get("labor_formula") or {}).get("payroll_multiplier"))
    cap = ((rules.get("subcontractor") or {}).get("markup_cap_pct"))
    for f in result.get("findings", []) or []:
        code = str(f.get("code") or "")
        details = _a_inputs_from_own_finding(f, code, mult, cap)
        iid = str(f.get("invoice_id") or f.get("invoice") or "")
        if code == "RATE_MISMATCH":
            trace = {"rule_kind": "labor_multiplier", "rule_value": mult, "invoice_id": iid, "description": str(f.get("description") or ""), "formula_id": "LABOR_RATE_DELTA", "inputs": details}
        elif code == "SUBCONTRACTOR_MARKUP_EXCEEDED":
            trace = {"rule_kind": "subcontract_cap_pct", "rule_value": cap, "invoice_id": iid, "description": str(f.get("description") or ""), "formula_id": "SUBCONTRACT_FEE_DELTA", "inputs": details}
        else:
            trace = {"rule_kind": code or "other", "rule_value": f.get("rule") or f.get("allowed") or f.get("contract_rule"), "invoice_id": iid, "description": str(f.get("description") or ""), "formula_id": code or "OTHER", "inputs": details}
        f["_zero_dave_trace"] = trace


def _assert_envelope(envelope: dict) -> None:
    allowed = {"analyzer", "audit_id", "contract", "invoice", "field", "evidence"}
    extra = set(envelope) - allowed
    if extra:
        raise RuntimeError(f"sealed input contains forbidden keys: {sorted(extra)}")
    for forbidden in ("peer", "consensus", "disagreement", "target", "expected", "answer", "finding"):
        if forbidden in json.dumps(envelope, sort_keys=True).lower():
            raise RuntimeError(f"sealed input contains forbidden clue token: {forbidden}")


def main() -> int:
    if len(sys.argv) != 3:
        raise SystemExit("usage: zero_dave_process_worker.py INPUT_JSON OUTPUT_JSON")
    input_path = Path(sys.argv[1]).resolve()
    output_path = Path(sys.argv[2]).resolve()
    envelope = json.loads(input_path.read_text(encoding="utf-8"))
    _assert_envelope(envelope)

    analyzer = envelope["analyzer"]
    contract = envelope["contract"]
    invoice = envelope["invoice"]
    field = envelope.get("field")
    evidence = list(envelope.get("evidence") or [])

    # The child receives only a deliberately scrubbed environment. No parent secrets,
    # peer paths, consensus state, expected dollars or prior analyzer state are inherited.
    os.environ.clear()
    os.environ.update({"PYTHONHASHSEED": "0", "ZERO_DAVE_ANALYZER": analyzer})

    if analyzer == "A":
        from audit_engine.pipeline import run_audit
        result = deepcopy(run_audit(contract, invoice, field, evidence_paths=evidence))
        result["analyzer"] = "A"
        result["engine"] = "validated-deterministic-audit-kernel"
        _normalize_a_traces(result)
    elif analyzer == "B":
        from analyzer_b import run_analyzer_b
        from source_registry import SourceRegistry
        registry = SourceRegistry(f'{envelope["audit_id"]}-B-PRIVATE')
        registry.add(contract, "contract"); registry.add(invoice, "invoice")
        if field: registry.add(field, "field")
        for p in evidence: registry.add(p, "evidence")
        result = run_analyzer_b(contract=contract, invoice=invoice, field=field, evidence=evidence, registry=registry)
    elif analyzer == "C":
        from analyzer_c import run_analyzer_c
        from source_registry import SourceRegistry
        registry = SourceRegistry(f'{envelope["audit_id"]}-C-PRIVATE')
        registry.add(contract, "contract"); registry.add(invoice, "invoice")
        if field: registry.add(field, "field")
        for p in evidence: registry.add(p, "evidence")
        result = run_analyzer_c(contract=contract, invoice=invoice, field=field, evidence=evidence, registry=registry)
    else:
        raise RuntimeError(f"unknown analyzer {analyzer}")

    output_path.write_text(json.dumps(result, default=str), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
