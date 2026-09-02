# WeaveRelay — UI and Provider Roadmap

**Status:** PRODUCT DIRECTION
**Updated:** 2026-09-02

## Sixth backend provider: RunPod

RunPod is locked in as the sixth backend provider after GitHub, Netlify, Railway, Supabase, and Stripe.

The customer application should visibly reserve a RunPod provider card now, but must label it **COMING NEXT** until WeaveRelay has a proven least-privilege connection probe, redaction rules, relationship checks, and safe repair boundaries. Do not expose a fake Connect action before those are implemented.

RunPod spend, GPU provisioning, endpoint creation/deletion, and other financially meaningful compute actions are not routine diagnostic writes. They require explicit authenticated approval and must not be performed merely to test a connection.

## Next-fix guidance under provider cards

A customer must never finish a diagnosis wondering what to click next.

Directly below the provider cards, WeaveRelay should maintain a persistent **NEXT FIX** guidance field. Its job is to convert the highest-priority current diagnosis into one plain-language instruction.

Current deterministic behavior is the safe baseline:

- no diagnosis yet → tell the customer to run a live diagnosis;
- healthy → say no current breakage needs action;
- broken/attention → identify the provider owning the highest-priority finding and tell the customer to click its red provider card;
- clicking a red provider card scrolls directly to the relevant finding and available FIX / OPEN PROVIDER action.

Future AI assistance may rewrite or prioritize this message for clarity, but AI must not invent provider state, repair eligibility, exact destinations, or approval requirements. The underlying diagnosis remains evidence-driven and deterministic; AI may explain the next action, not manufacture it.

## Stripe handler-secret repair UI

When failing-handler diagnosis proves exactly one missing Stripe webhook-signature configuration name, WeaveRelay may expose **ADD WEBHOOK SECRET**.

The customer enters the `whsec_...` value only inside a password-style field on the WeaveRelay application. The UI must:

1. state exactly what will be written;
2. require an explicit approval checkbox immediately before submission;
3. send the secret directly to the authenticated repair endpoint;
4. clear the field after success or failure;
5. never echo or redisplay the secret;
6. keep production redeploy as a separate later approval step;
7. require post-redeploy real Stripe delivery evidence before the chain can become PASS.
