# WeaveRelay Customer Readiness V1

Status: ACTIVE RELEASE WORK — NOT YET CUSTOMER-ACCEPTED

## Goal

A stranger can sign in, create an app, connect its services, understand one operational answer, safely act on it, and receive a useful alert later without founder assistance.

## Release order

### Gate 0 — Preserve production
- Production baseline before this work: `6598a37c59a2922c70361f7d23e1f832636fcde6`.
- Customer-readiness work happens only on `customer-readiness-v1-2026-09-02` until separately validated and approved.
- Existing production/release recovery branches remain untouched.

### Gate 1 — Production acceptance
Prove on the live Netlify environment:
- production deploy corresponds to current `main`;
- public site responds normally;
- scheduled monitor function is installed and invokes;
- Resend sender/configuration is valid;
- controlled non-production failure produces exactly one outage alert after the configured threshold;
- another failed check does not spam a duplicate alert;
- recovery produces exactly one recovery alert;
- no monitor execution performs repair, spend, compute start, payment mutation, customer-data mutation, or destructive action.

Do not intentionally break Studio One or another customer-facing production app for this test.

### Gate 2 — Stranger onboarding
Acceptance path:
1. Enter email and receive passwordless sign-in.
2. Create an app with a name and public URL.
3. See a plain-language instruction to connect the first useful provider.
4. Connect GitHub through OAuth when available; other Early Access providers clearly explain the least-privilege credential required and explicitly say not to paste credentials into chat.
5. After each connection, show what WeaveRelay learned and the single best next action.
6. Once enough evidence exists, make RUN LIVE DIAGNOSIS the obvious next step.
7. Never require the customer to understand WeaveRelay's internal evidence taxonomy to proceed.

Target: first useful diagnosis without founder assistance.

### Gate 3 — Plain-language operational answer
The primary customer answer must fit this shape:

**WHAT'S HAPPENING** — e.g. “Your website is up, but its backend is not responding.”

**WHERE IT BREAKS** — the proven boundary/provider.

**WHAT WE KNOW** — concise evidence, with uncertainty stated honestly.

**WHAT TO DO** — exactly one of:
- `FIX IT` — narrowly supported repair with explicit approval and objective verification;
- `SHOW ME HOW` — precise guided action when WeaveRelay cannot safely perform the write;
- `NOT ENOUGH EVIDENCE` — gather/enable the missing proof rather than guessing.

A provider credential/control-plane failure by itself must not be presented as “your website is down” when the application is still functioning.

### Gate 4 — Functional monitoring
Root HTTP reachability is necessary but not sufficient.

Operational incident classes:
- `site-outage` — public app itself is unreachable/unhealthy;
- `critical-dependency` — app is reachable but a proven required backend/dependency is failing;
- `business-function` — a proven critical function fails despite the shell being reachable;
- `control-plane` — WeaveRelay cannot inspect a provider/credential; do not mislabel this as customer app outage.

Initial safe signals should reuse already-proven topology/evidence and read-only endpoints. Do not start RunPod/GPU compute merely to test health. Do not create fake financial Stripe events.

### Gate 5 — Repair completeness
Every actionable diagnosis must terminate in one of the three customer outcomes above.

For `FIX IT`, require:
1. exact target proven;
2. exact narrow mutation known;
3. explicit approval unless a future separately opted-in safe policy exists;
4. write re-proofs assumptions immediately before mutation;
5. objective postcondition verifies success;
6. failed verification is shown as failed/pending, never as fixed.

### Gate 6 — Trust screen
Before customers grant meaningful access, explain:
- what WeaveRelay reads;
- how credentials are stored;
- what it may change only after approval;
- what monitoring does automatically;
- what it never changes automatically;
- how to disconnect a provider.

Never unattended: purchases/payments, destructive deletion/termination, broad permission changes, ownership/account changes, legal acceptance, customer production-data mutation, or any action without a reliable postcondition.

### Gate 7 — Instrument before hard paywall
Track privacy-minimized product events sufficient to answer:
- did signup complete?
- was an app created?
- which provider categories were connected?
- did MAP produce useful topology?
- was diagnosis run?
- did diagnosis find an actionable boundary?
- was a repair offered/approved/verified?
- was monitoring enabled?
- was an incident detected/alerted/recovered?

Do not store provider secrets or customer business payloads in analytics.

### Gate 8 — Dogfood
Use in this order:
1. Studio One — Client #1, preserve its known-good production state;
2. WeaveRelay — Client #2, outside-style deployment test;
3. CHAIRCRAFT — Client #3 after the first two pass.

Every manual dashboard hop needed to resolve a real cross-system problem becomes a candidate WeaveRelay gap, but only build it if it belongs in CONNECT → MAP → DIAGNOSE → RECOMMEND → FIX → VERIFY.

## Customer-ready definition

Customer-ready V1 is achieved when a clean stranger test proves:

> Sign in → create app → connect enough services → get a correct plain-language diagnosis → reach FIX IT / SHOW ME HOW / NOT ENOUGH EVIDENCE → verify any supported repair → later receive a correct incident/recovery alert, without founder assistance.

Do not call V1 customer-ready until this exact path is replayed successfully.