import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceMonitorState,buildOutageEmail,buildRecoveryEmail,normalizeMonitoring } from '../netlify/functions/_monitoring.mjs';

test('monitoring defaults are conservative',()=>{
  const value=normalizeMonitoring({});
  assert.equal(value.enabled,false);
  assert.equal(value.failureThreshold,2);
  assert.equal(value.autoRepairMode,'off');
});

test('one failed check does not page the customer by default',()=>{
  const next=advanceMonitorState({}, {status:'broken',detail:'timeout',checkedAt:'2026-09-02T19:00:00.000Z'}, {enabled:true,emailAlerts:true}, '2026-09-02T19:00:00.000Z');
  assert.equal(next.status,'broken'===next.status?'unexpected':'attention');
  assert.equal(next.shouldAlertDown,false);
  assert.equal(next.consecutiveFailures,1);
});

test('two consecutive failures create one incident alert and do not spam',()=>{
  const first=advanceMonitorState({}, {status:'broken',detail:'timeout',checkedAt:'2026-09-02T19:00:00.000Z'}, {enabled:true,emailAlerts:true}, '2026-09-02T19:00:00.000Z');
  const second=advanceMonitorState(first, {status:'broken',detail:'timeout',checkedAt:'2026-09-02T19:05:00.000Z'}, {enabled:true,emailAlerts:true}, '2026-09-02T19:05:00.000Z');
  assert.equal(second.status,'broken');
  assert.equal(second.shouldAlertDown,true);
  assert.ok(second.incidentId);
  const third=advanceMonitorState(second, {status:'broken',detail:'HTTP 503',checkedAt:'2026-09-02T19:10:00.000Z'}, {enabled:true,emailAlerts:true}, '2026-09-02T19:10:00.000Z');
  assert.equal(third.shouldAlertDown,false);
  assert.equal(third.incidentId,second.incidentId);
});

test('recovery after an alerted incident produces one recovery notification',()=>{
  const broken={status:'broken',incidentId:'incident-1',alertedAt:'2026-09-02T19:05:00.000Z',consecutiveFailures:3};
  const recovered=advanceMonitorState(broken,{status:'healthy',detail:'HTTP 200',checkedAt:'2026-09-02T19:15:00.000Z'},{enabled:true,recoveryAlerts:true},'2026-09-02T19:15:00.000Z');
  assert.equal(recovered.status,'healthy');
  assert.equal(recovered.shouldAlertRecovery,true);
  assert.equal(recovered.incidentId,null);
});

test('outage email states that automatic repair was not silently attempted',()=>{
  const mail=buildOutageEmail({workspace:{name:'Studio One'},observation:{detail:'The production site timed out.'},diagnosis:{findings:[{title:'Railway connection is failing',explanation:'Railway did not answer.',severity:'high'}]},checkedAt:'2026-09-02T19:05:00.000Z'});
  assert.match(mail.subject,/Studio One/);
  assert.match(mail.text,/Automatic repair: not attempted/);
  assert.match(mail.text,/Railway connection is failing/);
});

test('recovery email is explicit',()=>{
  const mail=buildRecoveryEmail({workspace:{name:'Studio One'},observation:{detail:'The production site answered HTTP 200.'},checkedAt:'2026-09-02T19:15:00.000Z'});
  assert.match(mail.subject,/recovery/i);
  assert.match(mail.text,/responding again/i);
});
