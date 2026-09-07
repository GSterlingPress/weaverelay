import test from 'node:test';
import assert from 'node:assert/strict';
import { AuditIsolationHarness, AccessDenied, validateShape } from './harness.mjs';

const sourceManifest={files:[{name:'sealed-source.pdf',sha256:'abc'}],version:1};
function setup(){ const h=new AuditIsolationHarness({clock:()=> '2026-09-07T12:00:00.000Z'}); const c=h.createCase({caseId:'CASE-001',sourceManifest}); return {h,c}; }

test('Canary A: analyzer-to-analyzer isolation',()=>{
  const {h,c}=setup(); const a1=h.createWorker({caseRecord:c,role:'A1'}); const a2=h.createWorker({caseRecord:c,role:'A2'});
  h.writeLocal(a1.jobId,'nonce','CANARY-A');
  assert.throws(()=>h.readLocal(a2.jobId,a1.jobId,'nonce'),AccessDenied);
  h.commitOutput(a1.jobId,{nonce:'CANARY-A'});
  assert.throws(()=>h.readCommitted(a2.jobId,a1.jobId),AccessDenied);
});

test('Canary B: reconciler sibling isolation',()=>{
  const {h,c}=setup(); const ra=h.createWorker({caseRecord:c,role:'RA'}); const rb=h.createWorker({caseRecord:c,role:'RB'});
  h.writeLocal(ra.jobId,'nonce','CANARY-B');
  assert.throws(()=>h.readLocal(rb.jobId,ra.jobId,'nonce'),AccessDenied);
});

test('Canary C: master cannot leak downward',()=>{
  const {h,c}=setup(); const rm=h.createWorker({caseRecord:c,role:'RM'}); const ra=h.createWorker({caseRecord:c,role:'RA'});
  h.writeLocal(rm.jobId,'nonce','CANARY-C');
  assert.throws(()=>h.readLocal(ra.jobId,rm.jobId,'nonce'),AccessDenied);
});

test('Canary D: prior-job amnesia',()=>{
  const {h,c}=setup(); const j1=h.createWorker({caseRecord:c,role:'A1'}); h.writeLocal(j1.jobId,'nonce','CANARY-D'); h.destroyJob(j1.jobId);
  const j2=h.createWorker({caseRecord:c,role:'A1'});
  assert.throws(()=>h.readLocal(j2.jobId,j1.jobId,'nonce'),AccessDenied);
  assert.equal(h.readLocal(j2.jobId,j2.jobId,'nonce'),undefined);
});

test('Canary E: gold vault blocked until final RM commitment',()=>{
  const {h,c}=setup(); h.putGold(c.caseId,{outcome:'CANARY-E'}); const a1=h.createWorker({caseRecord:c,role:'A1'});
  assert.throws(()=>h.readGold({caseId:c.caseId,finalCommitHash:'fake'}),AccessDenied);
  h.commitOutput(a1.jobId,{status:'done'});
  assert.throws(()=>h.readGold({caseId:c.caseId,finalCommitHash:'fake'}),AccessDenied);
  const rm=h.createWorker({caseRecord:c,role:'RM'}); const final=h.commitOutput(rm.jobId,{status:'SEALED-NOT-SCORED'});
  assert.equal(h.readGold({caseId:c.caseId,finalCommitHash:final.commitHash}).gold.outcome,'CANARY-E');
});

test('ACL allows only upward handoff and commitment is immutable/hash-addressed',()=>{
  const {h,c}=setup(); const a1=h.createWorker({caseRecord:c,role:'A1'}); const a2=h.createWorker({caseRecord:c,role:'A2'}); const a3=h.createWorker({caseRecord:c,role:'A3'}); const ra=h.createWorker({caseRecord:c,role:'RA'});
  for (const w of [a1,a2,a3]) h.commitOutput(w.jobId,{finding_id:w.role});
  assert.equal(h.readCommitted(ra.jobId,a1.jobId).role,'A1');
  assert.throws(()=>h.commitOutput(a1.jobId,{changed:true}),/already committed/);
});

test('locked handoff schemas reject missing required fields',()=>{
  assert.equal(validateShape('finding',{finding_id:'x'}).ok,false);
  assert.equal(validateShape('masterReconciliation',{case_id:'x'}).ok,false);
});
