import test from'node:test';
import assert from'node:assert/strict';
import fs from'node:fs/promises';
import{PROVIDER_CONNECTION_CONTRACT,DIRECT_CREDENTIAL_PROVIDER_IDS,OAUTH_PROVIDER_IDS}from'../netlify/functions/_provider-connection-contract.mjs';

test('Netlify uses OAuth and is never offered as a direct credential provider',()=>{
  assert.equal(PROVIDER_CONNECTION_CONTRACT.netlify.method,'oauth');
  assert.ok(OAUTH_PROVIDER_IDS.includes('netlify'));
  assert.ok(!DIRECT_CREDENTIAL_PROVIDER_IDS.includes('netlify'));
});

test('Netlify authorization uses the registered production callback while preserving preview return state',async()=>{
  const start=await fs.readFile(new URL('../netlify/functions/provider-start.mjs',import.meta.url),'utf8');
  const oauth=await fs.readFile(new URL('../netlify/functions/_oauth.mjs',import.meta.url),'utf8');
  const controls=await fs.readFile(new URL('../wr-dashboard-controls.js',import.meta.url),'utf8');
  const netlifyBranch=start.split("if(provider==='netlify')")[1].split("const envPrefix=")[0];
  assert.match(netlifyBranch,/https:\/\/app\.netlify\.com\/authorize/);
  assert.match(netlifyBranch,/response_type','token'/);
  assert.match(netlifyBranch,/CONNECT_NETLIFY_CLIENT_ID/);
  assert.match(netlifyBranch,/PUBLIC_SITE_URL/);
  assert.match(netlifyBranch,/registeredRedirectUri/);
  assert.doesNotMatch(netlifyBranch,/CONNECT_NETLIFY_CLIENT_SECRET/);
  assert.doesNotMatch(netlifyBranch,/response_type','code'/);
  assert.match(oauth,/returnOrigin/);
  assert.match(oauth,/base64url/);
  assert.match(controls,/provider-action\[data-provider="netlify"\]/);
  assert.doesNotMatch(controls,/personal access token/i);
});

test('Netlify OAuth callback relays token fragments only to approved WeaveRelay preview origins',async()=>{
  const callback=await fs.readFile(new URL('../netlify/functions/oauth-netlify-callback.mjs',import.meta.url),'utf8');
  assert.match(callback,/location\.hash/);
  assert.match(callback,/history\.replaceState/);
  assert.match(callback,/deploy-preview-/);
  assert.match(callback,/weaverelay\\\.netlify\\\.app/);
  assert.match(callback,/returnOrigin\+location\.pathname\+'#'\+fragment/);
  assert.match(callback,/takeOAuthState/);
  assert.match(callback,/encryptSecret/);
  assert.match(callback,/https:\/\/api\.netlify\.com\/api\/v1\/user/);
  assert.match(callback,/path:'\/api\/oauth\/netlify\/callback'/);
  assert.doesNotMatch(callback,/https:\/\/api\.netlify\.com\/oauth\/token/);
  assert.doesNotMatch(callback,/console\.log\([^\n]*accessToken/);
});

test('preview blob identity survives new commits on the same branch',async()=>{
  const store=await fs.readFile(new URL('../netlify/functions/_scoped-store.mjs',import.meta.url),'utf8');
  assert.match(store,/runtimeEnv\('BRANCH'\)\|\|runtimeEnv\('DEPLOY_PRIME_URL'\)\|\|runtimeEnv\('DEPLOY_ID'\)/);
});
