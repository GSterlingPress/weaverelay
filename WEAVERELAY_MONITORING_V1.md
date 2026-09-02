# WeaveRelay Monitoring V1

**Branch:** `monitor-alerts-v1-2026-09-02`

**Production status:** NOT DEPLOYED / NOT MERGED

## Goal

Turn WeaveRelay from an on-demand diagnostic tool into an ongoing protection layer:

**MONITOR → CONFIRM OUTAGE → AUTO-DIAGNOSE → SAFE REPAIR WHEN PRE-APPROVED → ALERT → VERIFY RECOVERY**

Monitoring V1 implements the monitoring, outage confirmation, lightweight automatic diagnosis, email alert, deduplication, and recovery-notice foundation. It deliberately does **not** execute automatic repair yet.

## Current V1 behavior

- Monitoring is opt-in and defaults OFF.
- Enabled workspaces are scheduled for a public HTTPS check every five minutes.
- A single failed probe does not page the customer by default.
- Two consecutive failed probes confirm an incident by default.
- On confirmed failure, WeaveRelay runs read-only provider probes against already connected providers to add diagnostic context.
- It sends one outage email to the verified workspace owner's account email using the existing Resend configuration.
- It does not repeatedly email for the same incident.
- When the public site responds successfully again, it can send one recovery email.
- Monitor state is stored separately from customer workspace/provider credential records.
- No secret values, provider response bodies, or customer application data are included in alert content.

## Automatic repair boundary

Monitoring V1 does not silently execute any existing WeaveRelay repair action.

The configuration model reserves `autoRepairMode: preapproved-only`, but the scheduled monitor records that no automatic repair was attempted until a separate pre-approval contract is implemented and tested.

A future automatic repair may run only when all of the following are true:

1. the repair type is already individually supported by WeaveRelay;
2. the customer explicitly opted into that exact repair policy while authenticated;
3. the diagnosis proves the same narrow preconditions required by the manual guided repair;
4. the action is reversible or has a safe rollback path;
5. the action has an objective postcondition check;
6. financial, destructive, ownership, legal, broad-permission, production-data, and other high-impact actions remain outside unattended repair.

If no pre-approved repair is both safe and provable, WeaveRelay alerts instead of guessing.

## Alert philosophy

An outage alert should be useful, not merely say "your website is down."

When evidence exists, the email includes the strongest current diagnostic finding. It also states whether automatic repair was attempted. The customer is directed back to WeaveRelay for the complete evidence and next action.

## Files

- `netlify/functions/_monitoring.mjs` — pure monitoring policy, outage confirmation, site probe, alert/recovery email builders.
- `netlify/functions/monitor-workspaces.mjs` — Netlify scheduled monitor and read-only provider diagnostic context.
- `netlify/functions/workspace-monitoring.mjs` — authenticated monitoring settings endpoint.
- `test/monitoring.test.mjs` — outage confirmation, deduplication, recovery, and alert-content tests.

## Release gate

Do not merge this branch into `main` while another chat or development stream is actively modifying WeaveRelay production.

Before production merge:

1. rebase/reconcile against current `main`;
2. run the full repository test/build suite;
3. confirm Netlify recognizes the scheduled function configuration;
4. verify Resend sender configuration in production;
5. enable monitoring only for an explicit test workspace;
6. simulate failure with a controlled test URL rather than taking Studio One down;
7. verify exactly one outage email and one recovery email;
8. verify no repair/write/spend action occurs;
9. only then expose the monitoring toggle to Early Access customers.
