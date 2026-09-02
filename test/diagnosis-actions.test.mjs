import test from 'node:test';
import assert from 'node:assert/strict';
import{diagnoseSnapshot}from'../netlify/functions/_diagnose.mjs';

test('provider failure exposes a safe reconnect repair and provider destination',()=>{
  const diagnosis=diagnoseSnapshot({product:'Test App',checks:[{id:'stripe.live',label:'Stripe',status:'FAIL',detail:'Stripe credential failed.',evidence:{source:'test'}}]});
  const finding=diagnosis.findings.find(x=>x.id==='stripe-unreachable');
  assert.ok(finding);
  assert.equal(finding.repair.supported,true);
  assert.equal(finding.repair.type,'reconnect-provider');
  assert.equal(finding.repair.provider,'stripe');
  assert.equal(finding.repair.approvalRequired,true);
  assert.match(finding.openProvider.url,/stripe\.com/);
  assert.equal(diagnosis.destructiveChangesAllowed,false);
});

test('Railway runtime and Stripe webhook checks map to specific guided repairs',()=>{
  const diagnosis=diagnoseSnapshot({product:'Test App',checks:[
    {id:'runtime.railway-env-coverage',label:'GitHub source → Railway runtime environment',status:'WARN',detail:'One runtime name is missing.',evidence:{source:'test'}},
    {id:'payments.stripe-webhooks',label:'Stripe webhook boundary',status:'WARN',detail:'Webhook metadata is not authorized.',evidence:{source:'test'}}
  ]});
  const railway=diagnosis.findings.find(x=>x.id==='railway-runtime-config');
  const stripe=diagnosis.findings.find(x=>x.id==='stripe-webhook-boundary');
  assert.ok(railway);
  assert.ok(stripe);
  assert.equal(railway.repair.supported,false);
  assert.equal(stripe.repair.supported,false);
  assert.match(railway.openProvider.url,/railway/);
  assert.match(stripe.openProvider.url,/stripe\.com/);
});
