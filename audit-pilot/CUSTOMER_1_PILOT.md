# Audit — Zero-Dave Customer Pilot Source of Truth

## Product goal

**We find contractor overcharges you may already have paid — and show exactly where every dollar came from.**

Audit is being redesigned so G. Sterling Press does not perform the customer's audit manually. The system must automatically decipher, catalog, analyze, challenge, reconcile and package the result. It must fail closed: uncertainty is disclosed and excluded from the verified dollar total rather than forced into consensus.

## Non-negotiable principles

1. **SHOW ME THIS DOLLAR.** Every verified dollar must trace from original source → governing rule → inputs → evidence → formula → calculation → finding.
2. **SHOW ME THE SOURCE.** If the customer uploaded it, Audit accounts for it. If Audit used it, the returned package makes it visually inspectable and points to the precise canonical location when available.
3. **No majority vote authorizes money.** Agreement must be evidence-based, not 2-of-3 voting.
4. **False accusation risk outranks recall.** Persistent disagreement is disclosed and excluded from the verified total.
5. **The greater the possible dollar consequence, the harder Audit tries to disprove itself.**

## Neutral immutable source registry

Before any analyzer interprets the documents, Audit assigns an immutable audit ID and canonical source IDs.

Examples:
- `DOC-0001`
- `DOC-0001/P-0014`
- `DOC-0006/S-Payroll/ROW-53`
- region/table/row/cell locators where available.

The shared registry answers **where is it?**, never **what does it mean?**

For every original file preserve:
- original filename;
- role at intake;
- byte size;
- media type;
- cryptographic SHA-256 fingerprint;
- PDF page count or spreadsheet sheet names where available.

IDs are append-only and never silently renumbered. Replacements get new IDs.

## Three analyzer architecture

Analyzer A, B and C must each have a dedicated end-to-end:

**DECIPHER → CATALOG → FINANCIAL EVIDENCE GRAPH → CONTRACT/RULE ANALYSIS → EVIDENCE MATCHING → MATHEMATICAL AUDIT → FINDING TRACE**

The only information shared before comparison is the neutral canonical source registry and the raw customer-supplied evidence universe. No analyzer receives another analyzer's conclusions before committing its own result.

Every analyzer must cite the same canonical IDs for every rule, number, invoice input, evidence match, formula and calculation.

### Current staging implementation status

The staging foundation now has three independent raw-document decipher/catalog passes and three isolated financial audit runs. **However, the three financial audit runs still share the same validated deterministic Audit kernel.** Therefore the product must not claim to customers that the current staging build already contains three genuinely independent financial engines. The staging result explicitly blocks that badge/claim until A/B/C use genuinely distinct financial analyzer implementations.

## Trace-level consensus

For every proposed finding, compare A/B/C stage by stage:

1. classification;
2. governing contract rule;
3. governing document/exhibit/amendment and effective date;
4. invoice identity;
5. supporting evidence identity;
6. inputs / numbers;
7. formula;
8. arithmetic;
9. final amount.

On disagreement, find the **first point of divergence**. Reanalyze that disputed point from the original sources, then rebuild all downstream math. Preserve the original outputs.

Do not tell a dissenting analyzer what the "correct" answer is. Give it the disputed source material and nature of the disagreement.

## Materiality-weighted verification

Resource effort scales with potential aggregate financial impact, not only the individual line item.

Initial bands:
- under $25: catalog; no expensive disagreement loop;
- $25–$99: up to 1 targeted reconciliation;
- $100–$899: up to 2 targeted reconciliation passes;
- $900–$4,999: full 3-pass reconciliation / adjudication;
- $5,000–$24,999: deep contract/evidence/math challenge;
- $25,000+: maximum scrutiny, including full disputed-chain reanalysis from original sources.

Complexity and uncertainty can escalate effort even when dollars are lower. Repeating a small discrepancy across many charges is evaluated using aggregate possible impact.

## Persistent disagreement

Do not loop until the analyzers eventually agree.

After the permitted reconciliation/adjudication budget:
- **VERIFIED** — qualifying evidence chain agrees;
- **RECONCILED** — an initial disagreement was resolved from source evidence; history remains preserved;
- **UNRESOLVED** — material disagreement remains.

Unresolved findings are disclosed to the customer with competing interpretations, sources and potential dollar effect, but are **excluded from the Verified Finding Total**.

## Completeness control

The customer must affirm that the contract package is complete to the best of their knowledge.

Required where applicable:
1. original/master agreement;
2. every referenced pricing exhibit, schedule, appendix, rate sheet or fee table;
3. every executed amendment/change order/modification affecting price, scope, rates, escalation, reimbursables or documentation requirements;
4. invoices/pay applications in the review period;
5. available payroll, timesheets, crew/equipment logs, work orders, POs, receipts, subcontractor invoices and credits;
6. correspondence expressly changing/interpreting a financial term.

Each analyzer also independently searches for references to apparently missing exhibits, schedules, amendments and supporting records. Audit never infers a missing governing term from a later report or known historical outcome.

## Cross-finding safeguards

Before the final total:
- reconcile rule consistency across dates/findings;
- apply effective-date timelines;
- actively search for later credits, corrected invoices, refunds and offsets;
- prevent one underlying economic error from being counted in multiple findings;
- reconcile the final financial ledger so each verified dollar is counted once.

## Customer experience — progressive disclosure

The machinery is deep; the normal customer experience is simple.

### Level 1 — What did you find?
Executive Findings Report with Verified Finding Total, unresolved potential excluded from that total, and highest-impact findings first.

### Level 2 — Show me why
Finding-specific contract → invoice → evidence → formula → result chain.

### Level 3 — Prove it
Highlighted/located source pages or rendered spreadsheet/email/image evidence, analyzer traces and reconciliation history.

### Level 4 — Show me everything
Complete source bibliography, analytical catalogs, all uploaded material, provenance, fingerprints, unresolved issues and machine-readable manifest.

Technical IDs should remain visible but secondary to plain-English labels.

## Returned customer package

1. **Audit Findings Report.pdf** — concise decision-oriented report.
2. **Audit Evidence & Analytical Catalog.pdf** — potentially hundreds of pages; source bibliography, visual evidence renderings, calculations, analyzer traces and reconciliation.
3. **Audit Original Evidence.zip** — customer originals preserved unchanged and renamed/copied with canonical DOC IDs for navigation.
4. **Audit Manifest.json** — audit ID, source fingerprints, analyzer/catalog versions, canonical IDs and machine-readable result.

Every submitted item must be accounted for. If Audit cannot faithfully render a format, it must disclose that limitation and preserve the original rather than silently omitting the item.

Color coordination is paired with Finding IDs/symbols so the package remains understandable for color-blind users and black-and-white printing. Matching finding/rule/input IDs should let a customer move between analysis and evidence without hunting through 100+ pages.

## Customer-facing language

Use terms such as:
- proposed finding;
- verified finding;
- reconciled finding;
- unresolved analytical disagreement;
- unsupported charge;
- requires additional evidence.

Do not call uncertain amounts fraud, theft or proven misconduct.

## Legal / commercial guardrail

Audit is automated contract/invoice analysis and decision support, not a law firm, accounting firm or licensed audit opinion. Before commercial release, an attorney should review customer terms, limitations of liability, disclaimers, privacy/data handling, retention/deletion, dispute provisions and the exact representations made about findings.

A disclaimer is an additional layer, not a substitute for fail-closed product design and reproducible evidence.

## Staging rule

The Zero-Dave staging build may be deployed privately for development and acceptance testing. It must not replace the existing Audit production service until explicitly approved. The current production Audit remains untouched.
