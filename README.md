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
- post-redeploy verification that Railway reports the new deployment successful and that the proven public backend domain answers a live request;
- deeper post-fix verification through a safe application self-diagnostic when the backend exposes structured read-only dependency evidence;
- guarded Stripe webhook host repair when one enabled webhook and one proven Railway production host make the mismatch unambiguous;
- post-repair Stripe delivery verification using naturally occurring Stripe events rather than manufacturing payment traffic.

## First full DIAGNOSE → FIX → REDEPLOY → VERIFY chain

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

### Final application-dependency verification

Backend reachability is still not enough to prove the repaired application can actually use Supabase. After the Railway runtime is verified, WeaveRelay can look for a safe structured application self-diagnostic on the proven backend, using read-only GET requests such as `/api/connect/diagnostic`, `/api/health`, or `/health`.

If that structured diagnostic contains a Supabase check, WeaveRelay applies a stricter rule:

- **PASS** only when the application reports Supabase PASS **and** provides non-secret evidence that a real read/query/result succeeded;
- **FAIL** when the application's own diagnostic reports the Supabase dependency failing;
- **WARN** when the backend is running but the application exposes no sufficiently strong structured Supabase proof.

WeaveRelay does not retain the diagnostic response body, provider credentials, auth headers, URLs, domains, keys, tokens, cookies, or other secret-bearing evidence fields from this proof step.

Studio One is the pilot shape for this contract without requiring any Studio One modification. Its existing public read-only `/api/connect/diagnostic` endpoint already returns a `supabase.live` check backed by a real Supabase Production Vault read and non-secret evidence that the Driftwood production record was found. WeaveRelay's automated tests use a Studio One-shaped response to prove that this contract can distinguish genuine backend → Supabase communication from mere backend uptime.

This does **not** mean every customer app must expose the same endpoint or that every business function is automatically proven. Apps without a safe structured dependency check remain WARN at this deepest verification layer rather than receiving a false PASS.

## Stripe webhook repair and delivery chain

WeaveRelay can offer **FIX STRIPE WEBHOOK** only when the read-only evidence is unusually narrow and unambiguous:

1. The deployed app exposes exactly one Railway hostname.
2. That hostname matches a public domain in the connected Railway account.
3. Stripe exposes exactly one enabled webhook endpoint.
4. The current Stripe endpoint uses a webhook-like path.
5. The Stripe webhook host is different from the one proven Railway host.
6. The customer explicitly approves the repair immediately before the write.

The repair changes **only the webhook host**. It preserves the existing webhook path and query string, does not alter event subscriptions, does not request or rotate the webhook signing secret, and does not retain the complete endpoint URL in public diagnosis or repair results.

Immediately before writing, WeaveRelay re-reads the Stripe endpoint and aborts if it changed since diagnosis. It then saves the host-only correction and re-reads the endpoint to verify the saved host and preserved path/query. If the customer's restricted Stripe key can read webhook metadata but cannot perform the approved update, WeaveRelay stops and asks for narrowly scoped webhook endpoint write permission rather than silently broadening access.

A correct saved URL is **not** treated as proof that the Railway handler works. After repair, WeaveRelay now uses Stripe's own event state to seek real delivery evidence without creating a charge, checkout session, subscription, refund, or synthetic financial event solely for testing.

Delivery verification is deliberately strict:

- **PASS** only when this repaired endpoint remains the sole enabled webhook destination, a post-repair Stripe event matches its configured event subscriptions, and Stripe reports `pending_webhooks = 0` for that event;
- **WARN** when no matching event has happened yet, when a matching event is still inside a short delivery grace period, or when multiple enabled endpoints make endpoint-specific attribution ambiguous;
- **FAIL** when the URL still points to the correct Railway host but a matching post-repair event remains pending beyond the grace period. That isolates the remaining problem to Stripe delivery or the Railway webhook handler rather than the destination URL.

WeaveRelay retains only counts/booleans and non-secret repair metadata for this proof. It does not persist event payload bodies, webhook endpoint URLs, signing secrets, Stripe credentials, or application object data.

Stripe documents `pending_webhooks` as the number of webhook deliveries for an event that have not yet completed successfully. Because WeaveRelay requires this repaired endpoint to remain the only enabled endpoint before attributing that event-level state, a zero value becomes useful evidence for this specific callback boundary. If that uniqueness assumption stops being true, WeaveRelay falls back to WARN instead of overstating certainty.

## Safety invariants

- Never ask customers to paste provider secrets into chat.
- Store required credentials only encrypted server-side.
- Never expose credentials, secret environment values, Stripe keys, webhook signing secrets, or private connection strings in public diagnostic output.
- Use minimum provider permissions.
- A provider health PASS is not proof that the application's cross-system relationship is correct.
- No silent destructive changes.
- Configuration repair and production redeploy are separate approval gates.
- Every write action requires a defined verification step.
- A repaired chain is not called fully verified until its deepest available application dependency or delivery postcondition passes.
- Do not create financially meaningful activity merely to manufacture a green verification check.
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

Tests cover diagnostic behavior, environment/runtime evidence, provider boundaries, fix-or-open action contracts, secret redaction, failure-closed repair selection, approved Railway variable repair, Railway redeploy targeting, live runtime postcondition verification, Studio One-shaped backend → Supabase dependency proof, guarded Stripe webhook host repair, and Stripe post-repair delivery-state verification.

## Production status

The public marketing site is live at `weaverelay.com`, but the complete stranger customer journey remains **NO-GO** until production environment variables/OAuth are configured, `/app` is verified live, founder-signup notification behavior is corrected and tested, and the full stranger acceptance test passes.

Marketing must not claim broad automatic repair. Only individually proven and verified repair actions may be presented as supported.
