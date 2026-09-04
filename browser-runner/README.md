# WeaveRelay guarded browser runner

Isolated Chromium/Playwright service for explicitly approved, non-destructive synthetic journeys.

## Contract
- `GET /health`
- `POST /run` with `Authorization: Bearer $WEAVERELAY_BROWSER_RUNNER_TOKEN`
- Same-origin only.
- Network methods other than GET/HEAD are aborted.
- No typing, forms, uploads, downloads, dialogs, new windows, purchases, account changes, or arbitrary control clicks.
- `click-control` requires `data-weaverelay-safe-action` on the target.
- No screenshots, response bodies, cookies, headers, or form values are retained.

## Deployment
Build this directory as a separate container service. Use the same strong random token in the runner and the WeaveRelay Netlify environment. Set the Netlify-side `WEAVERELAY_BROWSER_RUNNER_URL` to the runner's HTTPS `/run` endpoint.

Do not expose the token to customer sites or browser JavaScript.
