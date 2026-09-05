# Audit — Zero-Dave Customer Pilot Source of Truth

## Product goal

**We find contractor overcharges you may already have paid — and show exactly where every dollar came from.**

Audit is being redesigned so G. Sterling Press does not perform the customer's audit manually. The system automatically deciphers, catalogs, analyzes, challenges, reconciles and packages the result. It fails closed: uncertainty is disclosed and excluded from the verified dollar total rather than forced into consensus.

## Non-negotiable principles

1. **SHOW ME THIS DOLLAR.** Every verified dollar must trace from original source → governing rule → inputs → evidence → formula → calculation → finding.
2. **SHOW ME THE SOURCE.** Every upload is accounted for. Used evidence must be inspectable and tied to canonical source locations when available.
3. **No majority vote authorizes money.** Agreement must be evidence-based, not 2-of-3 voting.
4. **False accusation risk outranks recall.** Persistent disagreement is disclosed and excluded from the verified total.
5. **The greater the possible dollar consequence, the harder Audit tries to disprove itself.**

## Neutral immutable source registry

Before interpretation, Audit assigns an immutable audit ID and canonical source IDs such as `DOC-0001`, `DOC-0001/P-0014`, and spreadsheet row/cell locators where available. The registry answers **where is it?**, never **what does it mean?**

For every original file preserve original filename, intake role, byte size, media type, SHA-256 fingerprint, and page/sheet metadata where available. IDs are append-only; replacements get new IDs.

## LOCKED: three sealed-room analyzers

A, B and C are three distinct financial engines:
- **A:** validated deterministic Audit kernel.
- **B:** independent contract-first parser/calculator.
- **C:** independent ledger-first evidence reconstruction plus sentence-window contract scorer.

Each must independently perform its own end-to-end financial analysis from the original customer evidence.

### Absolute no-clue rule

Architecture:

`Original customer documents → three private byte-identical evidence copies → A / B / C isolated analysis → committed outputs → Consensus`

Before and during initial analysis or reanalysis, no analyzer may receive another analyzer's extracted terms, suspected findings, dollar amounts, confidence scores, chosen evidence, interpretations, calculations, source hints, consensus state, majority position, or disagreement clues.

Reanalysis is also sealed. A retry receives fresh copies of the original customer evidence under neutral instructions. It is not told what peers found, where they found it, what amount they calculated, or the nature of a peer disagreement if that information would reveal a clue. Original committed output is preserved before retry.

### Process boundary — implemented and live-tested on private staging

The current staging architecture enforces a fresh OS child process and disposable private evidence room for each analyzer. The parent orchestrator does not invoke the A/B/C financial engines directly. Each child receives only its analyzer identity, audit ID, and private byte-identical source copies through a minimal envelope. Parent secrets, peer outputs/catalogs, consensus state, target/expected dollars, disagreement hints, and prior peer results are not supplied.

Only after A, B and C have exited and committed their outputs does the parent perform cross-analyzer normalization/identity comparison and Consensus.

This proves **process-isolated analysis with no peer outputs exposed through the designed analyzer interface**. It is not a claim of cryptographic or hostile-kernel/container isolation against every conceivable same-host OS attack. Stronger hostile-code isolation would require separate containers/users/namespaces or equivalent sandboxing.

## Frozen process-isolation acceptance gate — PASS

On **2026-09-05**, private staging at exact source commit:

`6be668567ffadc1d6fee5f6300dc4e1cea75c490`

passed the unchanged frozen live case.

Frozen inputs:
- contract labor multiplier: **2.417**;
- invoice: `LIVE-1`, Field Engineer, **7.5 hours**, billed **$84.75/hr**;
- payroll evidence: **$31.28/hr**;
- expected discrepancy: `(84.75 - 31.28 × 2.417) × 7.5 = 68.5968` → **$68.60**.

Recorded live result:
- adversarial process-isolation probe: **PASS**;
- three distinct child PIDs: **PASS**;
- planted peer marker visible to A/B/C: **false / false / false**;
- planted peer-result file visible in A/B/C room: **false / false / false**;
- staging health: **200**;
- A: **$68.60**;
- B: **$68.60**;
- C: **$68.60**;
- Consensus: **VERIFIED**;
- Verified Total: **$68.60**;
- Unresolved Potential Total: **$0.00**;
- divergence stage: **none**;
- all four customer deliverables returned HTTP 200 and non-empty;
- GitHub Actions run **33967215116**, job **101311590823**: **SUCCESS**;
- preserved GitHub Actions artifact ID: **9970059778** (`zero-dave-live-self-test`).

This acceptance result is historical evidence. Do not alter the frozen input/expected result and then describe a later test as the same gate.

## Trace-level consensus

For every proposed finding, compare A/B/C stage by stage:
1. classification;
2. governing rule kind/value;
3. governing source/effective date where available;
4. invoice/economic event identity;
5. supporting evidence identity;
6. inputs;
7. formula;
8. arithmetic;
9. final amount.

Engine-specific prose or finding IDs do not define financial identity. Consensus may pair independently produced findings when their canonical financial identity and inputs agree. Conflicting non-empty invoice identities, rule/formula/input disagreement, amount disagreement, or a missing analyzer fail closed.

On disagreement, Consensus records the first divergence. It must never feed peer-derived clues back into an analyzer.

## Materiality-weighted verification

Initial effort bands:
- under $25: one normal pass;
- $25–$99: one neutral targeted recheck;
- $100–$899: up to two;
- $900–$4,999: full three-pass plus independent adjudication if necessary;
- $5,000–$24,999: deep adjudication;
- $25,000+: maximum scrutiny.

Complexity and uncertainty can escalate effort. Repeating small discrepancies are evaluated using aggregate possible impact. Retry/adjudication implementation must preserve the sealed-room no-clue rule.

## Persistent disagreement

Do not loop until analyzers eventually agree.

After the permitted budget:
- **VERIFIED** — qualifying evidence chain agrees;
- **RECONCILED** — initial disagreement resolved independently from original evidence; history preserved;
- **UNRESOLVED** — material disagreement remains.

Unresolved findings are disclosed with the issue, relevant sources, interpretations and potential effect, but are excluded from Verified Total.

## Completeness control

Customer must affirm the contract package is complete to the best of their knowledge, including master agreement, referenced pricing exhibits/schedules/appendices/rate sheets, executed amendments/change orders affecting financial terms, invoices/pay applications, available supporting records and correspondence expressly changing/interpreting financial terms.

Each analyzer independently searches for apparently missing governing material. Audit never infers a missing governing term from a later report or known historical outcome.

## Cross-finding safeguards still required before customer release

Before final commercial release, complete/harden:
- cross-finding rule consistency;
- effective-date timelines;
- later credits/corrected invoices/refunds/offsets;
- duplicate-dollar prevention across findings;
- final ledger reconciliation so every verified dollar is counted once;
- exact source coordinates/highlighting and finding → source → return navigation;
- report/version immutability and fingerprints;
- explicit facts vs interpretations vs derived values;
- “What could change this finding” disclosure;
- neutral materiality-driven reanalysis/adjudication loop under the sealed-room rule;
- broader controlled product validation for fee, disagreement, missing-exhibit, credit-correction and repeated-small-discrepancy cases.

## Customer experience — progressive disclosure

1. **What did you find?** Verified Total, Requires Attention, highest-impact findings.
2. **Show me why.** Contract → invoice → evidence → formula → result.
3. **Prove it.** Located/rendered source evidence, analyzer traces and reconciliation history.
4. **Show me everything.** Source bibliography, analytical catalogs, provenance, fingerprints, unresolved issues and machine-readable manifest.

Technical IDs remain visible but secondary to plain English.

## Returned customer package

1. **Audit Findings Report.pdf**
2. **Audit Evidence & Analytical Catalog.pdf**
3. **Audit Original Evidence.zip**
4. **Audit Manifest.json** / current staging filename `zero-dave-audit.json`

Every submitted item must be accounted for. If Audit cannot faithfully render a format, disclose the limitation and preserve the original rather than silently omitting it.

## Customer-facing language

Use: proposed finding, verified finding, reconciled finding, unresolved analytical disagreement, unsupported charge, requires additional evidence.

Do not call uncertain amounts fraud, theft or proven misconduct.

## Legal / commercial guardrail

Audit is automated contract/invoice analysis and decision support, not a law firm, accounting firm or licensed audit opinion. Before commercial release, attorney review is required for customer terms, limitations of liability, damages exclusions, disclaimers, privacy/data handling, retention/deletion, dispute provisions, complete-document responsibility, independent verification before acting, and exact product representations.

## Staging / production rule

Zero-Dave remains **private staging only**. It must not replace or modify the existing Audit production service until explicitly approved. The existing production Audit remains untouched.

The temporary token-gated frozen self-test route, live self-test workflow, Railway connectivity workflow and abandoned staging bootstrap were development-only surfaces and are removed after preserving the successful acceptance evidence above. The process-isolation probe source may remain as a regression test; it is not a network-accessible staging endpoint.
