import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceMonitorState,buildOutageEmail,buildRecoveryEmail,normalizeMonitoring,isMonitorDue } from '../netlify/functions/_monitoring.mjs';

test('monitoring defaults are conservative',()=>{
  const value=normalizeMonitoring({});
  assert.equal(value.enabled,false);
  assert.equal(value.failureThreshold,2);
  assert.equal(value.autoRepairMode,'off');
});

test('monitor interval is honored instead of checking every scheduler tick',()=>{
  const last='2026-09-02T19:00:00.000Z';
  assert.equal(isMonitorDue({lastCheckedAt:last},{enabled:true,intervalMinutes:15},Date.parse('2026-09-02T19:05:00.000Z')),false);
  assert.equal(isMonitorDue({lastCheckedAt:last},{enabled:true,intervalMinutes:15},Date.parse('2026-09-02T19:15:00.000Z')),true);
  assert.equal(isMonitorDue({},{enabled:false,intervalMinutes:5},Date.parse('2026-09-02T19:15:00.000Z')),false);
});

test('one failed check does not page the customer by default',()=>{
  const next=advanceMonitorState({}, {status:'broken',detail:'timeout',checkedAt:'2026-09-02T19:00:00.000Z'}, {enabled:true,emailAlerts:true}, '2026-09-02T19:00:00.000Z');
  assert.equal(next.status,'attention');
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

test('functional backend incident email does not falsely say the whole site is down',()=>{
  const mail=buildOutageEmail({workspace:{name:'Studio One'},observation:{incidentKind:'critical-dependency',detail:'The website loads, but Railway → Supabase is failing.'},diagnosis:null,checkedAt:'2026-09-02T19:05:00.000Z'});
  assert.match(mail.subject,/loads, but its backend is failing/i);
  assert.doesNotMatch(mail.subject,/may be down/i);
  assert.match(mail.text,/website loads/i);
});

test('business-function incident email identifies a broken function',()=>{
  const mail=buildOutageEmail({workspace:{name:'Studio One'},observation:{incidentKind:'business-function',detail:'The website loads, but ComfyUI is unhealthy.'},diagnosis:null,checkedAt:'2026-09-02T19:05:00.000Z'});
  assert.match(mail.subject,/critical function is broken/i);
});

test('functional recovery email says the monitored function recovered',()=>{
  const mail=buildRecoveryEmail({workspace:{name:'Studio One'},observation:{incidentKind:'critical-dependency',detail:'The backend path is healthy again.'},checkedAt:'2026-09-02T19:15:00.000Z'});
  assert.match(mail.subject,/monitored function is healthy again/i);
  assert.match(mail.text,/healthy again/i);
});

test('recovery email is explicit',()=>{
  const mail=buildRecoveryEmail({workspace:{name:'Studio One'},observation:{detail:'The production site answered HTTP 200.'},checkedAt:'2026-09-02T19:15:00.000Z'});
  assert.match(mail.subject,/recovery/i);
  assert.match(mail.text,/responding again/i);
});
