# WeaveRelay — Product Source of Truth

**Status:** CANONICAL PRODUCT DIRECTION
**Repository:** `GSterlingPress/weaverelay`
**Updated:** 2026-09-02

## Product mission

WeaveRelay exists to remove the repeated back-and-forth required to connect, diagnose, and safely repair the systems behind a modern app.

The durable product loop is:

**CONNECT → MAP → DIAGNOSE → RECOMMEND → FIX / CONNECT → VERIFY**

The customer should not need to understand five provider dashboards, copy configuration back and forth repeatedly, or guess which system is responsible for a failure.

## Who it is for

Primary customer: a software builder, including a nontechnical or AI-assisted builder, whose app depends on several external systems and who needs those systems to work together reliably.

Initial supported provider family:

- GitHub
- Netlify
- Railway
- Supabase
- Stripe

Studio One is Client #1 and the real-world test harness. It must remain isolated from future customer data and must not be changed merely to make a WeaveRelay test pass.

## What WeaveRelay must know

WeaveRelay must progress beyond provider availability checks. Its core value is cross-system truth:

> Do the connected systems agree about how this particular application is supposed to work?

Examples include:

- GitHub source repository ↔ Netlify site/deploy/commit
- deployed frontend ↔ Railway backend endpoint
- source/runtime configuration names ↔ hosting/runtime environment configuration
- application/backend ↔ Supabase project
- application/backend ↔ Stripe account and webhook boundary
- domain/DNS/hosting state ↔ the deployed application

A PASS means evidence supports the relationship being tested, not merely that both providers are individually reachable.

## Product stages

### Stage 1 — Read-only diagnosis

The initial public product remains read-only while trust, isolation, provider permissions, and stranger acceptance testing are proven.

It may:
- connect using least-privilege authorization;
- inspect provider/account/application metadata;
- map relationships;
- identify likely broken boundaries;
- explain the evidence and recommended next action;
- verify whether a repair performed elsewhere worked.

It must not silently mutate customer systems.

### Stage 2 — Guided repair

After diagnosis is reliable, WeaveRelay should prepare the smallest safe repair and ask for explicit customer approval immediately before a write.

Examples:
- add or correct a non-secret hosting/runtime configuration reference;
- reconnect the intended repository/site/project relationship;
- create or update a webhook endpoint;
- trigger a safe redeploy after a configuration correction;
- enable a provider feature required by the application;
- repair an OAuth/provider connection.

The product should show: what will change, where it will change, why, and how it will verify success.

### Stage 3 — One-click / automatic repair for proven-safe actions

Only actions that are reversible, narrowly scoped, objectively verifiable, and supported by sufficiently narrow provider permissions may become one-click or policy-approved automatic fixes.

Irreversible, billing-affecting, destructive, payout, spend, production-data, account-ownership, legal, or broad-permission changes always require an explicit authenticated approval gate and may remain manual permanently.

## The connection problem WeaveRelay is solving

The repeated back-and-forth users experience usually comes from several different problems, not one:

1. **Authorization:** one service has not been granted permission to inspect or act on another.
2. **Identity/resource selection:** the right account is connected but the wrong repo, site, project, environment, or Stripe account is selected.
3. **Configuration:** variables, endpoints, redirect URLs, webhook destinations, build settings, domains, or scopes disagree across systems.
4. **Deployment drift:** source is correct but production is running older or differently configured code.
5. **Runtime failure:** configuration appears correct but the live endpoint or dependency is failing.
6. **Provider-side feature/state:** a required feature may be disabled even though source code is correct.
7. **Diagnosis uncertainty:** users bounce between dashboards because no single provider can see the whole chain.

WeaveRelay's job is to collapse those loops into one evidence-backed workflow.

## Customer experience target

A mature WeaveRelay experience should be:

1. Sign in.
2. Create/select app.
3. Connect providers once with least privilege.
4. WeaveRelay maps the stack automatically.
5. Run diagnosis.
6. See the exact broken hop and evidence.
7. Choose **FIX IT** when WeaveRelay has a safe supported repair, or receive one precise manual action when it does not.
8. WeaveRelay re-runs the relevant checks automatically and confirms the repair.

The founder should not need to connect customer systems, handle their credentials, or manually diagnose ordinary customer cases.

## Safety and privacy invariants

- Customer credentials are never requested in chat.
- Credentials are stored only encrypted server-side when required.
- Public UI and diagnostic output never expose secrets.
- Use the minimum provider permissions that can perform the required read or approved write.
- Never mix Studio One data with customer data.
- No silent destructive mutations.
- Every write action must have a defined verification check.
- Prefer reversible changes and provider-native rollback mechanisms.
- Log the fact and type of an approved change without logging secret values.

## Development discipline

- Preserve locked known-good rollback branches.
- Build new diagnostic/repair capabilities on protected branches until validated.
- Keep Studio One's known-good baseline intact while using it as Client #1 evidence.
- Tests must prove secret redaction and customer isolation.
- A provider health PASS must never be presented as proof of an app-level relationship.
- Do not market a repair as supported until both the repair and its postcondition verification have passed an end-to-end test.

## Current state

The active protected branch is `cross-system-diagnosis-v1`.

Stage 1 now includes read-only provider health, cross-system mapping, deployment/environment truth, Railway runtime configuration evidence, Railway → Supabase correlation, and Stripe webhook-boundary evidence.

A first **Stage 2 guided-repair pilot** now exists on the protected branch for a narrowly proven Railway → Supabase mismatch. It may change only Railway `SUPABASE_URL`, and only when independent live evidence proves exactly one deployed Railway service and exactly one intended Supabase project. The customer must explicitly approve immediately before the write. The mutation is read back and configuration-level verification is required. This repair must fail closed when the relationship is ambiguous. Live runtime/deployment verification remains a separate postcondition and must not be overstated.

This repair is not yet a broad production promise and must not be marketed as generally available until production provider permissions and stranger end-to-end acceptance testing pass.

The existing `WEAVERELAY_CLIENT_2_SOURCE_OF_TRUTH.md` remains the locked operational baseline for Client #2 / the production marketing site. This file governs overall product direction and must not erase that rollback/baseline document.

## Non-goals

- Generic AI troubleshooting with no evidence.
- Broad unattended access to customer accounts.
- Pretending a provider connection proves the app is configured correctly.
- Requiring the founder to become the customer's integration technician.
- Automatically changing financially meaningful or destructive settings without authenticated approval.
