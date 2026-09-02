import test from'node:test';
import assert from'node:assert/strict';
import{probeCredential,checkForProvider}from'../netlify/functions/_provider-probes.mjs';
import{buildRunPodComfyUIEvidence}from'../netlify/functions/_runpod-comfyui-proof.mjs';

const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});

test('RunPod connection probe is read-only and retains only resource counts',async()=>{
  const secret='RUNPOD_SECRET_MUST_NOT_RETURN';
  const calls=[];
  const fetchImpl=async(url,opts={})=>{calls.push({url:String(url),method:opts.method||'GET',authorization:opts.headers?.authorization});if(String(url).endsWith('/pods'))return json([{id:'p1',env:{SECRET:'do-not-return'}}]);if(String(url).endsWith('/endpoints'))return json([{id:'e1',env:{TOKEN:'do-not-return'}}]);throw new Error('unexpected')};
  const p=await probeCredential('runpod',secret,{fetchImpl});
  const check=checkForProvider('runpod',p);
  assert.equal(p.ok,true);assert.equal(p.meta.podCount,1);assert.equal(p.meta.endpointCount,1);assert.equal(check.status,'PASS');
  assert.equal(calls.every(x=>x.method==='GET'),true);assert.equal(calls.every(x=>x.authorization===`Bearer ${secret}`),true);
  assert.equal(JSON.stringify(p).includes(secret),false);assert.equal(JSON.stringify(p).includes('do-not-return'),false);assert.equal(p.meta.environmentValuesRetained,false);
});

test('Studio One-shaped running RunPod ComfyUI pod verifies through read-only system_stats',async()=>{
  const secret='RUNPOD_SECRET_MUST_NOT_RETURN';
  const pod={id:'studio123',name:'studio-one-comfyui-123',desiredStatus:'RUNNING',image:'runpod/pytorch:2.8',ports:['8188/http'],dockerStartCmd:['python main.py --listen 0.0.0.0 --port 8188'],env:{RUNPOD_API_KEY:'do-not-return'}};
  const fetchImpl=async(url,opts={})=>{const u=String(url);if(u.endsWith('/v1/pods'))return json([pod]);if(u.includes('studio123-8188.proxy.runpod.net/system_stats'))return json({system:{comfyui_version:'0.3.99',argv:['--private-path','MUST_NOT_RETURN']},devices:[{name:'GPU'}]});throw new Error(`unexpected ${u}`)};
  const out=await buildRunPodComfyUIEvidence({runpodToken:secret,fetchImpl});
  const runpod=out.checks.find(x=>x.id==='runpod.inventory'),comfy=out.checks.find(x=>x.id==='map.runpod-comfyui');
  assert.equal(runpod.status,'PASS');assert.equal(comfy.status,'PASS');assert.equal(comfy.evidence.comfyuiVersion,'0.3.99');assert.equal(comfy.evidence.computeStartedForTest,false);assert.equal(comfy.evidence.responseBodiesRetained,false);assert.equal(comfy.evidence.systemArgvRetained,false);
  assert.equal(JSON.stringify(out).includes(secret),false);assert.equal(JSON.stringify(out).includes('MUST_NOT_RETURN'),false);assert.equal(JSON.stringify(out).includes('do-not-return'),false);
});

test('does not start GPU compute when no running ComfyUI target exists',async()=>{
  const methods=[];const fetchImpl=async(url,opts={})=>{methods.push(opts.method||'GET');return json([{id:'p1',name:'training',desiredStatus:'EXITED',ports:['8188/http']}])};
  const out=await buildRunPodComfyUIEvidence({runpodToken:'rk_readonly',fetchImpl});const comfy=out.checks.find(x=>x.id==='map.runpod-comfyui');assert.equal(comfy.status,'WARN');assert.equal(comfy.evidence.computeStartedForTest,false);assert.deepEqual(methods,['GET']);
});
