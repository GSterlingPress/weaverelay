import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function run({ report, state }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wr-self-monitor-'));
  const reportPath = path.join(dir, 'report.json');
  const statePath = path.join(dir, 'state.json');
  const eventPath = path.join(dir, 'event.json');
  fs.writeFileSync(reportPath, JSON.stringify(report));
  if (state) fs.writeFileSync(statePath, JSON.stringify(state));
  const r = spawnSync(process.execPath, ['scripts/self-monitor-state.mjs'], {
    cwd: process.cwd(), encoding: 'utf8',
    env: { ...process.env, WEAVERELAY_MONITOR_REPORT_PATH: reportPath, WEAVERELAY_MONITOR_STATE_PATH: statePath, WEAVERELAY_MONITOR_EVENT_PATH: eventPath },
  });
  assert.equal(r.status, 0, r.stderr);
  return { state: JSON.parse(fs.readFileSync(statePath)), event: JSON.parse(fs.readFileSync(eventPath)) };
}
const probe = ok => ({ ok, status: ok ? 200 : 503 });
const report = (ok, classification=ok?'HEALTHY_OR_PARTIAL':'OUTAGE_UNRESOLVED') => ({
  target:'weaverelay.com', observations:{apex:probe(ok),www:probe(ok)},
  classification:{state:classification,severity:ok?'info':'critical',repairClass:ok?'none':'gather-evidence'}
});

test('first outage emits one incident event', () => {
  const r=run({report:report(false)});
  assert.equal(r.state.phase,'incident');
  assert.equal(r.event.type,'incident');
  assert.equal(r.event.send,true);
});

test('continuing outage is deduplicated', () => {
  const first=run({report:report(false)});
  const second=run({report:report(false),state:first.state});
  assert.equal(second.event.type,'none');
  assert.equal(second.event.send,false);
  assert.equal(second.state.activeIncident.id,first.state.activeIncident.id);
});

test('verified public recovery emits exactly one recovery', () => {
  const first=run({report:report(false)});
  const recovered=run({report:report(true),state:first.state});
  assert.equal(recovered.state.phase,'healthy');
  assert.equal(recovered.event.type,'recovery');
  assert.equal(recovered.event.send,true);
  const stable=run({report:report(true),state:recovered.state});
  assert.equal(stable.event.type,'none');
  assert.equal(stable.event.send,false);
});
