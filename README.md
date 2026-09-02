# WeaveRelay

WeaveRelay is a customer-facing backend connection, diagnosis, and guided-repair product for modern web applications.

## Product direction

**CONNECT → MAP → DIAGNOSE → RECOMMEND → FIX / CONNECT → VERIFY**

The goal is to remove the repeated back-and-forth between provider dashboards. A customer connects the systems behind an app once, WeaveRelay maps how those systems relate, identifies the exact broken hop, and either fixes a proven-safe problem with approval or opens the customer directly to the relevant provider.

Canonical product direction lives in `WEAVERELAY_PRODUCT_SOURCE_OF_TRUTH.md`.

The locked Client #2 / production-site rollback baseline lives in `WEAVERELAY_CLIENT_2_SOURCE_OF_TRUTH.md`.

## Initial provider family

- GitHub
- Netlify
- Railway
- Supabase
- Stripe

Studio One is Client #1 and the real-world test harness. It remains isolated from customer data and is not modified merely to make a WeaveRelay test pass.

## What exists now

The repository contains both the public marketing site and the standalone customer application under `/app`.

Current capabilities on the protected `cross-system-diagnosis-v1` branch include:

- passwordless customer accounts and isolated app workspaces;
- encrypted server-side provider credential storage;
- GitHub OAuth plus Early Access provider credential connections;
- live provider health checks;
- GitHub → Netlify repository and deploy correlation;
- deployed frontend → Railway endpoint ownership checks;
- deployed/source → Supabase project correlation;
- Railway runtime configuration-name coverage without retaining secret values;
- Railway → Supabase project correlation using narrowly allowlisted public project URL evidence;
- Stripe webhook boundary inspection when the connected restricted key has webhook-read permission;
- Stripe webhook → Railway host correlation without retaining webhook URLs or signing secrets;
- PASS / WARN / FAIL diagnosis findings with provider-specific actions;
- direct provider-opening actions;
- provider reconnect repair paths;
- guarded correction of Railway `SUPABASE_URL` when WeaveRelay can prove exactly one production Railway service and exactly one intended Supabase project from independent live evidence;
- a second explicit approval gate for Railway redeploy when that configuration repair changed the running service's environment;
- post-redeploy verification that Railway reports the new deployment successful and that the proven public backend domain answers a live request.

## First real FIX IT path

For a proven Railway → Supabase mismatch, WeaveRelay can offer **FIX SUPABASE CONNECTION**.

The configuration repair is intentionally narrow:

1. The deployed app must expose exactly one Railway backend hostname.
2. That hostname must resolve to exactly one service/environment in the connected Railway account.
3. The deployed app must expose exactly one Supabase project hostname.
4. That project must exist in the connected Supabase account.
5. The customer must explicitly approve the configuration write immediately before it occurs.
6. WeaveRelay changes only the Railway service variable `SUPABASE_URL`.
7. No other Railway variables are replaced.
8. WeaveRelay reads the variable back and verifies the saved project reference.

If the value changed, WeaveRelay does **not** silently restart production. Diagnosis instead produces **REDEPLOY & VERIFY**. That is a separate approval step.

After approval, WeaveRelay redeploys only the previously proven Railway service/environment using Railway's existing source/deployment code. It then tracks the resulting deployment. Runtime verification becomes PASS only when:

- the new Railway deployment reports `SUCCESS`; and
- the previously proven Railway public backend domain answers a live HTTP request.

A queued/building/deploying deployment remains WARN. A failed or crashed deployment becomes FAIL. WeaveRelay never treats “redeploy request accepted” as proof that the backend is healthy.

This repair chain uses Railway's documented Public API operations for `variableCollectionUpsert`, `serviceInstanceRedeploy`, and deployment listing. It must fail closed if the service/project relationship is ambiguous.

## What runtime verification proves — and does not prove

A successful post-redeploy verification proves that the corrected configuration was followed by a successful Railway deployment and that the proven backend service is reachable.

It does **not yet** prove every application-specific Supabase query or business action succeeds. Deeper endpoint/function-level postconditions are the next layer and must be based on evidence rather than assumptions.

## Safety invariants

- Never ask customers to paste provider secrets into chat.
- Store required credentials only encrypted server-side.
- Never expose credentials, secret environment values, Stripe keys, webhook signing secrets, or private connection strings in public diagnostic output.
- Use minimum provider permissions.
- A provider health PASS is not proof that the application's cross-system relationship is correct.
- No silent destructive changes.
- Configuration repair and production redeploy are separate approval gates.
- Every write action requires a defined verification step.
- Financial, destructive, ownership, legal, broad-permission, or otherwise high-impact changes require explicit authenticated approval and may remain manual permanently.
- Preserve Studio One's known-good baseline and keep its data separate from customer workspaces.

## Branch and release discipline

Active development is on `cross-system-diagnosis-v1` and Draft PR #1. Do not merge repair capabilities into `main` until their tests, provider permissions, deployment behavior, and stranger acceptance path are proven.

The immutable marketing rollback branch is `client2-known-good-2026-09-02`.

## Validation

GitHub Actions runs:

- `npm install --ignore-scripts`
- `npm test`
- `npm run build`

Tests cover diagnostic behavior, environment/runtime evidence, provider boundaries, fix-or-open action contracts, secret redaction, failure-closed repair selection, approved Railway variable repair, Railway redeploy targeting, and live runtime postcondition verification.

## Production status

The public marketing site is live at `weaverelay.com`, but the complete stranger customer journey remains **NO-GO** until production environment variables/OAuth are configured, `/app` is verified live, founder-signup notification behavior is corrected and tested, and the full stranger acceptance test passes.

Marketing must not claim broad automatic repair. Only individually proven and verified repair actions may be presented as supported.
