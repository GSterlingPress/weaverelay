import test from'node:test';
import assert from'node:assert/strict';
import{prioritizeDiagnosis}from'../netlify/functions/_diagnosis-priority.mjs';

const finding=(id,{severity='high',provider=null,repair=null,evidence=[]}={})=>({id,title:id,severity,provider,evidence,repair:repair||{supported:false,approvalRequired:true,label:'GUIDED'}});
const snap=checks=>({checks});

test('provider outage blocks downstream repairs that depend on unreadable provider evidence',()=>{
  const diagnosis={findings:[
    finding('railway-supabase-mismatch',{severity:'critical',provider:'railway',evidence:['map.railway-supabase'],repair:{supported:true,approvalRequired:true,type:'railway-supabase-url',provider:'railway',label:'FIX'}}),
    finding('railway-unreachable',{provider:'railway',evidence:['railway.runtime'],repair:{supported:true,approvalRequired:true,type:'reconnect-provider',provider:'railway',label:'RECONNECT'}})
  ]};
  const out=prioritizeDiagnosis(diagnosis,snap([{id:'railway.runtime',status:'FAIL',evidence:{}},{id:'map.railway-supabase',status:'FAIL',evidence:{}}]));
  assert.equal(out.primaryFinding.id,'railway-unreachable');
  const downstream=out.findings.find(f=>f.id==='railway-supabase-mismatch');
  assert.equal(downstream.blockedBy,'railway-unreachable');
  assert.equal(downstream.actionableNow,false);
  assert.equal(out.safeRepairs.find(r=>r.finding==='railway-supabase-mismatch').supported,false);
});

test('exact verified repair target outranks a generic outage symptom',()=>{
  const diagnosis={findings:[
    finding('public-app-unreachable',{severity:'critical',provider:'netlify',evidence:['app.public']}),
    finding('netlify-production-rebuild',{provider:'netlify',evidence:['env.netlify-deploy-state'],repair:{supported:true,approvalRequired:true,type:'netlify-redeploy',provider:'netlify',label:'REBUILD & VERIFY'}})
  ]};
  const out=prioritizeDiagnosis(diagnosis,snap([{id:'app.public',status:'FAIL',evidence:{}},{id:'env.netlify-deploy-state',status:'FAIL',evidence:{}}]));
  assert.equal(out.primaryFinding.id,'netlify-production-rebuild');
  assert.equal(out.findings[0].id,'netlify-production-rebuild');
});

test('failed post-repair verification outranks starting a second repair',()=>{
  const diagnosis={findings:[
    finding('railway-runtime-verification-failed',{provider:'railway',evidence:['repair.railway-runtime']}),
    finding('netlify-production-rebuild',{provider:'netlify',evidence:['env.netlify-deploy-state'],repair:{supported:true,approvalRequired:true,type:'netlify-redeploy',provider:'netlify',label:'REBUILD'}})
  ]};
  const out=prioritizeDiagnosis(diagnosis,snap([{id:'repair.railway-runtime',status:'FAIL',evidence:{}},{id:'env.netlify-deploy-state',status:'FAIL',evidence:{}}]));
  assert.equal(out.primaryFinding.id,'railway-runtime-verification-failed');
});

test('independent customer-impacting function failure outranks unrelated control-plane reconnect',()=>{
  const diagnosis={findings:[
    finding('github-unreachable',{provider:'github',evidence:['github.live'],repair:{supported:true,approvalRequired:true,type:'reconnect-provider',provider:'github',label:'RECONNECT'}}),
    finding('stripe-webhook-handler-failing',{severity:'critical',provider:'stripe',evidence:['repair.stripe-webhook-delivery']})
  ]};
  const out=prioritizeDiagnosis(diagnosis,snap([{id:'github.live',status:'FAIL',evidence:{}},{id:'repair.stripe-webhook-delivery',status:'FAIL',evidence:{}}]));
  assert.equal(out.primaryFinding.id,'stripe-webhook-handler-failing');
});

test('explicitly stale evidence cannot beat a fresh actionable finding',()=>{
  const diagnosis={findings:[
    finding('netlify-production-rebuild',{provider:'netlify',evidence:['env.netlify-deploy-state'],repair:{supported:true,approvalRequired:true,type:'netlify-redeploy',provider:'netlify',label:'REBUILD'}}),
    finding('github-netlify-link',{provider:'netlify',evidence:['map.github-netlify']})
  ]};
  const out=prioritizeDiagnosis(diagnosis,snap([{id:'env.netlify-deploy-state',status:'FAIL',evidence:{stale:true}},{id:'map.github-netlify',status:'FAIL',evidence:{fresh:true}}]));
  assert.equal(out.primaryFinding.id,'github-netlify-link');
  assert.equal(out.findings.find(f=>f.id==='netlify-production-rebuild').evidenceFresh,false);
});
