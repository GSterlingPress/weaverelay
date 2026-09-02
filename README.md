# WeaveRelay

**One place to understand what is happening across the backend services behind your app.**

**CONNECT → MAP → DIAGNOSE**

WeaveRelay is an Early Access connection and diagnostic layer for modern apps—especially apps built quickly with AI tools that end up spread across multiple backend dashboards.

Instead of bouncing between GitHub, Netlify, Railway, Supabase, Stripe, logs, settings, and provider dashboards trying to determine what broke, WeaveRelay brings the first diagnostic pass into one workspace.

Production: https://weaverelay.com

## The problem

Building an app has become dramatically easier. Connecting and troubleshooting everything behind it has not.

A single app can depend on source control, hosting, backend infrastructure, databases, authentication, payments, environment variables, domains, webhooks, and provider-specific configuration. When something fails, the user often has to inspect several systems before even knowing where to start.

WeaveRelay is being built to reduce that back-and-forth.

## What WeaveRelay does today

Early Access supports:

- **GitHub**
- **Netlify**
- **Railway**
- **Supabase**
- **Stripe**

The current product flow is:

1. **CONNECT** — connect supported backend providers to a WeaveRelay workspace.
2. **MAP** — see the services that make up the app's backend stack.
3. **DIAGNOSE** — run live, read-only provider checks and identify the observed failure boundary so you know where to start investigating.

WeaveRelay includes passwordless customer accounts, app workspaces, encrypted server-side credential storage where credentials are required, provider connection/disconnection, and live read-only provider probes.

## Real-world proof

WeaveRelay's core diagnostic system was first proven against **Studio One**, our Client #1 test application.

That test produced five live PASS results across:

**GitHub · Netlify · Railway · Supabase · Stripe**

Studio One remains the first real test harness. The standalone WeaveRelay product and website are Client #2.

## Who it is for

WeaveRelay is especially aimed at builders who can now create software much faster with AI-assisted tools but do not want to become experts in five different infrastructure dashboards just to understand why their app stopped working.

If you have ever thought:

> “The app worked. I connected everything. Now I have no idea which service is broken.”

—that is the problem WeaveRelay is being built to solve.

## Early Access safety model

WeaveRelay is deliberately conservative while the product expands:

- Read-only diagnostics first.
- Minimum permissions wherever practical.
- Provider credentials are entered on WeaveRelay, not shared through chat.
- Required stored credentials are encrypted server-side.
- Diagnostic evidence is sanitized/redacted before presentation.
- No automatic repair or destructive provider actions in the current Early Access product.
- No provider spend, deployment, payment, or other irreversible action is triggered by diagnostics.

## What WeaveRelay does **not** claim yet

Early Access is not a universal autonomous DevOps system.

The current product verifies supported provider connectivity, maps the workspace stack, runs live provider-level checks, and helps identify observed failure boundaries. It does **not yet** guarantee deep verification of every application-specific environment variable, webhook, deployment setting, resource selection, or arbitrary relationship across every provider.

Automatic **FIX IT** actions are intentionally not part of the current public product.

## Where WeaveRelay is going

The long-term direction is straightforward:

**CONNECT → MAP → DIAGNOSE → FIX**

The goal is to make connecting and troubleshooting the services behind an app progressively less dependent on manually jumping among provider dashboards.

Every real Early Access connection problem is useful product evidence: recurring manual steps and failure boundaries become candidates for future WeaveRelay diagnostics and carefully controlled fixes.

## Architecture

The standalone Early Access product currently uses Netlify hosting and Functions, Netlify Blobs for its control-plane data, and Resend for email flows.

Customer workspaces and provider connections are separate from Studio One production data. Studio One credentials and production data are not part of the standalone WeaveRelay customer datastore.

## Development guardrails

- Preserve the locked Client #2 rollback baseline documented in `WEAVERELAY_CLIENT_2_SOURCE_OF_TRUTH.md`.
- Do not commit provider secrets or customer credentials.
- Preserve existing Resend DNS records when changing website/domain configuration.
- Keep diagnostics read-only unless a future capability is deliberately designed, permissioned, and approved otherwise.
- Do not weaken the known-good Studio One five-PASS implementation while developing the standalone product.

## Early Access

WeaveRelay is actively being developed and opened to Early Access users.

Visit **https://weaverelay.com** to learn more and join Early Access.
