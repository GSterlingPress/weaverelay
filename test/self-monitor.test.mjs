import assert from 'node:assert/strict';
import test from 'node:test';
import { classifySelfOutage, buildSelfMonitorReport, buildConfirmedSelfMonitorReport } from '../netlify/functions/_self-monitor-core.mjs';

const pass = (url='https://origin.example') => ({ url, ok:true, status:200, observedAt:new Date().toISOString() });
const fail = (url='https://weaverelay.com') => ({ url, ok:false, status:503, observedAt:new Date().toISOString() });
const round = (healthy, origin=null) => ({
  apex: healthy ? pass('https://weaverelay.com') : fail('https://weaverelay.com'),
  www: healthy ? pass('https://www.weaverelay.com') : fail('https://www.weaverelay.com'),
  origin,
  providerStatus:{netlifyOperational:true},
});

test('healthy public endpoint does not trigger repair', () => {
  const r = classifySelfOutage({ apex:pass(), www:fail(), providerStatus:{netlifyOperational:true} });
  assert.equal(r.state, 'HEALTHY_OR_PARTIAL');
  assert.equal(r.safeAutoRepair, false);
});

test('public failure with healthy origin is edge/domain class', () => {
  const r = classifySelfOutage({ apex:fail(), www:fail(), origin:pass(), providerStatus:{netlifyOperational:true} });
  assert.equal(r.state, 'PUBLIC_EDGE_FAILURE');
  assert.equal(r.repairClass, 'dns-domain-proxy');
  assert.equal(r.safeAutoRepair, false);
});

test('public and origin failure while provider healthy is site/deploy class', () => {
  const r = classifySelfOutage({ apex:fail(), www:fail(), origin:fail('https://site.netlify.app'), providerStatus:{netlifyOperational:true} });
  assert.equal(r.state, 'SITE_OR_DEPLOY_FAILURE');
  assert.equal(r.safeAutoRepair, false);
});

test('provider incident is classified without dangerous mutation', () => {
  const r = classifySelfOutage({ apex:fail(), www:fail(), origin:null, providerStatus:{netlifyOperational:false} });
  assert.equal(r.state, 'PROVIDER_INCIDENT');
  assert.equal(r.repairClass, 'wait-provider');
});

test('ambiguous outage fails closed', () => {
  const report = buildSelfMonitorReport({ apex:fail(), www:fail(), providerStatus:{netlifyOperational:null} });
  assert.equal(report.classification.state, 'OUTAGE_UNRESOLVED');
  assert.equal(report.recovery.automaticMutationAllowed, false);
  assert.equal(report.recovery.verificationRequired, true);
});

test('one transient failed round does not declare an outage', () => {
  const report = buildConfirmedSelfMonitorReport({ first: round(false), second: round(true), confirmationIntervalMs: 20000 });
  assert.equal(report.classification.state, 'TRANSIENT_FAILURE_RECOVERED');
  assert.equal(report.classification.severity, 'warn');
  assert.equal(report.confirmation.outageConfirmed, false);
  assert.equal(report.confirmation.consecutiveFailures, 1);
  assert.equal(report.confirmation.recoveryConfirmed, false);
});

test('two consecutive failed rounds confirm sustained outage quickly', () => {
  const report = buildConfirmedSelfMonitorReport({ first: round(false), second: round(false), confirmationIntervalMs: 20000 });
  assert.equal(report.classification.severity, 'critical');
  assert.equal(report.confirmation.outageConfirmed, true);
  assert.equal(report.confirmation.requiredConsecutiveFailures, 2);
  assert.equal(report.confirmation.consecutiveFailures, 2);
});

test('two consecutive healthy rounds confirm recovery', () => {
  const report = buildConfirmedSelfMonitorReport({ first: round(true), second: round(true), confirmationIntervalMs: 20000 });
  assert.equal(report.classification.severity, 'info');
  assert.equal(report.confirmation.recoveryConfirmed, true);
  assert.equal(report.confirmation.requiredConsecutiveHealthy, 2);
  assert.equal(report.confirmation.consecutiveHealthy, 2);
});

test('healthy then failed confirmation is a recovery bounce, not recovery', () => {
  const report = buildConfirmedSelfMonitorReport({ first: round(true), second: round(false), confirmationIntervalMs: 20000 });
  assert.equal(report.confirmation.recoveryConfirmed, false);
  assert.equal(report.confirmation.consecutiveHealthy, 1);
  assert.notEqual(report.classification.severity, 'info');
});

test('one healthy round without confirmation cannot prove recovery', () => {
  const report = buildConfirmedSelfMonitorReport({ first: round(true), confirmationIntervalMs: 20000 });
  assert.equal(report.confirmation.recoveryConfirmed, false);
  assert.equal(report.confirmation.consecutiveHealthy, 1);
});
