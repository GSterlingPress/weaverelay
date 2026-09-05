import test from'node:test';
import assert from'node:assert/strict';
import fs from'node:fs/promises';
import{PROVIDER_CONNECTION_CONTRACT,DIRECT_CREDENTIAL_PROVIDER_IDS,OAUTH_PROVIDER_IDS}from'../netlify/functions/_provider-connection-contract.mjs';

test('Netlify uses OAuth and is never offered as a direct credential provider',()=>{
  assert.equal(PROVIDER_CONNECTION_CONTRACT.netlify.method,'oauth');
  assert.ok(OAUTH_PROVIDER_IDS.includes('netlify'));
  assert.ok(!DIRECT_CREDENTIAL_PROVIDER_IDS.includes('netlify'));
});

test('Netlify authorization uses the server-side authorization code grant and never asks customers for PATs',async()=>{
  const start=await fs.readFile(new URL('../netlify/functions/provider-start.mjs',import.meta.url),'utf8');
  const controls=await fs.readFile(new URL('../wr-dashboard-controls.js',import.meta.url),'utf8');
  assert.match(start,/https:\/\/app\.netlify\.com\/authorize/);
  assert.match(start,/response_type','code'/);
  assert.match(start,/CONNECT_NETLIFY_CLIENT_ID/);
  assert.match(start,/CONNECT_NETLIFY_CLIENT_SECRET/);
  assert.doesNotMatch(start,/response_type','token'/);
  assert.match(controls,/provider-action\[data-provider="netlify"\]/);
  assert.doesNotMatch(controls,/personal access token/i);
});

test('Netlify OAuth callback exchanges the grant code server-side and stores only the encrypted access token',async()=>{
  const callback=await fs.readFile(new URL('../netlify/functions/oauth-netlify-callback.mjs',import.meta.url),'utf8');
  assert.match(callback,/https:\/\/api\.netlify\.com\/oauth\/token/);
  assert.match(callback,/grant_type:'authorization_code'/);
  assert.match(callback,/CONNECT_NETLIFY_CLIENT_SECRET/);
  assert.match(callback,/application\/x-www-form-urlencoded/);
  assert.match(callback,/encryptSecret/);
  assert.match(callback,/https:\/\/api\.netlify\.com\/api\/v1\/user/);
  assert.match(callback,/path:'\/api\/oauth\/netlify\/callback'/);
  assert.doesNotMatch(callback,/location\.hash/);
  assert.doesNotMatch(callback,/console\.log\([^\n]*accessToken/);
});
