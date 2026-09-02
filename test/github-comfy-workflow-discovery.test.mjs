import test from'node:test';import assert from'node:assert/strict';
import{discoverSelectedComfyWorkflow}from'../netlify/functions/_github-comfy-workflow-discovery.mjs';
const json=(d,s=200)=>new Response(JSON.stringify(d),{status:s,headers:{'content-type':'application/json'}});const b64=s=>Buffer.from(s).toString('base64');

test('selects exactly one runnable ComfyUI workflow referenced by app source',async()=>{
  const gh='GH_SECRET_MUST_NOT_RETURN',nf='NF_SECRET_MUST_NOT_RETURN';
  const workflow={'1':{class_type:'WanVaceToVideo',inputs:{}},'2':{class_type:'KSampler',inputs:{}}};
  const fetchImpl=async(url,opts={})=>{const u=String(url);if(u.startsWith('https://api.netlify.com/'))return json([{url:'https://app.example',build_settings:{repo_url:'https://github.com/acme/video-app.git',repo_branch:'main'}}]);if(u==='https://api.github.com/repos/acme/video-app')return json({default_branch:'main'});if(u.includes('/git/trees/main'))return json({tree:[{path:'comfyui-workflows/vace.api.json',type:'blob',size:100},{path:'server.js',type:'blob',size:100}]});if(u.includes('/contents/comfyui-workflows/vace.api.json'))return json({encoding:'base64',content:b64(JSON.stringify(workflow))});if(u.includes('/contents/server.js'))return json({encoding:'base64',content:b64("const workflow='comfyui-workflows/vace.api.json'; const PRIVATE='MUST_NOT_RETURN';")});throw Error(u)};
  const out=await discoverSelectedComfyWorkflow({workspace:{siteOrigin:'https://app.example'},githubToken:gh,netlifyToken:nf,fetchImpl});
  assert.equal(out.status,'PASS');assert.equal(out.evidence.selectionProof,'source-reference');assert.equal(out.workflow['1'].class_type,'WanVaceToVideo');
  assert.equal(JSON.stringify({status:out.status,detail:out.detail,evidence:out.evidence}).includes(gh),false);assert.equal(JSON.stringify(out.evidence).includes('MUST_NOT_RETURN'),false);
});

test('refuses to guess when multiple runnable workflows are referenced',async()=>{
  const wf={'1':{class_type:'A',inputs:{}},'2':{class_type:'B',inputs:{}}};
  const fetchImpl=async url=>{const u=String(url);if(u.startsWith('https://api.netlify.com/'))return json([{url:'https://app.example',build_settings:{repo_url:'https://github.com/acme/app.git',repo_branch:'main'}}]);if(u==='https://api.github.com/repos/acme/app')return json({default_branch:'main'});if(u.includes('/git/trees/main'))return json({tree:[{path:'workflows/a.json',type:'blob',size:100},{path:'workflows/b.json',type:'blob',size:100},{path:'app.js',type:'blob',size:100}]});if(u.includes('/contents/workflows/a.json')||u.includes('/contents/workflows/b.json'))return json({encoding:'base64',content:b64(JSON.stringify(wf))});if(u.includes('/contents/app.js'))return json({encoding:'base64',content:b64("use('workflows/a.json');use('workflows/b.json')")});throw Error(u)};
  const out=await discoverSelectedComfyWorkflow({workspace:{siteOrigin:'https://app.example'},githubToken:'g',netlifyToken:'n',fetchImpl});assert.equal(out.status,'WARN');assert.equal(out.classification,'multiple-referenced-workflows');assert.equal(out.evidence.workflowSelected,false);
});
