import test from'node:test';
import assert from'node:assert/strict';
import{selectNetlifyRedeployTarget,verifyNetlifyRedeploy}from'../netlify/functions/_netlify-redeploy-repair.mjs';

const site={id:'site-1',name:'Studio One',url:'https://studio-one.netlify.app',ssl_url:'https://studio-one.netlify.app',custom_domain:'studioone.example.com',build_settings:{repo_url:'https://github.com/example/studio-one.git',repo_branch:'production'}};
const repo={full_name:'example/studio-one',html_url:'https://github.com/example/studio-one',default_branch:'main'};

test('Netlify rebuild requires one proven site repo and branch',()=>{
  const p=selectNetlifyRedeployTarget({siteOrigin:'https://studioone.example.com',sites:[site],githubRepos:[repo]});
  assert.equal(p.eligible,true);assert.equal(p.siteId,'site-1');assert.equal(p.repository,'example/studio-one');assert.equal(p.branch,'production');
});

test('Netlify rebuild fails closed when site ownership is ambiguous',()=>{
  const p=selectNetlifyRedeployTarget({siteOrigin:'https://studioone.example.com',sites:[site,{...site,id:'site-2'}],githubRepos:[repo]});
  assert.equal(p.eligible,false);assert.match(p.reason,/Multiple Netlify sites/i);
});

test('Netlify rebuild fails closed when GitHub source is not visible',()=>{
  const p=selectNetlifyRedeployTarget({siteOrigin:'https://studioone.example.com',sites:[site],githubRepos:[]});
  assert.equal(p.eligible,false);assert.match(p.reason,/not visible/i);
});

test('Netlify rebuild does not guess a branch when neither provider proves one',()=>{
  const p=selectNetlifyRedeployTarget({siteOrigin:'https://studioone.example.com',sites:[{...site,build_settings:{repo_url:site.build_settings.repo_url,repo_branch:''}}],githubRepos:[{...repo,default_branch:''}]});
  assert.equal(p.eligible,false);assert.match(p.reason,/branch/i);
});

test('post-rebuild verification requires a new ready deploy matching GitHub head and a healthy public app',async()=>{
  const fetchImpl=async(url)=>{
    const u=String(url);
    if(u.includes('/sites/site-1/deploys'))return new Response(JSON.stringify([{id:'deploy-new',branch:'production',state:'ready',commit_ref:'abcdef1234567890'}]),{status:200,headers:{'content-type':'application/json'}});
    if(u.includes('/repos/example/studio-one/commits/production'))return new Response(JSON.stringify({sha:'abcdef1234567890'}),{status:200,headers:{'content-type':'application/json'}});
    if(u==='https://studioone.example.com')return new Response('ok',{status:200});
    throw new Error(`unexpected ${u}`);
  };
  const result=await verifyNetlifyRedeploy({workspace:{siteOrigin:'https://studioone.example.com'},repair:{siteId:'site-1',branch:'production',repository:'example/studio-one',beforeDeployId:'deploy-old'},netlifyToken:'n',githubToken:'g',fetchImpl});
  assert.equal(result.status,'PASS');assert.equal(result.evidence.newDeployObserved,true);assert.equal(result.evidence.sourceMatch,true);assert.equal(result.evidence.publicHealthy,true);
});

test('post-rebuild verification stays pending until a new deploy exists',async()=>{
  const fetchImpl=async(url)=>{
    const u=String(url);
    if(u.includes('/sites/site-1/deploys'))return new Response(JSON.stringify([{id:'deploy-old',branch:'production',state:'ready',commit_ref:'abcdef'}]),{status:200,headers:{'content-type':'application/json'}});
    if(u.includes('/repos/example/studio-one/commits/production'))return new Response(JSON.stringify({sha:'abcdef'}),{status:200,headers:{'content-type':'application/json'}});
    throw new Error(`unexpected ${u}`);
  };
  const result=await verifyNetlifyRedeploy({workspace:{siteOrigin:'https://studioone.example.com'},repair:{siteId:'site-1',branch:'production',repository:'example/studio-one',beforeDeployId:'deploy-old'},netlifyToken:'n',githubToken:'g',fetchImpl});
  assert.equal(result.status,'WARN');assert.equal(result.evidence.verificationPending,true);assert.equal(result.evidence.newDeployObserved,false);
});

test('post-rebuild verification fails if Netlify deploy succeeds from the wrong GitHub commit',async()=>{
  const fetchImpl=async(url)=>{
    const u=String(url);
    if(u.includes('/sites/site-1/deploys'))return new Response(JSON.stringify([{id:'deploy-new',branch:'production',state:'ready',commit_ref:'oldcommit'}]),{status:200,headers:{'content-type':'application/json'}});
    if(u.includes('/repos/example/studio-one/commits/production'))return new Response(JSON.stringify({sha:'newcommit'}),{status:200,headers:{'content-type':'application/json'}});
    if(u==='https://studioone.example.com')return new Response('ok',{status:200});
    throw new Error(`unexpected ${u}`);
  };
  const result=await verifyNetlifyRedeploy({workspace:{siteOrigin:'https://studioone.example.com'},repair:{siteId:'site-1',branch:'production',repository:'example/studio-one',beforeDeployId:'deploy-old'},netlifyToken:'n',githubToken:'g',fetchImpl});
  assert.equal(result.status,'FAIL');assert.equal(result.evidence.sourceMatch,false);
});
