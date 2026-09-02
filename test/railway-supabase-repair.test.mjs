import test from'node:test';
import assert from'node:assert/strict';
import{inspectRailwaySupabaseRepair,applyRailwaySupabaseRepair}from'../netlify/functions/_railway-supabase-repair.mjs';

const htmlResponse=(html,url='https://app.example.com')=>({ok:true,status:200,url,headers:{get:()=> 'text/html'},text:async()=>html});
const jsonResponse=(data,status=200)=>({ok:status>=200&&status<300,status,json:async()=>data});

function repairFetch({duplicateService=false}={}){
  let changed=false;let mutationInput=null;
  const fetchImpl=async(url,options={})=>{
    const u=String(url);
    if(u==='https://app.example.com')return htmlResponse('<html><body>https://api.up.railway.app https://goodref.supabase.co</body></html>');
    if(u==='https://api.supabase.com/v1/projects')return jsonResponse([{id:'goodref',name:'Production'}]);
    if(u==='https://backboard.railway.com/graphql/v2'){
      const body=JSON.parse(options.body||'{}');const q=body.query||'';
      if(q.includes('projects { edges'))return jsonResponse({data:{projects:{edges:[{node:{id:'p1',name:'Example'}}]}}});
      if(q.includes('query project('))return jsonResponse({data:{project:{id:'p1',name:'Example',services:{edges:duplicateService?[{node:{id:'s1',name:'api'}},{node:{id:'s2',name:'api-copy'}}]:[{node:{id:'s1',name:'api'}}]},environments:{edges:[{node:{id:'e1',name:'production'}}]}}}});
      if(q.includes('query variables(')){
        const serviceId=body.variables?.serviceId;
        if(duplicateService&&serviceId==='s2')return jsonResponse({data:{variables:{RAILWAY_PUBLIC_DOMAIN:'api.up.railway.app',SUPABASE_URL:'https://other.supabase.co'}}});
        return jsonResponse({data:{variables:{RAILWAY_PUBLIC_DOMAIN:'api.up.railway.app',SUPABASE_URL:changed?'https://goodref.supabase.co':'https://wrongref.supabase.co',STRIPE_SECRET_KEY:'sk_do_not_return'}}});
      }
      if(q.includes('variableCollectionUpsert')){mutationInput=body.variables?.input;changed=true;return jsonResponse({data:{variableCollectionUpsert:true}});}
    }
    throw new Error(`Unexpected request: ${u}`);
  };
  return{fetchImpl,getMutation:()=>mutationInput};
}

test('Railway Supabase repair changes only SUPABASE_URL after exact independent matches and verifies it',async()=>{
  const mock=repairFetch();
  const proposal=await inspectRailwaySupabaseRepair({workspace:{siteOrigin:'https://app.example.com'},railwayToken:'railway_secret',supabaseToken:'supabase_secret',fetchImpl:mock.fetchImpl});
  assert.equal(proposal.eligible,true);
  assert.equal(proposal.desiredRef,'goodref');
  assert.equal(proposal.target.serviceId,'s1');
  assert.equal(proposal.target.environmentName,'production');

  const result=await applyRailwaySupabaseRepair({workspace:{siteOrigin:'https://app.example.com'},railwayToken:'railway_secret',supabaseToken:'supabase_secret',fetchImpl:mock.fetchImpl});
  assert.equal(result.changed,true);
  assert.equal(result.verified,true);
  assert.equal(result.runtimeVerified,false);
  const input=mock.getMutation();
  assert.deepEqual(input.variables,{SUPABASE_URL:'https://goodref.supabase.co'});
  assert.equal('replace'in input,false);
  const serialized=JSON.stringify(result);
  assert.equal(serialized.includes('railway_secret'),false);
  assert.equal(serialized.includes('supabase_secret'),false);
  assert.equal(serialized.includes('sk_do_not_return'),false);
  assert.equal(serialized.includes('wrongref.supabase.co'),false);
});

test('Railway Supabase repair fails closed when the Railway service match is ambiguous',async()=>{
  const mock=repairFetch({duplicateService:true});
  const proposal=await inspectRailwaySupabaseRepair({workspace:{siteOrigin:'https://app.example.com'},railwayToken:'railway_secret',supabaseToken:'supabase_secret',fetchImpl:mock.fetchImpl});
  assert.equal(proposal.eligible,false);
  assert.equal(proposal.reason,'railway-service-not-unique');
  await assert.rejects(()=>applyRailwaySupabaseRepair({workspace:{siteOrigin:'https://app.example.com'},railwayToken:'railway_secret',supabaseToken:'supabase_secret',fetchImpl:mock.fetchImpl}),/cannot safely apply this repair/);
  assert.equal(mock.getMutation(),null);
});
