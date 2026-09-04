import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';
import{isPrivateAddress,normalizePublicOrigin}from'../netlify/functions/_public-url.mjs';
import{scopedStoreName}from'../netlify/functions/_scoped-store.mjs';

test('private and local network targets are rejected',()=>{
  for(const ip of['127.0.0.1','10.1.2.3','172.16.0.1','192.168.1.1','169.254.169.254','::1','fd00::1','fe80::1'])assert.equal(isPrivateAddress(ip),true,ip);
  for(const url of['http://example.com','https://localhost','https://127.0.0.1','https://10.0.0.5','https://[::1]','https://user:pass@example.com'])assert.throws(()=>normalizePublicOrigin(url),/public HTTPS|private or local/i,url);
  assert.equal(normalizePublicOrigin('https://example.com/path?q=1'),'https://example.com');
});

test('production stores keep stable names while previews are isolated',()=>{
  const before={CONTEXT:process.env.CONTEXT,DEPLOY_ID:process.env.DEPLOY_ID};
  process.env.CONTEXT='production';delete process.env.DEPLOY_ID;assert.equal(scopedStoreName('weaverelay-control-plane'),'weaverelay-control-plane');
  process.env.CONTEXT='deploy-preview';process.env.DEPLOY_ID='preview-123';const preview=scopedStoreName('weaverelay-control-plane');assert.notEqual(preview,'weaverelay-control-plane');assert.match(preview,/weaverelay-control-plane-deploy-pre/);
  if(before.CONTEXT===undefined)delete process.env.CONTEXT;else process.env.CONTEXT=before.CONTEXT;if(before.DEPLOY_ID===undefined)delete process.env.DEPLOY_ID;else process.env.DEPLOY_ID=before.DEPLOY_ID;
});

test('production control-plane assets cannot remain stale',()=>{
  const toml=fs.readFileSync(new URL('../netlify.toml',import.meta.url),'utf8');
  assert.match(toml,/for = "\/\*\.html"[\s\S]*Cache-Control = "no-store, max-age=0"/);
  assert.match(toml,/for = "\/\*\.js"[\s\S]*Cache-Control = "no-cache, max-age=0, must-revalidate"/);
  assert.match(toml,/Strict-Transport-Security = "max-age=31536000"/);
});

test('workspace creation and monitoring both use public-network safety gates',()=>{
  const create=fs.readFileSync(new URL('../netlify/functions/workspace-create.mjs',import.meta.url),'utf8');
  const monitor=fs.readFileSync(new URL('../netlify/functions/_monitoring.mjs',import.meta.url),'utf8');
  assert.match(create,/normalizePublicOrigin/);assert.match(monitor,/publicFetch/);
});

test('passwordless login is rate limited and production blob state is scoped',()=>{
  const auth=fs.readFileSync(new URL('../netlify/functions/auth-request.mjs',import.meta.url),'utf8');
  const workspace=fs.readFileSync(new URL('../netlify/functions/_workspace-store.mjs',import.meta.url),'utf8');
  assert.match(auth,/enforceAuthRequestLimit/);assert.match(workspace,/scopedStore\('weaverelay-control-plane'\)/);
});
