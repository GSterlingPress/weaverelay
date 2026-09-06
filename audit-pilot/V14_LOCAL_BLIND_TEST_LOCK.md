# V14 Local Sealed Blind-Test Lock

Status: **LOCKED — LOCAL PRE-LIVE RESULT**

This result was produced from the unchanged sealed `UCA-BLIND-001` package after applying the V12, V13, and V14 runtime patches locally from the audit-pilot code path. It was captured before any follow-up correction to the V14/V13 subcontract-markup deduplication behavior.

## Result

- Conservative potential overpayment: **$5,206.00**
- Invoice count: **2**
- Invoice rows: **9 + 15 = 24**
- Matching: **19 matched / 0 ambiguous / 5 unmatched**

## Important finding

The previously missed subcontract markup was found at **$512.00**, but it was emitted twice by two generic rule paths:

- `SUBCONTRACTOR_MARKUP_EXCEEDED` — $512.00
- `SUBCONTRACTOR_MARKUP` — $512.00

Because the second finding had incomplete invoice-row provenance, conservative rollup did not recognize the two findings as overlapping and the total was inflated by $512.00.

Expected sealed total remains **$4,694.00**. Therefore this V14 pre-live run is **not a pass** despite finding all eight planted error concepts. It exposed a general duplicate-finding / provenance-key defect that must be corrected before another blind run.

## Integrity

- Sealed package unchanged.
- Answer key unchanged.
- No test-specific invoice IDs, work-order IDs, or dollar amounts were added to V14 extraction.
- This is a local pre-live run because Railway was still rebuilding an older service snapshot rather than the current audit-pilot branch head.
