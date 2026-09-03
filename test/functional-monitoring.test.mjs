import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyOperationalHealth } from '../netlify/functions/_functional-monitoring.mjs';

test('public outage remains a site outage',()=>{
  const r=classifyOperationalHealth({siteObservation:{status:'broken',detail:'HTTP 503'},checks:[]});
  assert.equal(r.status,'broken');
  assert.equal(r.incidentKind,'site-outage');
});

test('HTTP 200 plus proven backend relationship failure is broken',()=>{
  const r=classifyOperationalHealth({siteObservation:{status:'healthy',detail:'HTTP 200'},checks:[{id:'map.app-railway',status:'FAIL',detail:'App points to an unowned Railway host.'}]});
  assert.equal(r.status,'broken');
  assert.equal(r.incidentKind,'critical-dependency');
  assert.equal(r.publicSiteHealthy,true);
});

test('HTTP 200 plus proven ComfyUI failure is a business-function incident',()=>{
  const r=classifyOperationalHealth({siteObservation:{status:'healthy',detail:'HTTP 200'},checks:[{id:'map.app-runpod-comfyui',status:'FAIL',detail:'ComfyUI did not answer.'}]});
  assert.equal(r.status,'broken');
  assert.equal(r.incidentKind,'business-function');
});

test('provider credential failure alone never becomes app outage',()=>{
  const r=classifyOperationalHealth({siteObservation:{status:'healthy',detail:'HTTP 200'},checks:[{id:'resend.live',label:'Resend',status:'FAIL',detail:'401'}]});
  assert.equal(r.status,'healthy');
  assert.equal(r.incidentKind,'control-plane');
});

test('HTTP 200 with no proven critical failure stays healthy',()=>{
  const r=classifyOperationalHealth({siteObservation:{status:'healthy',detail:'HTTP 200'},checks:[{id:'map.app-railway',status:'PASS'}]});
  assert.equal(r.status,'healthy');
  assert.equal(r.incidentKind,'healthy');
});
