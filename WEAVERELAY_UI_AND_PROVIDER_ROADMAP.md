# WeaveRelay — UI and Provider Roadmap

**Status:** PRODUCT DIRECTION
**Updated:** 2026-09-02

## Unified provider control plane

WeaveRelay should increasingly behave like a **unified provider control plane**: one customer workspace containing small, evidence-backed live windows into the external services that power the application.

A provider window is not a cloned provider dashboard and must not pretend to replace the provider. It should expose only the small subset of provider state and actions that directly matter to the connected application:

- current live health and relationship status;
- the few operational facts needed to understand what is happening now;
- cost/risk signals when they materially affect the customer's next action;
- the exact safe action WeaveRelay can perform with current authorization;
- a precise provider destination when WeaveRelay cannot safely act;
- verification immediately after every approved write.

This creates a coherent experience across GitHub, Netlify, Railway, Supabase, Stripe, RunPod and ComfyUI: the customer can see the relevant slice of each system without repeatedly hunting through separate dashboards. Read-only evidence remains the default; write controls appear only when the action is narrow, proven, permissioned, explicitly approved when required, and verifiable.

RunPod is the first strong operational example: its provider window may show running Pods, current effective hourly Pod rate when RunPod exposes it, stop eligibility, exact-Pod STOP controls, and an emergency reviewed-scope STOP ALL control. It must never silently expand an approved stop scope to Pods that appeared after the customer reviewed the panel.

## Sixth backend provider: RunPod

RunPod is locked in as the sixth backend provider after GitHub, Netlify, Railway, Supabase, and Stripe.

The customer application should visibly reserve a RunPod provider card now, but must label it **COMING NEXT** until WeaveRelay has a proven least-privilege connection probe, redaction rules, relationship checks, and safe repair boundaries. Do not expose a fake Connect action before those are implemented.

RunPod spend, GPU provisioning, endpoint creation/deletion, and other financially meaningful compute actions are not routine diagnostic writes. They require explicit authenticated approval and must not be performed merely to test a connection.

### RunPod cost safety and emergency stopping

When RunPod exposes `adjustedCostPerHr`, WeaveRelay should use it as the effective current Pod rate because it reflects active Savings Plans; otherwise it may fall back to `costPerHr`. Rates must be labeled as RunPod credits/hour unless a stronger currency fact is proven.

The RunPod provider window should show running Pod count, per-Pod effective rate when available, total known effective hourly rate, and whether each running Pod can safely be stopped through RunPod's stop operation.

A single STOP POD action must re-prove the exact Pod in the connected account immediately before stopping it. A bulk emergency action must require explicit approval and carry an exact reviewed list of Pod IDs. The server must re-read current RunPod inventory and may stop only the intersection of that reviewed list with Pods that are still safely stoppable. Newly discovered or newly started Pods must never be silently added to the approved scope.

Locked Pods and Pods with network volumes remain blocked from automatic stopping. WeaveRelay must not convert a STOP request into termination.

## Seventh backend layer: ComfyUI

ComfyUI is a separate open-source workflow/runtime application, not a component that exists only inside RunPod. It can run locally, on another host, on a RunPod Pod, or behind a RunPod Serverless endpoint. RunPod therefore represents the **compute/infrastructure layer**, while ComfyUI represents the **workflow/API application layer**.

WeaveRelay will treat ComfyUI as the seventh backend integration/test card because both layers can fail independently. A RunPod endpoint can be healthy while the ComfyUI workflow/API is broken, and ComfyUI can be healthy while the RunPod compute or endpoint configuration is unhealthy.

The customer application should reserve a ComfyUI card now labeled **COMING NEXT**. Future diagnosis should separately prove, where applicable:

- RunPod account / Pod / Serverless endpoint health;
- the intended RunPod endpoint belongs to this app;
- ComfyUI is actually reachable on the intended runtime;
- the expected ComfyUI API/workflow contract exists;
- required models/custom nodes/workflow dependencies are present where safe to inspect;
- app → RunPod → ComfyUI relationships agree;
- any GPU provisioning, scaling, storage, or spend-affecting repair remains separately approval-gated.

## VACE is a ComfyUI dependency, not provider #8

Wan VACE is not a separate hosted backend account like RunPod, Railway, Stripe, or Supabase. It is a video-generation/editing model family and conditioning capability used inside a ComfyUI workflow. WeaveRelay should therefore test VACE underneath the ComfyUI card rather than ask the customer to connect a separate VACE provider.

The dependency chain is:

**APPLICATION → RUNPOD → COMFYUI → WORKFLOW → VACE / MODELS / NODES**

For a VACE-based application, the workflow verifier should derive the exact node classes and model filenames referenced by the application's selected workflow, compare those requirements with ComfyUI's read-only `/object_info` metadata, and distinguish at minimum:

- exact required node missing;
- exact referenced model missing from the corresponding loader inventory;
- VACE node available but model inventory not provable;
- workflow compatible with the live ComfyUI runtime.

The product may retain the small set of exact missing non-secret dependency names needed to tell the customer what to fix, but it should not retain the full ComfyUI node/model inventory or response bodies. It must never start a GPU workload merely to prove a VACE dependency.

## Next-fix guidance under provider cards

A customer must never finish a diagnosis wondering what to click next.

Directly below the provider cards, WeaveRelay should maintain a persistent **NEXT FIX** guidance field. Its job is to convert the highest-priority current diagnosis into one plain-language instruction.

Current deterministic behavior is the safe baseline:

- no diagnosis yet → tell the customer to run a live diagnosis;
- healthy → say no current breakage needs action;
- broken/attention → identify the provider owning the highest-priority finding and tell the customer to click its red provider card;
- clicking a red provider card scrolls directly to the relevant finding and available FIX / OPEN PROVIDER action.

Future AI assistance may rewrite or prioritize this message for clarity, but AI must not invent provider state, repair eligibility, exact destinations, or approval requirements. The underlying diagnosis remains evidence-driven and deterministic; AI may explain the next action, not manufacture it.

## Stripe handler-secret repair UI and verification chain

When failing-handler diagnosis proves exactly one missing Stripe webhook-signature configuration name, WeaveRelay may expose **ADD WEBHOOK SECRET**.

The customer enters the `whsec_...` value only inside a password-style field on the WeaveRelay application. The UI must:

1. state exactly what will be written;
2. require an explicit approval checkbox immediately before submission;
3. send the secret directly to the authenticated repair endpoint;
4. clear the field after success or failure;
5. never echo or redisplay the secret;
6. keep production redeploy as a separate later approval step;
7. require post-redeploy real Stripe delivery evidence before the chain can become PASS.

The redeploy verifier now supports this handler-secret repair as well as the Railway → Supabase repair. After the secret variable is saved, **REDEPLOY & VERIFY** targets only the already-proven Railway service/environment. A successful Railway deployment plus live backend reachability is required before Stripe delivery verification resumes. Stripe delivery proof then considers only events after the latest handler-repair/redeploy boundary, so an older successful event cannot falsely verify the new repair.
