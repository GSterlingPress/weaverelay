# Audit — Customer #1 Paid Human-Review Pilot

## Pilot status

Audit is approved only for a controlled human-review pilot. It is not approved for autonomous recovery claims, payment holds, demand letters, or customer-facing dollar findings without human verification.

## Offer

**We find contractor overcharges you may already have paid.**

Pilot commercial structure to test:
- Intake / setup: $0–$500.
- Success fee: 20% of verified recovered dollars, with 15–25% as the negotiable range.
- “Recovered” must be defined in writing before work begins.
- No recovery amount is represented as final until human review is complete.

## Required intake — complete contract package

Do not begin the financial audit until the customer affirmatively confirms that the contract package is complete.

Required where applicable:
1. Original/master agreement.
2. Every pricing exhibit, schedule, appendix, rate sheet and fee table referenced by the agreement.
3. Every executed amendment, change order or modification that can alter price, scope, rates, fees, escalation, reimbursables or documentation requirements.
4. All invoices / pay applications in the review period.
5. Supporting evidence available for those invoices: payroll registers, timesheets, crew logs, equipment logs, work orders, purchase orders, receipts, subcontractor invoices and credits.
6. Any correspondence that expressly changes or interprets a financial term.

If a referenced exhibit, amendment or schedule is missing, mark the relevant rule **INCOMPLETE PACKAGE / HUMAN REVIEW**. Never infer the missing term from a later report, historical outcome, or another document.

## Human-review release gate

No dollar is released to the customer unless a human reviewer confirms:
- the governing contract clause and document version;
- the invoice/evidence identity match;
- the arithmetic;
- whether later support resolves an earlier documentation exception;
- whether the finding is truly recoverable rather than merely unsupported or uncertain.

Any ambiguity remains REVIEW. False accusation risk outranks recall.

## Multi-analyzer consensus design

Use independent analyzers with different jobs rather than three identical copies.

### Analyzer A — Primary deterministic audit
- Existing Audit engine.
- Extracts rules, reconciles evidence, computes findings.
- Produces page/source provenance for every financial rule and dollar finding.

### Analyzer B — Contract authority challenger
- Independently reads the contract package and answers only:
  - What is the governing financial clause?
  - Which document/exhibit/amendment controls it?
  - Is anything referenced but missing?
- Does not see Analyzer A’s chosen rule until after it commits its own answer.

### Analyzer C — Dollar/evidence challenger
- Independently verifies invoice identity, supporting evidence, hours/quantities/rates, and arithmetic.
- Does not decide contract precedence unless required to explain a disagreement.
- Recomputes each proposed dollar finding from source values.

## Consensus rules

Never use simple majority vote to authorize money.

- A/B/C materially agree on governing rule, evidence identity and amount → eligible for human confirmation.
- Any analyzer disagrees on governing clause, evidence match, invoice identity, amount, or support status → **DISCREPANCY / HUMAN REVIEW**.
- Missing exhibit or amendment → **INCOMPLETE PACKAGE / HUMAN REVIEW**.
- One analyzer cannot parse a required page → **HUMAN REVIEW**.
- Reanalysis may run after a discrepancy is identified, but the original outputs must remain preserved for provenance.
- Reanalysis must be given the disputed source pages and disagreement, not the “correct answer.”
- Human reviewer is the final authority during the pilot.

## Discrepancy record

For every disagreement preserve:
- analyzer name/version;
- governing clause value proposed;
- source document + page;
- evidence records used;
- proposed dollar amount;
- confidence;
- reason for disagreement;
- reanalysis result;
- final human disposition.

## Customer-facing language

Use “proposed finding,” “verified finding,” “unsupported charge,” and “requires review.” Do not call uncertain amounts fraud, theft, or proven overbilling.

## Stop conditions

Stop the pilot and request missing material if the contract package is incomplete enough to affect a financial rule. Stop automatic release of a finding whenever analyzers disagree. Do not deploy autonomous recovery behavior during Customer #1.
