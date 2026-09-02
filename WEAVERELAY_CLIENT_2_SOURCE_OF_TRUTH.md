# WeaveRelay Client #2 — Known-Good Baseline

**Status:** LOCKED
**Verified:** 2026-09-02 Eastern
**Production site:** https://weaverelay.com
**Repository:** `GSterlingPress/weaverelay`

## Immutable rollback point

The working pre-refinement production website is preserved at:

- Branch: `client2-known-good-2026-09-02`
- Commit: `b577517c7092d94c9d451020e412ee05593af8c6`

Do not delete or repoint this branch. It is the rollback point for the first fully verified WeaveRelay website / Client #2 production flow.

## Verified production path

The following path was manually verified end-to-end on 2026-09-02:

1. GitHub repository connected to Netlify.
2. Netlify production deploy from `main` succeeded.
3. Cloudflare remains authoritative DNS.
4. Existing Resend DNS records were preserved unchanged.
5. Apex `weaverelay.com` points to Netlify using Cloudflare CNAME flattening / DNS-only.
6. `www.weaverelay.com` points to the Netlify site and redirects to the primary apex domain.
7. Netlify DNS verification succeeded.
8. Let's Encrypt HTTPS certificate was issued for both `weaverelay.com` and `www.weaverelay.com`.
9. Public site rendered successfully at `https://weaverelay.com`.
10. Netlify Form Detection was enabled and the site was redeployed.
11. Form `weaverelay-early-access` was detected and collecting data.
12. A real Early Access submission succeeded, redirected to `thanks.html`, and appeared in Netlify Forms as 1 submission.

## Functional behavior that must not regress

- Early Access form name: `weaverelay-early-access`
- Method: POST
- Netlify form handling remains enabled.
- Hidden `form-name` field remains present.
- Successful submissions redirect to `/thanks.html`.
- `thanks.html` remains present.
- `netlify.toml` security headers remain present.
- No secrets are committed to this repository.
- Existing Resend DNS records must not be altered by website changes.

## Locked public product claims

- Core loop: **CONNECT → MAP → DIAGNOSE**
- Initial supported stack: **GitHub · Netlify · Railway · Supabase · Stripe**
- Read-only diagnostics first.
- Minimum permissions.
- Redacted public reports.
- No automatic repairs / “Fix It” in the initial public product.

## Client #2 gaps discovered

1. **Unsupported external provisioning:** connected tooling could not create the GitHub repository; human creation was required.
2. **Repository visibility management:** tooling could inspect repository visibility but could not change Public ↔ Private.
3. **Netlify connection unavailable:** no connected Netlify tool/plugin was available; project creation/linking required human UI work.
4. **Hosting deployment configuration:** branch/base/build/publish settings required manual understanding and entry.
5. **Cloudflare DNS inspection/write/preservation:** website DNS had to be entered manually while preserving unrelated Resend email records.
6. **Netlify Forms cross-system failure:** source code contained a correct Netlify form, but hosting-side Form Detection was disabled. The first submission returned a 404 until Form Detection was enabled and the site redeployed. WeaveRelay should diagnose this boundary automatically.
7. **Domain verification / SSL progression:** DNS propagation, Netlify verification, certificate provisioning, and apex/www canonicalization required manual monitoring.

## Change discipline

Every meaningful change after this baseline should:

1. Preserve the immutable rollback branch above.
2. Make the smallest scoped change.
3. Verify source / static checks before production.
4. Deploy from GitHub through the existing Netlify connection.
5. Verify the actual public domain after deploy.
6. Re-test the Early Access form after changes that could affect HTML, routing, Netlify configuration, or forms.

The first post-baseline change is the already-approved visual refinement only. It must not change form behavior, DNS, hosting configuration, provider claims, or application functionality.
