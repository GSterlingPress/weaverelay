import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyOperationalHealth,customerIncidentSummary } from '../netlify/functions/_functional-monitoring.mjs';

test('public outage remains a site outage',()=>{
  const r=classifyOperationalHealth({siteObservation:{status:'broken',detail:'HTTP 503'},checks:[]});
  assert.equal(r.status,'broken');
  assert.equal(r.incidentKind,'site-outage');
  assert.equal(r.where,'Public website');
});

test('HTTP 200 plus proven backend relationship failure is broken',()=>{
  const r=classifyOperationalHealth({siteObservation:{status:'healthy',detail:'HTTP 200'},checks:[{id:'map.app-railway',label:'App → Railway',status:'FAIL',detail:'App points to an unowned Railway host.'}]});
  assert.equal(r.status,'broken');
  assert.equal(r.incidentKind,'critical-dependency');
  assert.equal(r.publicSiteHealthy,true);
  assert.equal(r.where,'App → Railway');
});

test('HTTP 200 plus proven ComfyUI failure is a business-function incident',()=>{
  const r=classifyOperationalHealth({siteObservation:{status:'healthy',detail:'HTTP 200'},checks:[{id:'map.app-runpod-comfyui',label:'App → RunPod / ComfyUI',status:'FAIL',detail:'ComfyUI did not answer.'}]});
  assert.equal(r.status,'broken');
  assert.equal(r.incidentKind,'business-function');
  assert.match(r.title,/AI function/i);
});

test('provider credential failure alone never becomes app outage',()=>{
  const r=classifyOperationalHealth({siteObservation:{status:'healthy',detail:'HTTP 200'},checks:[{id:'resend.live',label:'Resend',status:'FAIL',detail:'401'}]});
  assert.equal(r.status,'healthy');
  assert.equal(r.incidentKind,'control-plane');
  assert.equal(r.publicSiteHealthy,true);
});

test('HTTP 200 with no proven critical failure stays healthy',()=>{
  const r=classifyOperationalHealth({siteObservation:{status:'healthy',detail:'HTTP 200'},checks:[{id:'map.app-railway',status:'PASS'}]});
  assert.equal(r.status,'healthy');
  assert.equal(r.incidentKind,'healthy');
});

test('customer incident summary names the broken boundary without secret evidence',()=>{
  const operational=classifyOperationalHealth({siteObservation:{status:'healthy',detail:'HTTP 200'},checks:[{id:'map.railway-supabase',label:'Railway → Supabase',status:'FAIL',detail:'The runtime points to a different Supabase project.',evidence:{token:'must-not-leak'}}]});
  const summary=customerIncidentSummary(operational);
  assert.equal(summary.active,true);
  assert.equal(summary.kind,'critical-dependency');
  assert.equal(summary.whereItBreaks,'Railway → Supabase');
  assert.equal(summary.evidence.id,'map.railway-supabase');
  assert.equal(summary.evidence.label,'Railway → Supabase');
  assert.equal('token' in summary.evidence,false);
  assert.equal(summary.automaticRepairAttempted,false);
});

test('healthy summary is not an active incident',()=>{
  const summary=customerIncidentSummary(classifyOperationalHealth({siteObservation:{status:'healthy',detail:'HTTP 200'},checks:[]}));
  assert.equal(summary.active,false);
  assert.equal(summary.kind,'healthy');
});
