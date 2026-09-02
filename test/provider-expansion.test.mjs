import test from'node:test';
import assert from'node:assert/strict';
import{probeCredential,checkForProvider}from'../netlify/functions/_provider-probes.mjs';

const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
const cases=[
 ['vercel','https://api.vercel.com/v9/projects?limit=1',{projects:[{id:'secret-project-id',name:'app'}]},'vercel.live'],
 ['render','https://api.render.com/v1/services?limit=1',[{service:{id:'secret-service-id',name:'api'}}],'render.live'],
 ['cloudflare','https://api.cloudflare.com/client/v4/user/tokens/verify',{success:true,result:{id:'secret-token-id',status:'active'}},'cloudflare.live'],
 ['neon','https://console.neon.tech/api/v2/projects?limit=1',{projects:[{id:'secret-neon-id',name:'db'}]},'neon.live'],
 ['resend','https://api.resend.com/domains',{data:[{id:'secret-domain-id',name:'example.com',status:'verified'}]},'resend.live']
];
for(const [provider,url,body,checkId] of cases)test(`${provider} probe is read only and returns sanitized metadata`,async()=>{const calls=[];const fetchImpl=async(u,opt={})=>{calls.push({u:String(u),method:opt.method||'GET'});assert.equal(String(u),url);return response(body)};const probe=await probeCredential(provider,'test-token-at-least-twelve',{fetchImpl});assert.equal(probe.ok,true);assert.deepEqual(calls.map(x=>x.method),['GET']);assert.equal(JSON.stringify(probe).includes('secret-'),false);const check=checkForProvider(provider,probe);assert.equal(check.id,checkId);assert.equal(check.status,'PASS');assert.equal(check.evidence.resourceBodiesRetained,false)});

test('expanded provider probes never issue mutation requests',async()=>{const methods=[];const fetchImpl=async(u,opt={})=>{methods.push(opt.method||'GET');if(String(u).includes('cloudflare'))return response({success:true,result:{status:'active'}});if(String(u).includes('render'))return response([]);if(String(u).includes('resend'))return response({data:[]});return response({projects:[]})};for(const provider of ['vercel','render','cloudflare','neon','resend'])await probeCredential(provider,'test-token-at-least-twelve',{fetchImpl});assert.ok(methods.every(x=>x==='GET'))});
