import test from'node:test';
import assert from'node:assert/strict';
import{augmentDiagnosis}from'../netlify/functions/_diagnosis-expansion.mjs';

const base=()=>({status:'attention',headline:'More connection evidence is needed',summary:'0 of 1 active checks passed. 1 diagnostic finding.',findings:[],safeRepairs:[]});

test('Netlify deploy drift offers guarded rebuild and verify',()=>{
  const snapshot={checks:[{id:'map.github-netlify-deploy',status:'WARN',detail:'Netlify latest deploy is behind GitHub.',evidence:{}}]};
  const d=augmentDiagnosis(base(),snapshot),f=d.findings.find(x=>x.id==='netlify-production-rebuild');
  assert.ok(f);assert.equal(f.repair.supported,true);assert.equal(f.repair.type,'netlify-redeploy');assert.equal(f.repair.approvalRequired,true);
});

test('missing Railway SUPABASE_URL surfaces existing narrow repair',()=>{
  const snapshot={checks:[{id:'runtime.railway-env-coverage',status:'WARN',detail:'One required variable is missing.',evidence:{missingKeyCount:1,missingKeys:['SUPABASE_URL']}}]};
  const d=augmentDiagnosis(base(),snapshot),f=d.findings.find(x=>x.id==='railway-supabase-url-missing');
  assert.ok(f);assert.equal(f.repair.supported,true);assert.equal(f.repair.type,'railway-supabase-url');
});

test('ComfyUI outage never offers automatic compute start',()=>{
  const snapshot={checks:[{id:'map.app-runpod-comfyui',status:'FAIL',detail:'The exact RunPod target does not answer as ComfyUI.',evidence:{}}]};
  const d=augmentDiagnosis(base(),snapshot),f=d.findings.find(x=>x.id==='runpod-comfyui-runtime-failed');
  assert.ok(f);assert.equal(f.repair.supported,false);assert.doesNotMatch(JSON.stringify(f.repair),/start|resume/i);assert.match(f.actions.join(' '),/will not automatically start compute/i);
});

test('expanded provider failures become reconnect actions',()=>{
  const snapshot={checks:[{id:'resend.live',status:'FAIL',detail:'Resend returned HTTP 401.',evidence:{}}]};
  const d=augmentDiagnosis(base(),snapshot),f=d.findings.find(x=>x.id==='resend-connection-failed');
  assert.ok(f);assert.equal(f.repair.type,'reconnect-provider');assert.equal(f.repair.provider,'resend');
});
