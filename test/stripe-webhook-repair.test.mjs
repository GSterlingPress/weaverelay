import test from'node:test';
import assert from'node:assert/strict';
import{inspectStripeWebhookRepair,applyStripeWebhookRepair}from'../netlify/functions/_stripe-webhook-repair.mjs';

const workspace={name:'Studio One Video',siteOrigin:'https://studio.example.com'};
function response(data,{status=200,url='https://studio.example.com'}={}){return{ok:status>=200&&status<300,status,url,headers:{get:()=> 'application/json'},json:async()=>data,text:async()=>typeof data==='string'?data:JSON.stringify(data)}}
function fixtureFetch({endpointUrl='https://old.example.com/api/stripe/webhook',enabledCount=1,denyWrite=false}={}){
  let saved=endpointUrl;const writes=[];
  const fetchImpl=async(url,opts={})=>{
    const u=String(url);
    if(u==='https://studio.example.com')return response(`<script src="/app.js"></script>`,{url:u});
    if(u==='https://studio.example.com/app.js')return response('fetch("https://studio-one-video-production.up.railway.app/api/production")',{url:u});
    if(u.includes('backboard.railway.com')){
      const body=JSON.parse(opts.body||'{}'),q=body.query||'';
      if(q.includes('projects {'))return response({data:{projects:{edges:[{node:{id:'p1',name:'Studio One Video'}}]}}});
      if(q.includes('project($id'))return response({data:{project:{services:{edges:[{node:{id:'s1',name:'web'}}]},environments:{edges:[{node:{id:'e1',name:'production'}}]}}}});
      if(q.includes('query variables'))return response({data:{variables:{RAILWAY_PUBLIC_DOMAIN:'studio-one-video-production.up.railway.app'}}});
    }
    if(u.endsWith('/v1/webhook_endpoints?limit=100'))return response({data:Array.from({length:enabledCount},(_,i)=>({id:`we_${i+1}`,status:'enabled',url:i?saved.replace('old.example.com',`other${i}.example.com`):saved}))});
    if(u.endsWith('/v1/webhook_endpoints/we_1')&&(!opts.method||opts.method==='GET'))return response({id:'we_1',status:'enabled',url:saved});
    if(u.endsWith('/v1/webhook_endpoints/we_1')&&opts.method==='POST'){
      if(denyWrite)return response({error:{message:'forbidden'}},{status:403});
      const form=new URLSearchParams(opts.body);saved=form.get('url');writes.push(saved);return response({id:'we_1',status:'enabled',url:saved});
    }
    throw new Error(`Unexpected fetch ${u}`);
  };
  return{fetchImpl,writes,getSaved:()=>saved};
}

test('offers a repair only for one proven Railway host and one enabled webhook-like endpoint',async()=>{const f=fixtureFetch();const p=await inspectStripeWebhookRepair({workspace,railwayToken:'rail',stripeToken:'stripe',fetchImpl:f.fetchImpl});assert.equal(p.eligible,true);assert.equal(p.targetHost,'studio-one-video-production.up.railway.app');assert.equal(p.pathPreserved,true)});

test('fails closed when multiple enabled Stripe endpoints make ownership ambiguous',async()=>{const f=fixtureFetch({enabledCount:2});const p=await inspectStripeWebhookRepair({workspace,railwayToken:'rail',stripeToken:'stripe',fetchImpl:f.fetchImpl});assert.equal(p.eligible,false);assert.equal(p.reason,'stripe-endpoint-not-unique');assert.equal(f.writes.length,0)});

test('changes only the webhook host and preserves path/query',async()=>{const f=fixtureFetch({endpointUrl:'https://old.example.com/api/stripe/webhook?source=prod'});const r=await applyStripeWebhookRepair({workspace,railwayToken:'rail',stripeToken:'stripe',fetchImpl:f.fetchImpl});assert.equal(r.verified,true);assert.equal(f.writes.length,1);const u=new URL(f.getSaved());assert.equal(u.hostname,'studio-one-video-production.up.railway.app');assert.equal(u.pathname,'/api/stripe/webhook');assert.equal(u.search,'?source=prod');assert.equal(JSON.stringify(r).includes('old.example.com'),false);assert.equal(r.endpointUrlsRetained,false);assert.equal(r.signingSecretsRetained,false)});

test('does not broaden Stripe permission silently when write is denied',async()=>{const f=fixtureFetch({denyWrite:true});await assert.rejects(()=>applyStripeWebhookRepair({workspace,railwayToken:'rail',stripeToken:'stripe',fetchImpl:f.fetchImpl}),/narrowly scoped webhook endpoint write permission/)});
