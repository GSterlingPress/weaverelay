import test from'node:test';
import assert from'node:assert/strict';
import{sanitizeClientTopology,sanitizeClientSnapshotShape}from'../netlify/functions/_client-snapshot-boundary.mjs';

test('preserves the current Studio One topology contract',()=>{
 const topology=sanitizeClientTopology({nodes:['GitHub','Netlify','Railway','Supabase','Stripe','RunPod'],relationships:['source.frontend','source.backend','backend.database','backend.payments','backend.compute'],compute:'RunPod (excluded)'});
 assert.deepEqual(topology.nodes,['GitHub','Netlify','Railway','Supabase','Stripe','RunPod']);
 assert.deepEqual(topology.relationships,['source.frontend','source.backend','backend.database','backend.payments','backend.compute']);
 assert.equal(topology.compute,'RunPod (excluded)');
});

test('drops accidental secret-like topology metadata instead of retaining it',()=>{
 const safe=sanitizeClientSnapshotShape({topology:{nodes:[{id:'railway',label:'Railway',status:'connected',token:'secret',apiKey:'secret'}],relationships:[{id:'backend.database',from:'Railway',to:'Supabase',status:'PASS',authorization:'Bearer secret'}],flow:['Netlify','Railway'],serviceRoleKey:'secret'},checks:[]});
 assert.deepEqual(safe.topology.nodes,[{id:'railway',label:'Railway',status:'connected'}]);
 assert.deepEqual(safe.topology.relationships,[{id:'backend.database',from:'Railway',to:'Supabase',status:'PASS'}]);
 assert.deepEqual(safe.topology.flow,['Netlify','Railway']);
 assert.equal('serviceRoleKey' in safe.topology,false);
});

test('bounds client topology size and rejects nested arbitrary content',()=>{
 const many=Array.from({length:80},(_,i)=>({id:`node-${i}`,label:`Node ${i}`,nested:{secret:'x'}}));
 const topology=sanitizeClientTopology({nodes:many,relationships:many,flow:Array.from({length:80},(_,i)=>`step-${i}`)});
 assert.equal(topology.nodes.length,30);
 assert.equal(topology.relationships.length,50);
 assert.equal(topology.flow.length,30);
 assert.ok(topology.nodes.every(n=>!('nested'in n)));
});
