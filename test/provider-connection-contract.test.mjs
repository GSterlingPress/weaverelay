import test from 'node:test';
import assert from 'node:assert/strict';
import { PROVIDERS } from '../netlify/functions/_provider-catalog.mjs';
import { PROVIDER_CONNECTION_CONTRACT,PROVIDER_CONNECTION_IDS,DIRECT_CREDENTIAL_PROVIDER_IDS,OAUTH_PROVIDER_IDS,AUTO_DETECT_PROVIDER_IDS,providerConnectionState } from '../netlify/functions/_provider-connection-contract.mjs';

test('every supported provider has exactly one primary customer connection method',()=>{
  assert.deepEqual(new Set(PROVIDER_CONNECTION_IDS),new Set(Object.keys(PROVIDERS)));
  assert.equal(PROVIDER_CONNECTION_IDS.length,12);
  for(const id of PROVIDER_CONNECTION_IDS)assert.match(PROVIDER_CONNECTION_CONTRACT[id].method,/^(oauth|credential|auto-detect)$/);
});

test('provider method split is complete and non-overlapping',()=>{
  assert.deepEqual(new Set(OAUTH_PROVIDER_IDS),new Set(['github','netlify','railway']));
  assert.deepEqual(new Set(AUTO_DETECT_PROVIDER_IDS),new Set(['comfyui']));
  assert.deepEqual(new Set(DIRECT_CREDENTIAL_PROVIDER_IDS),new Set(['supabase','stripe','runpod','vercel','render','cloudflare','neon','resend']));
  assert.equal(DIRECT_CREDENTIAL_PROVIDER_IDS.length+OAUTH_PROVIDER_IDS.length+AUTO_DETECT_PROVIDER_IDS.length,12);
});

test('all direct providers terminate in connected or needs action states',()=>{
  for(const id of [...DIRECT_CREDENTIAL_PROVIDER_IDS,...OAUTH_PROVIDER_IDS]){
    assert.equal(providerConnectionState(id,{connectionStatus:'connected'}).label,'CONNECTED');
    assert.equal(providerConnectionState(id,{connectionStatus:'error'}).label,'NEEDS ACTION');
    assert.equal(providerConnectionState(id,{connectionStatus:'revoked'}).label,'NEEDS ACTION');
    assert.equal(providerConnectionState(id,{connectionStatus:'not_connected'}).label,'CONNECT');
  }
});

test('ComfyUI terminates in auto-detected or needs action without requesting a duplicate credential',()=>{
  assert.equal(PROVIDER_CONNECTION_CONTRACT.comfyui.method,'auto-detect');
  assert.equal(providerConnectionState('comfyui',{providerStatus:'connected'}).label,'AUTO-DETECTED');
  assert.equal(providerConnectionState('comfyui',{providerStatus:'error'}).label,'NEEDS ACTION');
  assert.equal(providerConnectionState('comfyui',{providerStatus:'not_connected'}).label,'AUTO-DETECT');
});

test('every provider contract names a live proof boundary',()=>{
  for(const id of PROVIDER_CONNECTION_IDS)assert.ok(PROVIDER_CONNECTION_CONTRACT[id].probe);
});
