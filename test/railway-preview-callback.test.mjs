import test from'node:test';
import assert from'node:assert/strict';
import fs from'node:fs/promises';
import{railwayCallbackOrigin}from'../netlify/functions/_oauth.mjs';

const withPublicBase=async(value,fn)=>{const prior=process.env.PUBLIC_SITE_URL;process.env.PUBLIC_SITE_URL=value;try{return await fn();}finally{if(prior===undefined)delete process.env.PUBLIC_SITE_URL;else process.env.PUBLIC_SITE_URL=prior;}};

test('Railway preview OAuth uses the exact originating WeaveRelay deploy preview callback',async()=>{
  await withPublicBase('https://weaverelay.com',async()=>{
    const request=new Request('https://deploy-preview-33--weaverelay.netlify.app/api/provider/start');
    assert.equal(railwayCallbackOrigin(request),'https://deploy-preview-33--weaverelay.netlify.app');
  });
});

test('Railway production OAuth preserves the registered production callback origin',async()=>{
  await withPublicBase('https://weaverelay.com',async()=>{
    const request=new Request('https://weaverelay.com/api/provider/start');
    assert.equal(railwayCallbackOrigin(request),'https://weaverelay.com');
  });
});

test('unrelated netlify hosts cannot become Railway OAuth callback origins',async()=>{
  await withPublicBase('https://weaverelay.com',async()=>{
    const request=new Request('https://attacker-site.netlify.app/api/provider/start');
    assert.equal(railwayCallbackOrigin(request),'https://weaverelay.com');
  });
});

test('provider start isolates Railway preview and production client identities',async()=>{
  const start=await fs.readFile(new URL('../netlify/functions/provider-start.mjs',import.meta.url),'utf8');
  assert.match(start,/CONNECT_RAILWAY_DEV_CLIENT_ID/);
  assert.match(start,/public-preview/);
  assert.match(start,/confidential-production/);
  assert.match(start,/railwayClientMode/);
  assert.match(start,/railwayClientId/);
  assert.match(start,/railwayCallbackOrigin\(request\)/);
});

test('Railway callback enforces matching client context and public preview exchange never uses production secret',async()=>{
  const callback=await fs.readFile(new URL('../netlify/functions/oauth-railway-callback.mjs',import.meta.url),'utf8');
  assert.match(callback,/CONNECT_RAILWAY_DEV_CLIENT_ID/);
  assert.match(callback,/oauth_client_context_mismatch/);
  assert.match(callback,/production_oauth_secret_missing/);
  assert.match(callback,/clientMode==='public-preview'/);
  assert.match(callback,/form\.set\('client_id',configuredClientId\)/);
  assert.match(callback,/clientMode==='confidential-production'.*CONNECT_RAILWAY_CLIENT_SECRET/s);
  assert.match(callback,/findProjectForDomain/);
  assert.match(callback,/matchedDomain/);
  assert.doesNotMatch(callback,/select_exactly_one_project/);
});

test('Railway callback outcomes are terminal and do not restart authorization',async()=>{
  const callback=await fs.readFile(new URL('../netlify/functions/oauth-railway-callback.mjs',import.meta.url),'utf8');
  const client=await fs.readFile(new URL('../wr-railway-oauth.js',import.meta.url),'utf8');
  assert.match(callback,/terminal=1/);
  assert.doesNotMatch(callback,/provider\/start/);
  assert.doesNotMatch(client,/setTimeout\([^)]*start\(/s);
});
