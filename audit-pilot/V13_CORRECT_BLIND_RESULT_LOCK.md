# V13 Correct Blind-Test Result — Locked

Status: AUTHORITATIVE V13 BLIND RESULT
Date: 2026-09-06
Branch: `audit-pilot`

This file supersedes the earlier mistaken V13 result record created from the wrong JSON. The authoritative V13 run is the rerun in which both contractor invoices were classified as `INVOICE`.

## Run identity
- Ingestion version reported: `v13-content-classification`
- Contractor invoices audited: 2
- Invoice rows extracted: 9 + 15 = 24
- Matching: 18 matched / 0 ambiguous / 6 unmatched
- OCR required: none

## Financial result
- Potential overpayment: $4,182.00
- Hidden planted overpayment total: $4,694.00
- Dollar shortfall: $512.00
- Count recall: 7/8 planted errors = 87.5%
- Dollar recall: $4,182 / $4,694 = 89.1%

## Findings detected
1. RATE_MISMATCH — $168
2. LABOR_HOURS_UNSUPPORTED — $852 (same invoice line also has overlapping $84 rate mismatch, excluded from conservative rollup)
3. EQUIPMENT_HOURS_UNSUPPORTED — $370
4. DUPLICATE_CHARGE — $950
5. EQUIPMENT_HOURS_UNSUPPORTED / UNAUTHORIZED_WORK overlap — $540 conservative
6. MILEAGE_UNSUPPORTED — $252
7. QUANTITY_UNSUPPORTED / DUPLICATE_CHARGE overlap — $1,050 conservative

## Missed planted finding
- SUBCONTRACTOR_MARKUP_EXCEEDED — $512

## V13 improvements visibly confirmed
- `04_Equipment_Logs.pdf` is correctly classified as `EQUIPMENT_LOG`.
- Equipment findings now cite `equipment_log` provenance rather than a timesheet.
- Mileage finding cites `mileage_log` provenance with 410 supported miles.
- Unit/disposal finding cites `completion` provenance.
- Report identifies ingestion version as `v13-content-classification`.

## Remaining architectural issue indicated by this run
`05_Subcontract_and_Mileage_Support.pdf` was human-confirmed as `MILEAGE_LOG`. The same physical document contains subcontract support as well as mileage support. The audit therefore still misses the $512 subcontract markup finding, which is consistent with a single-label routing architecture discarding secondary semantic evidence from mixed-content documents.

Do not alter the sealed test package or answer key. Any next fix must be general mixed-document semantic extraction/routing, not hard-coding this test.
