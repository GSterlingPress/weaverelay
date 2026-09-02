import test from'node:test';
import assert from'node:assert/strict';
import{buildRuntimePaymentsEvidence,extractEnvNames}from'../netlify/functions/_runtime-payments.mjs';

const response=(status,data)=>({ok:status>=200&&status<300,status,json:async()=>data});

test('extractEnvNames finds backend configuration names without values',()=>{
  const names=extractEnvNames("const a=process.env.STRIPE_SECRET_KEY; const b=process.env['SUPABASE_URL']; const c=Deno.env.get('DATABASE_URL')");
  assert.deepEqual(names,['DATABASE_URL','STRIPE_SECRET_KEY','SUPABASE_URL']);
});

test('Stripe webhook diagnostics never retain endpoint URLs or signing secrets',async()=>{
  const fetchImpl=async url=>{
    assert.match(String(url),/stripe\.com\/v1\/webhook_endpoints/);
    return response(200,{data:[{id:'we_secret_id',status:'enabled',url:'https://private-backend.example.com/stripe',secret:'whsec_DO_NOT_RETAIN'}]});
  };
  const out=await buildRuntimePaymentsEvidence({workspace:{name:'Example',siteOrigin:'https://example.com'},secrets:{stripe:'rk_test_DO_NOT_RETAIN'},fetchImpl});
  const text=JSON.stringify(out);
  assert.equal(text.includes('whsec_DO_NOT_RETAIN'),false);
  assert.equal(text.includes('private-backend.example.com'),false);
  assert.equal(text.includes('rk_test_DO_NOT_RETAIN'),false);
  const check=out.checks.find(x=>x.id==='payments.stripe-webhooks');
  assert.equal(check.status,'PASS');
  assert.equal(check.evidence.enabledEndpointCount,1);
  assert.equal(check.evidence.endpointUrlsRetained,false);
});

test('Balance-only Stripe key leaves webhook boundary WARN rather than failing provider health',async()=>{
  const fetchImpl=async()=>response(403,{error:{message:'Missing permission'}});
  const out=await buildRuntimePaymentsEvidence({workspace:{name:'Example',siteOrigin:'https://example.com'},secrets:{stripe:'rk_live_balance_only'},fetchImpl});
  const check=out.checks.find(x=>x.id==='payments.stripe-webhooks');
  assert.equal(check.status,'WARN');
  assert.equal(check.evidence.webhookReadAuthorized,false);
});

test('Railway variable values are discarded and only names are retained',async()=>{
  const fetchImpl=async(url,options={})=>{
    const body=options.body?JSON.parse(options.body):{};const q=body.query||'';
    if(q.includes('projects { edges'))return response(200,{data:{projects:{edges:[{node:{id:'p1',name:'Studio One'}}]}}});
    if(q.includes('query project('))return response(200,{data:{project:{id:'p1',name:'Studio One',services:{edges:[{node:{id:'s1',name:'api'}}]},environments:{edges:[{node:{id:'e1',name:'production'}}]}}}});
    if(q.includes('query variables('))return response(200,{data:{variables:{STRIPE_SECRET_KEY:'sk_live_DO_NOT_RETAIN',SUPABASE_URL:'https://secret-project.supabase.co',PORT:'3000'}}});
    throw new Error(`Unexpected request ${url}`);
  };
  const out=await buildRuntimePaymentsEvidence({workspace:{name:'Studio One'},secrets:{railway:'railway_DO_NOT_RETAIN'},fetchImpl});
  const text=JSON.stringify(out);
  assert.equal(text.includes('sk_live_DO_NOT_RETAIN'),false);
  assert.equal(text.includes('secret-project.supabase.co'),false);
  assert.equal(text.includes('railway_DO_NOT_RETAIN'),false);
  const inventory=out.checks.find(x=>x.id==='runtime.railway-inventory');
  assert.equal(inventory.status,'PASS');
  assert.equal(inventory.evidence.configuredKeyCount,3);
  assert.equal(inventory.evidence.valuesRetained,false);
});
