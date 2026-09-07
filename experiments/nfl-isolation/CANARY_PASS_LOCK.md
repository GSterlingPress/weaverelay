# THREE-ROOM CANARY ISOLATION — LOCKED PASS

Status: **PASS**
Run: GitHub Actions `34118881866`
Job: `101732041402`
Execution time: 2026-09-07 11:52:52Z–11:52:57Z
Deploy context: Netlify Deploy Preview for PR #37 (`deploy-preview-37--weaverelay.netlify.app`)
Model requested and reported by all three rooms: `gpt-5.6-sol`

## Locked safety facts

- `football_predictions_run=false`
- `outcomes_accessed=false`
- A/B/C were executed exactly once by the one-shot workflow step.
- The workflow first polled only the Deploy Preview root, then invoked the canary endpoint once.
- Each room returned only its own private canary.
- No peer canary appeared in another room's output.
- Every room reported `peer_content_seen=false` and `football_outcome_seen=false`.
- No NFL game data, score, winner, result, sample, or prediction task was supplied to any room.

## Request/output integrity

### Room A
- provider request id: `chatcmpl-ELSC4CBk7cEzck7Yz4YR6ovDAYf94`
- payload SHA-256: `25365a6d0ea10a4048c6e34c1d7ad2f5024101ee63038d959a7ff68b96d24c4a`
- raw first-output SHA-256: `9d8b7db168e899493620b17d3b6753152519f7cebcdf0cfb33699b3ba4ebb2cc`
- verdict: PASS

### Room B
- provider request id: `chatcmpl-ELSC6AgyQCs7N0YB7CfKWlhMVXWw1`
- payload SHA-256: `de75cd7fe65963953932b86c5fbfe5d4d7931573249ffbc0f60841450f235ec1`
- raw first-output SHA-256: `09e2efbe484684987ef61db6f81b01f9909c75e39761473fa7576605a97f0449`
- verdict: PASS

### Room C
- provider request id: `chatcmpl-ELSC7AOnGwA6o4enIZbkj58n8fDHU`
- payload SHA-256: `4f263287d1c00ad9bf69a3773ee59fb57b18201948488122a5e0ded31586dbef`
- raw first-output SHA-256: `e4e2d6c1d5008c229a0d48ffe2d964cb3b753f87a4ef194d4ecbcaed816b0619`
- verdict: PASS

## Whole-result integrity

- `canary-result.json` SHA-256: `dc2db28b10a1f7ab87a03f799c6145ff1168151cc7ff24c7b649a57d685ace07`
- uploaded artifact id: `10017370532`
- uploaded artifact ZIP SHA-256: `84dbf00db02b3b1429692f56f2b63aaced7bdce00eb23d2a2d32293ff21a41fc`
- artifact name: `nfl-isolation-canary-evidence`

## Experimental interpretation

This proves the implemented request/runtime boundary prevented A/B/C from receiving one another's canary or explicit peer output during this test. It does **not** prove that three instances of the same underlying pretrained model are statistically independent, nor does it eliminate historical facts that may exist in model weights. Those remain separate contamination questions for the later historical experiment.

No football prediction was run and no NFL outcome was accessed during this canary test.
