# Audit Issue #36 — Pre-Experiment Isolation Harness

## Scope
This directory contains ONLY pre-experiment infrastructure for GitHub Issue #36. It does NOT run the accuracy experiment, inspect gold outcomes, score cases, tune thresholds, or change production Audit behavior.

## Locked topology and flow
- A1/A2/A3 -> RA
- B1/B2/B3 -> RB
- C1/C2/C3 -> RC
- RA/RB/RC -> RM
- valid final arm commitment -> SCORING identity -> GOLD

Allowed flow is strictly upward: `SOURCE -> analyzer -> trio reconciler -> master reconciler -> scoring`.

Workers are stateless, disposable, case/job/arm scoped. Cross-worker local reads, sibling-trio reads, downward reads, prior-job reads, and cross-arm commitment reuse are denied.

## Line-by-line hardening review — 2026-09-07
PR #39 was re-reviewed against Issue #36 before any accuracy run. The review found and fixed these infrastructure weaknesses:

1. Gold access previously accepted a valid RM hash without proving the caller was the scoring layer. Gold now requires a job-independent SCORING session bound to the same case, arm and source-manifest hash.
2. RM previously could commit without RA/RB/RC having committed. RA/RB/RC and RM now enforce upstream commitment prerequisites.
3. Commit envelopes were only shallow-frozen. Stored payloads and envelopes are now deep-frozen, and callers receive clones so mutation cannot alter the stored first commitment.
4. Commitments lacked explicit experiment-arm identity. Every worker/commit/scoring session is now arm-scoped; a commitment from one arm cannot satisfy another arm or unlock its gold.
5. Issue #36 requires model/runtime/prompt/spec provenance. Commit envelopes now record model version, runtime version, prompt-spec version, task spec, timestamp, case, arm, role, job and manifest hash.
6. Required analyzer/reconciler hash fields and master first-divergence output are now present in the locked structural schemas.

Accuracy/scoring semantics remain intentionally unimplemented.

## Canary and guard tests
The test suite covers all five required Issue #36 leakage canaries:
1. analyzer-to-analyzer isolation;
2. reconciler sibling isolation;
3. master directionality;
4. prior-job amnesia;
5. gold-vault isolation.

Additional guards prove reconciliation prerequisites, cross-arm isolation, stored-commit immutability, upward-only ACLs and locked schema requirements.

`npm test` is the repository test command. Running tests is infrastructure validation only; no Audit case is loaded by these tests.

## Metadata-only case discovery
`case-discovery.mjs` accepts metadata records only. It fails closed if a record contains content-bearing fields such as `content`, `text`, `snippet`, `pages`, OCR/extracted text, outcome/gold/finding/result fields.

The procedure may use only filename/path, file ID, MIME type, byte size and timestamps to nominate source candidates or quarantine likely outcome-bearing artifacts. It marks every discovered file `safe_to_open_for_preparation: false` and always reports `verified_eligible_cases: 0`; eligibility is a separate later protocol step.

A deterministic SHA-256 metadata-manifest hash is produced so the candidate inventory can be sealed without reading file contents.

## Historical metadata inventory
Inventory date: 2026-09-07. A title-only Library search for audit/invoice/contract/work-order/timesheet artifacts returned one candidate: `audit-report.json`. It was NOT opened. Because its filename suggests an outcome/finding artifact, it remains quarantined and cannot be used as source evidence during preparation.

**Verified eligible historical cases: 0.**

This means no complete source-package boundary plus separable gold provenance has yet been established outcome-blind. It does not mean no historical cases exist.

## Eligibility rule for a future manifest
A case may enter the precommitted manifest only when metadata-safe preparation establishes: a complete source-package boundary; source files can be hashed/copy-isolated without gold exposure; authoritative gold is separable or independently adjudicable later; the case was not used to tune the analyzer under test; and inclusion is based on source characteristics rather than known financial outcome.

## Safety stop
Any canary failure blocks the accuracy experiment. No file nominated by discovery may be opened merely to decide eligibility. No gold may be revealed until the relevant arm final artifact is committed and a valid scoring identity presents that exact commitment.
