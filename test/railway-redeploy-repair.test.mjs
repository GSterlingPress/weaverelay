import test from'node:test';
import assert from'node:assert/strict';
import{inspectRailwayRedeployNeed,triggerRailwayRedeploy,verifyRailwayRepairRuntime}from'../netlify/functions/_railway-redeploy-repair.mjs';

const response=(status,data)=>({ok:status>=200&&status<300,status,json:async()=>data});
const workspace={lastRepair:{type:'railway-supabase-url',configurationVerified:true,runtimeVerified:false,projectId:'p1',environmentId:'e1',serviceId:'s1',publicDomain:'api.up.railway.app',serviceName:'api',environmentName:'production'}};

test('verified config repair requires a separate approved redeploy',()=>{
  const out=inspectRailwayRedeployNeed(workspace);
  assert.equal(out.eligible,true);
  assert.equal(out.reason,'configuration-change-requires-runtime-refresh');
  assert.equal(out.target.serviceId,'s1');
});

test('redeploy targets only the proven Railway service and does not expose tokens',async()=>{
  let redeployVariables=null;let listCount=0;
  const fetchImpl=async(url,options={})=>{
    const body=JSON.parse(options.body||'{}');
    if(body.query?.includes('query deployments(')){
      listCount++;
      return response(200,{data:{deployments:{edges:[{node:{id:listCount===1?'old1':'new1',status:listCount===1?'SUCCESS':'QUEUED',createdAt:'2026-09-02T14:00:00Z'}}]}}});
    }
    if(body.query?.includes('serviceInstanceRedeploy')){redeployVariables=body.variables;return response(200,{data:{serviceInstanceRedeploy:true}});}
    throw new Error(`Unexpected request ${url}`);
  };
  const out=await triggerRailwayRedeploy({workspace,railwayToken:'railway_SECRET_DO_NOT_RETURN',fetchImpl});
  assert.deepEqual(redeployVariables,{environmentId:'e1',serviceId:'s1'});
  assert.equal(out.triggered,true);
  assert.equal(out.previousDeploymentId,'old1');
  assert.equal(out.newDeploymentId,'new1');
  assert.equal(JSON.stringify(out).includes('railway_SECRET_DO_NOT_RETURN'),false);
});

test('runtime verification passes only after successful deployment and live backend response',async()=>{
  const after={lastRepair:{...workspace.lastRepair,redeployRequestedAt:'2026-09-02T14:00:00Z',previousDeploymentId:'old1',redeploymentId:'new1'}};
  const fetchImpl=async(url,options={})=>{
    if(String(url).startsWith('https://api.up.railway.app/'))return{ok:true,status:200};
    const body=JSON.parse(options.body||'{}');
    if(body.query?.includes('query deployments('))return response(200,{data:{deployments:{edges:[{node:{id:'new1',status:'SUCCESS',createdAt:'2026-09-02T14:01:00Z'}}]}}});
    throw new Error(`Unexpected request ${url}`);
  };
  const out=await verifyRailwayRepairRuntime({workspace:after,railwayToken:'railway_SECRET',fetchImpl});
  assert.equal(out.status,'PASS');
  assert.equal(out.evidence.runtimeVerified,true);
  assert.equal(out.evidence.endpointReachable,true);
  assert.equal(JSON.stringify(out).includes('railway_SECRET'),false);
});

test('failed redeploy is surfaced as FAIL and never claimed verified',async()=>{
  const after={lastRepair:{...workspace.lastRepair,redeployRequestedAt:'2026-09-02T14:00:00Z',previousDeploymentId:'old1',redeploymentId:'new1'}};
  const fetchImpl=async(url,options={})=>{
    const body=JSON.parse(options.body||'{}');
    if(body.query?.includes('query deployments('))return response(200,{data:{deployments:{edges:[{node:{id:'new1',status:'FAILED',createdAt:'2026-09-02T14:01:00Z'}}]}}});
    throw new Error(`Unexpected request ${url}`);
  };
  const out=await verifyRailwayRepairRuntime({workspace:after,railwayToken:'railway_SECRET',fetchImpl});
  assert.equal(out.status,'FAIL');
  assert.equal(out.evidence.runtimeVerified,false);
});
