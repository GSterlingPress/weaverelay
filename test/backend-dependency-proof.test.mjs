import test from'node:test';
import assert from'node:assert/strict';
import{verifyBackendSupabaseDependency}from'../netlify/functions/_backend-dependency-proof.mjs';

const response=(status,data,contentType='application/json')=>({ok:status>=200&&status<300,status,headers:{get:name=>name.toLowerCase()==='content-type'?contentType:null},json:async()=>data});
const workspace={lastRepair:{type:'railway-supabase-url',configurationVerified:true,runtimeVerified:true,projectRef:'rqaxslwumixshrftsmco',publicDomain:'studio-one-video-production.up.railway.app'}};

test('Studio One shaped diagnostic proves backend to Supabase after runtime verification',async()=>{
  const fetchImpl=async url=>{
    assert.equal(String(url),'https://studio-one-video-production.up.railway.app/api/connect/diagnostic');
    return response(200,{checks:[{id:'supabase.live',label:'Supabase Production Vault',status:'PASS',detail:'Supabase Production Vault answered a read-only health probe.',evidence:{httpStatus:200,driftwoodProductionFound:true,keySource:'MUST_NOT_RETURN'}}]});
  };
  const result=await verifyBackendSupabaseDependency({workspace,fetchImpl});
  assert.equal(result.status,'PASS');
  assert.equal(result.evidence.dependencyVerified,true);
  assert.equal(result.evidence.proofType,'application-self-diagnostic');
  assert.equal(JSON.stringify(result).includes('MUST_NOT_RETURN'),false);
});

test('backend Supabase failure remains FAIL even when Railway itself is running',async()=>{
  const fetchImpl=async()=>response(200,{checks:[{id:'supabase.live',label:'Supabase',status:'FAIL',detail:'Supabase returned 500.',evidence:{httpStatus:500}}]});
  const result=await verifyBackendSupabaseDependency({workspace,fetchImpl});
  assert.equal(result.status,'FAIL');
  assert.equal(result.evidence.dependencyVerified,false);
});

test('plain backend reachability is not enough to claim Supabase dependency proof',async()=>{
  const fetchImpl=async url=>String(url).endsWith('/api/connect/diagnostic')?response(404,{},'application/json'):response(200,{ok:true});
  const result=await verifyBackendSupabaseDependency({workspace,fetchImpl});
  assert.equal(result.status,'WARN');
  assert.equal(result.evidence.dependencyVerified,false);
});
