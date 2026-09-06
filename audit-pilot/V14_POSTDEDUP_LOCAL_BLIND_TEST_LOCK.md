# V14 Post-Dedup Local Sealed Blind-Test Lock

Status: **LOCKED - LOCAL PRE-LIVE RESULT**

This result was produced from the unchanged sealed `UCA-BLIND-001` package after the generic subcontract-markup deduplication/provenance correction. No test-specific invoice IDs, work-order IDs, or planted dollar values were added to the engine.

## Result

- Conservative potential overpayment: **$4,694.00**
- Expected sealed total: **$4,694.00**
- Dollar recall: **100%**
- Planted error concepts detected: **8 / 8**
- Invoice count: **2**
- Invoice rows: **9 + 15 = 24**
- Matching: **19 matched / 0 ambiguous / 5 unmatched**
- Local result SHA-256: `5d9958804a27e158caf5c3dcac037e64e8d9d367e25b0d9e4aab4e74b6d091b1`

## Key finding identities

The run includes the expected semantic findings, including:

- labor rate mismatch
- unsupported labor hours
- unsupported equipment hours
- duplicate mobilization
- subcontractor markup exceeded: **$512.00**
- unsupported mileage
- unauthorized equipment standby
- duplicate pole disposal

Overlapping findings on the same invoice line remain subject to conservative non-double-count rollup.

## Provenance checks

- equipment findings cite `equipment_log`
- mileage finding cites `mileage_log`
- quantity / disposal findings cite `completion`
- subcontract markup finding cites `contractor_backup`
- labor evidence cites `timesheet`

## Important limitation

This is a **local exact-code-path verification**, not yet the authoritative live Railway V14 result. Railway was still rebuilding an older service snapshot instead of the current `audit-pilot` head. A live V14 blind run must still be completed after Railway is confirmed to be serving the current branch head.
