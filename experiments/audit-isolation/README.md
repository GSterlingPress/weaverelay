# Audit Issue #36 — Pre-Experiment Isolation Harness

## Scope
This directory contains ONLY pre-experiment infrastructure for GitHub Issue #36.

It does NOT run the accuracy experiment, inspect gold outcomes, score cases, tune thresholds, or change production Audit behavior.

## Worker topology

- A1/A2/A3 -> RA
- B1/B2/B3 -> RB
- C1/C2/C3 -> RC
- RA/RB/RC -> RM
- RM commitment proof -> SCORING/GOLD access

All analyzers/reconcilers are stateless, disposable and case/job scoped.

## Information-flow rules

Allowed flow is upward only:

`SOURCE -> analyzer -> trio reconciler -> master reconciler -> scoring`

Disallowed:

- analyzer -> analyzer
- trio -> sibling trio
- reconciler -> analyzer
- master -> any lower layer
- prior job -> new job
- gold/scoring -> analyzer or reconciler before final commitment

## Commitments

Each worker output is wrapped with case ID, job ID, role, source-manifest hash, task-spec version and timestamp, canonicalized, SHA-256 hashed, and made immutable after commit.

A committed analyzer output can be read only by its assigned first-level reconciler. A first-level reconciler output can be read only by RM. Gold remains locked until a valid final RM commit hash is presented.

## Locked handoff schemas

Authoritative handoffs are structured, not free-form prose.

### Analyzer finding
Required fields:

- finding_id
- finding_type
- entity_refs
- amount_cents
- currency
- source_refs
- governing_rule
- calculation
- counter_evidence
- uncertainties
- recommended_disposition
- reason_codes

### Trio reconciliation
Required fields:

- canonical_finding_id
- member_findings
- agreement
- first_divergence
- amount_cents
- status
- reason_codes

### Master reconciliation
Required fields:

- case_id
- globally_corroborated_dollars
- review_required_dollars
- rejected_suppressed_dollars
- unresolved_finding_count
- findings

## Canary tests

The test suite implements all five precommitted canaries from Issue #36:

1. Analyzer-to-analyzer isolation.
2. Sibling reconciler isolation.
3. No downward leakage from RM.
4. Prior-job amnesia after disposal.
5. Gold-vault firewall until final RM commitment.

It also tests upward-only ACL behavior and output immutability.

Run only the harness tests with:

```bash
node --test experiments/audit-isolation/harness.test.mjs
```

This is NOT an accuracy-test command.

## Historical-case inventory — metadata only

Inventory date: 2026-09-07.

The historical-case inventory was performed using file/library metadata and title-only lookup so known financial outcomes were not opened or revealed.

### Located candidate artifacts

| Candidate | Source | Outcome inspected? | Eligibility status |
|---|---|---:|---|
| `audit-report.json` | ChatGPT Library | NO | CANDIDATE ARTIFACT ONLY — not yet a verified eligible case |

### Current eligible-case count

**Verified eligible historical cases: 0**

This does not mean no historical cases exist. It means none can yet be declared eligible without identifying a complete sealed source corpus and separately verifiable gold provenance while preserving outcome blindness.

The located `audit-report.json` must not be opened for experiment preparation because its contents may contain findings/outcomes. It may only be associated with a case after a metadata-safe source-package/gold-vault procedure is established.

## Eligibility rule for future inventory

A historical case may enter the precommitted case manifest only when metadata-only preparation can establish all of the following without revealing the answer:

1. complete source-package boundary is identifiable;
2. source files can be copied/hashed without exposing gold labels to worker infrastructure;
3. authoritative gold exists in a separable vault or can be independently adjudicated after commitments;
4. case is not known to have been used to tune the analyzer code/prompt under test;
5. inclusion/exclusion is decided from source characteristics, not the known financial result.

Until those conditions are satisfied, a candidate remains unverified and cannot be run.

## Safety stop

Any canary failure blocks all Audit accuracy runs. Any request to open gold, score findings, or run historical cases requires an explicit later instruction and a new protocol step after the case manifest is sealed.