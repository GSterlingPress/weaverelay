import assert from 'node:assert/strict';
import test from 'node:test';
import { classifySelfOutage, buildSelfMonitorReport } from '../netlify/functions/_self-monitor-core.mjs';

const pass = (url='https://origin.example') => ({ url, ok:true, status:200, observedAt:new Date().toISOString() });
const fail = (url='https://weaverelay.com') => ({ url, ok:false, status:503, observedAt:new Date().toISOString() });

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
