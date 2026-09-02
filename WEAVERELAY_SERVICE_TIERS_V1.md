# WeaveRelay Service Tiers V1

**Status:** pricing/product contract for Early Access validation. This file does not activate billing or restrict existing users.

## Principle

Customers should not pay for the number of buttons WeaveRelay has. They should pay for how much backend pain WeaveRelay removes.

The ladder is:

**SEE IT → FIND IT → WATCH IT → HELP FIX IT**

Every higher tier includes the lower tier. Usage limits are initial hypotheses and should be changed from real Early Access behavior before a hard paywall is introduced.

## FREE — SEE IT

**Pain:** "I built an app and I don't know whether all of the services behind it are alive."

**Price hypothesis:** $0

- 1 app/workspace
- Connect supported providers
- MAP the stack
- Manual live diagnosis
- Limited diagnostic history
- No continuous monitoring
- No outage email alerts
- No automatic repair

**Job to be done:** prove WeaveRelay can see the customer's real stack and give a useful first answer.

## BUILDER — FIND IT

**Pain:** "Something broke and I am wasting hours bouncing among dashboards trying to find where."

**Price hypothesis:** $19/month

- Up to 3 apps/workspaces
- Everything in Free
- Unlimited manual diagnosis within fair-use limits
- Cross-system evidence and failure-boundary diagnosis
- Diagnostic history
- Guided next actions
- Manual, explicitly approved safe repairs where WeaveRelay has already proven the repair contract
- No unattended repair

**Job to be done:** replace dashboard-hopping with one place to find the failure boundary.

## PRO — WATCH IT

**Pain:** "I cannot keep checking whether my production app is still working. I need to know quickly when it breaks."

**Price hypothesis:** $49/month

- Up to 10 apps/workspaces
- Everything in Builder
- Continuous production-site monitoring
- Outage confirmation to reduce false alarms
- Automatic read-only diagnosis after a confirmed outage
- One useful outage email per incident
- Recovery email
- Monitoring/incident history
- RunPod/GPU cost-safety alerts when that provider integration is enabled
- No unattended repair by default

**Job to be done:** make WeaveRelay the always-on backend watchtower.

## AUTOPILOT — HELP FIX IT

**Pain:** "If a known, safe backend problem happens at 3 a.m., I want it repaired without waiting for me—but I do not want an AI making risky production changes."

**Price hypothesis:** $99+/month

- Everything in Pro
- Individually pre-approved repair policies for repair types WeaveRelay has already proven safe
- Objective precondition check before every repair
- Post-repair verification
- Audit trail
- Customer notification explaining what changed and whether recovery was verified
- Automatic fallback to alert-only whenever proof is insufficient

**Never unattended:** payments or purchases; destructive deletes/termination; broad permission changes; ownership/account changes; legal acceptance; customer production-data mutations; actions without a reliable postcondition; any repair not explicitly pre-approved by the customer.

**Job to be done:** safely remove the wake-up-and-fix-it burden for a narrow set of proven failures.

## Why this ladder should monetize repeatedly

The free product answers "what is connected?"

Builder answers "what broke?"

Pro answers "tell me when it breaks."

Autopilot answers "handle the safe, known failure for me."

The recurring subscription begins where the recurring burden begins: production monitoring, incidents, history, alerts, cost protection, and eventually tightly controlled repair.

## Early Access billing rule

Do not hard-paywall the first users yet. Instrument which workspaces return for diagnosis, which users enable monitoring, how often incidents occur, and which repair suggestions customers repeatedly approve. Use those observations to validate the $19 / $49 / $99+ hypotheses before enforcing plan limits.
