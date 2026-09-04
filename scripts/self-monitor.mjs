import fs from 'node:fs';
import { buildConfirmedSelfMonitorReport, buildSelfMonitorReport, probeUrl } from '../netlify/functions/_self-monitor-core.mjs';

const apexUrl = process.env.WEAVERELAY_APEX_URL || 'https://weaverelay.com/';
const wwwUrl = process.env.WEAVERELAY_WWW_URL || 'https://www.weaverelay.com/';
const originUrl = process.env.WEAVERELAY_ORIGIN_URL || '';
const reportPath = process.env.WEAVERELAY_MONITOR_REPORT_PATH || '.self-monitor-report.json';
const confirmationDelayMs = Math.max(0, Number(process.env.WEAVERELAY_CONFIRMATION_DELAY_MS || 20000));

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function readNetlifyStatus() {
  try {
    const response = await fetch('https://www.netlifystatus.com/api/v2/status.json', {
      headers: { 'user-agent': 'WeaveRelay-Independent-Self-Monitor/1.0' },
      cache: 'no-store',
    });
    if (!response.ok) return { netlifyOperational: null, status: response.status, observedAt: new Date().toISOString() };
    const body = await response.json();
    const indicator = body?.status?.indicator || 'unknown';
    return {
      netlifyOperational: indicator === 'none',
      indicator,
      description: body?.status?.description || null,
      observedAt: new Date().toISOString(),
    };
  } catch {
    return { netlifyOperational: null, error: 'status-unavailable', observedAt: new Date().toISOString() };
  }
}

async function probeRound() {
  const [apex, www, origin, providerStatus] = await Promise.all([
    probeUrl(apexUrl),
    probeUrl(wwwUrl),
    originUrl ? probeUrl(originUrl) : Promise.resolve(null),
    readNetlifyStatus(),
  ]);
  return { apex, www, origin, providerStatus };
}

const first = await probeRound();
if (confirmationDelayMs > 0) await sleep(confirmationDelayMs);
const second = await probeRound();
const report = buildConfirmedSelfMonitorReport({ first, second, confirmationIntervalMs: confirmationDelayMs });

fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
// Incident/recovery state is evaluated in a separate step so a confirmed critical
// outage can still persist state and send exactly one alert before the workflow fails.
