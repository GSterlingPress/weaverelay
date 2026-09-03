import { buildSelfMonitorReport, probeUrl } from '../netlify/functions/_self-monitor-core.mjs';

const apexUrl = process.env.WEAVERELAY_APEX_URL || 'https://weaverelay.com/';
const wwwUrl = process.env.WEAVERELAY_WWW_URL || 'https://www.weaverelay.com/';
const originUrl = process.env.WEAVERELAY_ORIGIN_URL || '';

async function readNetlifyStatus() {
  try {
    const response = await fetch('https://www.netlifystatus.com/api/v2/status.json', {
      headers: { 'user-agent': 'WeaveRelay-Independent-Self-Monitor/1.0' },
      cache: 'no-store',
    });
    if (!response.ok) return { netlifyOperational: null, status: response.status };
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

const [apex, www, origin, providerStatus] = await Promise.all([
  probeUrl(apexUrl),
  probeUrl(wwwUrl),
  originUrl ? probeUrl(originUrl) : Promise.resolve(null),
  readNetlifyStatus(),
]);

const report = buildSelfMonitorReport({ apex, www, origin, providerStatus });
console.log(JSON.stringify(report, null, 2));
if (report.classification.severity === 'critical') process.exitCode = 2;
