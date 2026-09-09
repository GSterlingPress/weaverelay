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

test('provider start binds Railway callback to preview and callback uses domain proof instead of legacy exactly-one-project selection',async()=>{
  const start=await fs.readFile(new URL('../netlify/functions/provider-start.mjs',import.meta.url),'utf8');
  const callback=await fs.readFile(new URL('../netlify/functions/oauth-railway-callback.mjs',import.meta.url),'utf8');
  assert.match(start,/railwayCallbackOrigin\(request\)/);
  assert.match(start,/callbackOrigin/);
  assert.match(callback,/findProjectForDomain/);
  assert.match(callback,/matchedDomain/);
  assert.doesNotMatch(callback,/select_exactly_one_project/);
});
