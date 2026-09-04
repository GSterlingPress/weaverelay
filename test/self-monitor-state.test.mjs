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
const report = (ok, classification=ok?'HEALTHY_OR_PARTIAL':'OUTAGE_UNRESOLVED', recoveryConfirmed=ok) => ({
  target:'weaverelay.com',
  observations:{apex:probe(ok),www:probe(ok)},
  classification:{state:classification,severity:ok?'info':'critical',repairClass:ok?'none':'gather-evidence'},
  confirmation:{
    requiredConsecutiveFailures:2,
    consecutiveFailures:ok?0:2,
    outageConfirmed:!ok,
    requiredConsecutiveHealthy:2,
    consecutiveHealthy:recoveryConfirmed?2:(ok?1:0),
    recoveryConfirmed,
  },
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

test('one recovered hostname is not enough to announce recovery', () => {
  const first=run({report:report(false)});
  const partial={...report(true,'HEALTHY_OR_PARTIAL',false),observations:{apex:probe(true),www:probe(false)}};
  const r=run({report:partial,state:first.state});
  assert.equal(r.state.phase,'incident');
  assert.equal(r.event.send,false);
});

test('single healthy round does not close an incident', () => {
  const first=run({report:report(false)});
  const candidate=run({report:report(true,'HEALTHY_OR_PARTIAL',false),state:first.state});
  assert.equal(candidate.state.phase,'incident');
  assert.equal(candidate.event.type,'none');
  assert.equal(candidate.event.send,false);
  assert.ok(candidate.state.recoveryCandidateAt);
});

test('recovery bounce resets candidate and keeps incident open', () => {
  const first=run({report:report(false)});
  const candidate=run({report:report(true,'HEALTHY_OR_PARTIAL',false),state:first.state});
  const bounced=run({report:report(false),state:candidate.state});
  assert.equal(bounced.state.phase,'incident');
  assert.equal(bounced.event.send,false);
  assert.equal(bounced.state.recoveryCandidateAt,null);
});

test('two consecutive healthy probe rounds emit exactly one recovery', () => {
  const first=run({report:report(false)});
  const recovered=run({report:report(true,'HEALTHY_OR_PARTIAL',true),state:first.state});
  assert.equal(recovered.state.phase,'healthy');
  assert.equal(recovered.event.type,'recovery');
  assert.equal(recovered.event.send,true);
  const stable=run({report:report(true,'HEALTHY_OR_PARTIAL',true),state:recovered.state});
  assert.equal(stable.event.type,'none');
  assert.equal(stable.event.send,false);
});
