# SEALED A/B/C EXECUTION SPEC — NFL MEMORY CONTAMINATION V1

Status: PREPARED, NOT EXECUTED.

## Frozen inputs

- Sample SHA-256: `9fd340caab5d273f9ec1b3124bf9d11153e7d81ade7341b2990ab9d5da63c479`
- Analyzer prompt SHA-256: `aa7829b8c9f40b860bbd35f58623b2ff6bd0b1600b886b174e25cd18d34d19d6`
- Output schema SHA-256: `7a2501ea3d422142942b9ab8a5e7c5fea7f37a06dbcacfcb3fbf4eb545070f9d`
- Model ID: `gpt-5.6-sol`
- API: OpenAI Responses API through Netlify AI Gateway.

## Request lock

Each room A/B/C is one independent stateless request. The room label is transport metadata and is NOT included in the model prompt. All three requests use byte-identical prompt, sample, schema, and request settings:

- `model: gpt-5.6-sol`
- `store: false`
- `reasoning.effort: none`
- `tools: []`
- no `previous_response_id`
- same `instructions`
- same 100-game input bytes
- same strict JSON Schema under `text.format`
- `max_output_tokens: 12000`

No web search, file search, functions, MCP, or other model tools are supplied.

## Fail-closed execution gate

The Netlify Function refuses execution unless all of the following hold before the model request:

1. HTTP method is POST.
2. A server-side `NFL_MEMORY_EXECUTION_ARM` value exists and matches the request header.
3. Body contains exactly one field, `room`, whose value is A, B, or C.
4. The room has never previously been claimed.
5. Sample, prompt, and schema are re-fetched from the locked branch and match their committed SHA-256 values byte-for-byte.
6. The sample revalidates as exactly 100 unique games, seasons 2011–2025, 6 or 7 per season, and regular-season week bounds.
7. Netlify AI Gateway OpenAI environment is present.

Immediately BEFORE the outbound model request, an atomic `onlyIfNew` room claim is written to a strongly-read Netlify Blobs store. Once claimed, that room cannot be rerun by this package, including after a transport failure, HTTP failure, malformed output, model mismatch, or validation failure.

The first upstream response body is stored before semantic validation. A malformed first output is therefore preserved and the room remains permanently claimed rather than silently retried.

## Post-response validation and seal

A valid first response must:

- report `status=completed`;
- report returned model exactly `gpt-5.6-sol`;
- have no `previous_response_id`;
- contain exactly 100 results in frozen sample order;
- preserve every `game_id` exactly;
- use REMEMBER only YES/MAYBE/NO;
- choose winner only from the two supplied teams;
- use integer confidence 0–100;
- use score exactly `UNKNOWN` or the locked team-order score format.

The sealed record contains hashes of the raw provider response and parsed structured output, response ID, returned model, lock hashes, request-state assertions, and the 100 results. It is written with `onlyIfNew` so an existing seal cannot be overwritten by the runner.

## Execution order

When separately authorized: deploy this package only to a disposable Netlify project with AI Gateway active, set a fresh server-side execution-arm value, invoke A once, B once, C once, then export and commit all first-attempt records/hashes before any outcome lookup. Do not score or reveal outcomes until all three first attempts are committed.

## Current stop point

No A/B/C request has been sent. No outcome lookup or scoring is authorized. The next irreversible action is the first room invocation.
