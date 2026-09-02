import test from'node:test';
import assert from'node:assert/strict';
import{selectNetlifyRedeployTarget}from'../netlify/functions/_netlify-redeploy-repair.mjs';

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
