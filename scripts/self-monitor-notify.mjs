import fs from 'node:fs';

const eventPath = process.env.WEAVERELAY_MONITOR_EVENT_PATH || '.self-monitor-event.json';
const event = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
if (!event.send) {
  console.log('No notification transition.');
  process.exit(0);
}
const apiKey = process.env.RESEND_API_KEY;
const to = process.env.WEAVERELAY_ALERT_TO;
const from = process.env.WEAVERELAY_ALERT_FROM || 'WeaveRelay Monitor <monitor@weaverelay.com>';
if (!apiKey || !to) {
  if (process.env.WEAVERELAY_NOTIFICATION_DRY_RUN === '1') {
    console.log(JSON.stringify({ dryRun: true, type: event.type, idempotencyKey: event.idempotencyKey }, null, 2));
    process.exit(0);
  }
  console.error('Notification transition exists, but RESEND_API_KEY or WEAVERELAY_ALERT_TO is missing.');
  process.exit(3);
}
const c = event.report?.classification || {};
const isRecovery = event.type === 'recovery';
const subject = isRecovery ? 'RECOVERED — WeaveRelay is responding again' : `OUTAGE — WeaveRelay ${c.state || 'unavailable'}`;
const text = isRecovery
  ? `WeaveRelay recovery verified.\n\nIncident: ${event.incident?.id}\nRecovered: ${event.generatedAt}\nApex and www both passed the independent public checks.\n\nThe monitor will continue watching.`
  : `WeaveRelay independent monitor detected an outage.\n\nIncident: ${event.incident?.id}\nDetected: ${event.generatedAt}\nClassification: ${c.state || 'UNKNOWN'}\nRepair class: ${c.repairClass || 'unknown'}\nReason: ${c.reason || 'Unavailable'}\nNext proof: ${c.nextProof || 'Gather independent evidence before mutation.'}\n\nNo DNS, domain, or production deploy mutation was performed automatically.`;
const response = await fetch('https://api.resend.com/emails', {
  method: 'POST',
  headers: {
    authorization: `Bearer ${apiKey}`,
    'content-type': 'application/json',
    'idempotency-key': event.idempotencyKey,
  },
  body: JSON.stringify({ from, to: [to], subject, text }),
});
if (!response.ok) {
  console.error(`Resend notification failed: HTTP ${response.status}`);
  process.exit(4);
}
const result = await response.json();
console.log(JSON.stringify({ sent: true, type: event.type, id: result?.id || null }, null, 2));
