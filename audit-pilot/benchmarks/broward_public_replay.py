from pathlib import Path
import csv, json, os, sys, tempfile

runtime_dir = os.environ.get("AUDIT_RUNTIME_DIR")
if runtime_dir:
    sys.path.insert(0, runtime_dir)
else:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from audit_engine.pipeline import run_audit

APPENDIX_ROWS = [
    ("59", "2011-11-06", "Project Manager", 172.21, 97.57),
    ("59", "2011-11-06", "Project Manager", 172.21, 136.64),
    ("59", "2011-11-06", "Project Manager", 172.21, 122.22),
    ("59", "2011-11-06", "Sr. Designer/Technician", 113.67, 89.76),
    ("59", "2011-11-06", "Sr. Resident Rep.", 106.92, 79.11),
    ("59", "2011-11-06", "Sr. Resident Rep.", 106.92, 80.78),
    ("59", "2011-11-06", "Designer/Technician", 91.17, 65.11),
    ("59", "2011-11-06", "Admin. Assistant", 68.65, 58.40),
    ("74", "2012-12-30", "Project Manager", 177.38, 128.34),
    ("74", "2012-12-30", "Project Manager", 177.38, 136.65),
    ("74", "2012-12-30", "Registered Land Surveyor", 155.33, 89.76),
    ("74", "2012-12-30", "Sr. Designer/Technician", 117.08, 73.06),
    ("74", "2012-12-30", "Sr. Resident Rep.", 110.13, 79.12),
    ("74", "2012-12-30", "Sr. Resident Rep.", 110.13, 88.96),
    ("74", "2012-12-30", "Sr. Resident Rep.", 110.13, 80.78),
    ("74", "2012-12-30", "Designer/Technician", 93.91, 65.11),
]

with tempfile.TemporaryDirectory() as td:
    d = Path(td)
    contract = d / "broward_contract_public_facts.txt"
    contract.write_text(
        "Broward County / Miller, Legg & Associates public-record structural replay\n"
        "Hourly labor rates consist of actual hourly salary rates paid to employees, overhead, fringe benefit cost elements plus negotiated profit.\n"
        "Exhibit B shows an overall multiplier of 2.992. The multiplier is applied to the actual hourly labor rate paid to the consultant's and subconsultants' employees to determine billing rates invoiced to the County.\n"
        "The consultant and bound subconsultants must retain financial records and supporting documentation for contract billings.\n",
        encoding="utf-8",
    )

    invoice = d / "broward_appendix_invoice_rows.csv"
    with invoice.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["invoice_id", "rate_key", "hours", "rate", "amount", "vendor", "service_date", "description"])
        for i, (pay_app, date, position, billed, allowed) in enumerate(APPENDIX_ROWS, 1):
            w.writerow([f"{pay_app}-{i}", position, 1, billed, billed, "Miller Legg", date, position])

    payroll = d / "broward_payroll_evidence.csv"
    with payroll.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["invoice_id", "classification", "hours", "rate", "service_date", "description"])
        for i, (pay_app, date, position, billed, allowed) in enumerate(APPENDIX_ROWS, 1):
            payroll_rate = allowed / 2.992
            w.writerow([f"{pay_app}-{i}", position, 1, f"{payroll_rate:.8f}", date, "Payroll register actual hourly rate"])

    result = run_audit(str(contract), str(invoice), evidence_paths=[str(payroll)])
    published_hourly_excess = round(sum(billed - allowed for _, _, _, billed, allowed in APPENDIX_ROWS), 2)
    output = {
        "benchmark": "Broward County Report 16-2 structural public-record replay",
        "public_ground_truth": {
            "government_proven_overbilling_total": 35787.00,
            "unsupported_labor_cost_separate_from_proven_overbilling": 15798.00,
            "published_appendix_rows": len(APPENDIX_ROWS),
            "published_per_hour_excess_across_one_hour_each": published_hourly_excess,
            "exact_aggregate_replay_possible_from_public_report_alone": False
        },
        "engine_output": {
            "totals": result.get("totals"),
            "invoice_rows_extracted": result.get("invoice_rows_extracted"),
            "rules": result.get("rules"),
            "evidence_matching": (result.get("evidence") or {}).get("matching"),
            "finding_codes": [x.get("code") for x in result.get("findings", [])],
            "findings": result.get("findings", []),
        },
        "capability_questions": {
            "understands_actual_payroll_times_2_992_formula": any(x.get("code") == "RATE_MISMATCH" for x in result.get("findings", [])),
            "creates_false_high_confidence_dollars": any(x.get("confidence") == "HIGH" and x.get("amount", 0) > 0 for x in result.get("findings", []) if x.get("status") == "OVERBILLED" and x.get("code") != "RATE_MISMATCH"),
        },
    }
    print(json.dumps(output, indent=2))
