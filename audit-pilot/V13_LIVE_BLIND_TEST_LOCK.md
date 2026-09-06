# V13 Live Blind Test — Locked Result

Status: LOCKED
Date: 2026-09-06
Branch: `audit-pilot`
Test: `UCA-BLIND-001`

This record locks the user-provided V13 live blind-test result before any further audit-engine changes. The sealed test package and answer key were not changed.

## Result

- Invoice rows extracted: 24 (9 + 15)
- Findings emitted: 10
- Matched invoice lines: 18
- Ambiguous invoice lines: 0
- Unmatched invoice lines: 6
- Potential overpayment (conservative rollup): **$4,182.00**
- High-confidence raw finding sum: **$5,856.00**
- Planted-error recall: **7/8 = 87.5%**
- Dollar recall: **$4,182 / $4,694 = 89.1%**
- Remaining shortfall against sealed ground truth: **$512.00**

## Findings emitted

1. RATE_MISMATCH — $168
2. RATE_MISMATCH — $84 (overlaps unsupported labor on same invoice row)
3. LABOR_HOURS_UNSUPPORTED — $852
4. EQUIPMENT_HOURS_UNSUPPORTED — $370
5. DUPLICATE_CHARGE — $950
6. EQUIPMENT_HOURS_UNSUPPORTED — $540
7. QUANTITY_UNSUPPORTED — $1,050
8. UNAUTHORIZED_WORK — $540 (overlaps equipment finding on same invoice row)
9. MILEAGE_UNSUPPORTED — $252
10. DUPLICATE_CHARGE — $1,050 (overlaps quantity finding on same invoice row)

## Missed planted error

The system did not emit the sealed $512 subcontractor-markup finding. This is the same dollar shortfall as the prior live V12 run.

## Provenance defects still visible

The live result still points equipment and mileage findings to a `timesheet` record rather than their correct semantic source records. Examples include the $370 and $540 equipment findings and the $252 mileage finding. Therefore the V13 provenance repair did not take effect in this live result.

## Classification defect still visible

`04_Equipment_Logs.pdf` is reported as `MILEAGE_LOG` / `Mileage / Vehicle Log` even though its reasons say `equipment log heading`, `usage columns`, and `equipment names`, and its top alternative is `EQUIPMENT_LOG`. Therefore the classification contradiction remains.

## Version signal

The returned report says `ingestion_version: v12-content-classification`. This is evidence that at least the report/classification layer still identifies itself as V12; combined with the unchanged $4,182 result and unchanged provenance/classification defects, the intended V13 fixes were not effective in this live audit path.

No engine changes should be represented as successful based on this run. Diagnose the runtime/patch path before another blind rerun.
