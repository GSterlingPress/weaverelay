import fs from 'node:fs';
import crypto from 'node:crypto';

const statePath = process.env.WEAVERELAY_MONITOR_STATE_PATH || '.self-monitor-state.json';
const reportPath = process.env.WEAVERELAY_MONITOR_REPORT_PATH || '.self-monitor-report.json';
const outPath = process.env.WEAVERELAY_MONITOR_EVENT_PATH || '.self-monitor-event.json';

function readJson(path, fallback) {
  try { return JSON.parse(fs.readFileSync(path, 'utf8')); } catch { return fallback; }
}
function writeJson(path, value) { fs.writeFileSync(path, JSON.stringify(value, null, 2) + '\n'); }
function healthy(report) {
  const c = report?.classification || {};
  if (c.severity === 'critical') return false;
  const obs = report?.observations || {};
  const pass = x => x && (x.ok === true || (Number(x.status) >= 200 && Number(x.status) < 400));
  return pass(obs.apex) && pass(obs.www);
}
function incidentKey(report) {
  const c = report?.classification || {};
  return crypto.createHash('sha256').update(`${report?.target || 'weaverelay.com'}|${c.state || 'UNKNOWN'}|${c.repairClass || 'unknown'}`).digest('hex').slice(0, 20);
}

const now = new Date().toISOString();
const report = readJson(reportPath, null);
if (!report) throw new Error(`Missing monitor report: ${reportPath}`);
const previous = readJson(statePath, { schemaVersion: 1, phase: 'healthy', activeIncident: null, lastRecoveryAt: null });
const isHealthy = healthy(report);
let event = { type: 'none', send: false, generatedAt: now };
let next = { ...previous, schemaVersion: 1, lastCheckedAt: now, lastClassification: report.classification?.state || 'UNKNOWN' };

if (!isHealthy) {
  const key = incidentKey(report);
  if (previous.phase !== 'incident') {
    const incident = { id: key, openedAt: now, classification: report.classification?.state || 'UNKNOWN', repairClass: report.classification?.repairClass || 'unknown' };
    next = { ...next, phase: 'incident', activeIncident: incident };
    event = { type: 'incident', send: true, incident, report, generatedAt: now, idempotencyKey: `weaverelay-incident/${key}` };
  } else {
    next = { ...next, phase: 'incident', activeIncident: previous.activeIncident };
  }
} else if (previous.phase === 'incident' && previous.activeIncident) {
  const incident = previous.activeIncident;
  next = { ...next, phase: 'healthy', activeIncident: null, lastRecoveryAt: now, lastRecoveredIncidentId: incident.id };
  event = { type: 'recovery', send: true, incident, report, generatedAt: now, idempotencyKey: `weaverelay-recovery/${incident.id}` };
} else {
  next = { ...next, phase: 'healthy', activeIncident: null };
}

writeJson(statePath, next);
writeJson(outPath, event);
console.log(JSON.stringify({ state: next, event: { type: event.type, send: event.send, idempotencyKey: event.idempotencyKey || null } }, null, 2));
