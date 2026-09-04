import test from'node:test';
import assert from'node:assert/strict';
import{PROVIDER_CONNECTION_IDS,DIRECT_CREDENTIAL_PROVIDER_IDS,OAUTH_PROVIDER_IDS,AUTO_DETECT_PROVIDER_IDS,providerConnectionState}from'../netlify/functions/_provider-connection-contract.mjs';
import{connectionFailureStatus,safeConnectionFailureDetail,validateProviderDisconnect,replacementSecretId}from'../netlify/functions/_provider-connection-hardening.mjs';

test('all 12 cards have deterministic lifecycle states',()=>{
 assert.equal(PROVIDER_CONNECTION_IDS.length,12);
 for(const id of [...DIRECT_CREDENTIAL_PROVIDER_IDS,...OAUTH_PROVIDER_IDS]){
  assert.equal(providerConnectionState(id,{connectionStatus:'pending'}).label,'CONNECT');
  assert.equal(providerConnectionState(id,{connectionStatus:'connected'}).label,'CONNECTED');
  assert.equal(providerConnectionState(id,{connectionStatus:'error'}).label,'NEEDS ACTION');
  assert.equal(providerConnectionState(id,{connectionStatus:'revoked'}).label,'NEEDS ACTION');
 }
 assert.equal(providerConnectionState('comfyui',{providerStatus:'detected'}).label,'AUTO-DETECT');
 assert.equal(providerConnectionState('comfyui',{providerStatus:'connected'}).label,'AUTO-DETECTED');
 assert.equal(providerConnectionState('comfyui',{providerStatus:'error'}).label,'NEEDS ACTION');
});

test('OAuth authorization rejection becomes revoked while provider outages remain errors',()=>{
 assert.equal(connectionFailureStatus('github',401),'revoked');
 assert.equal(connectionFailureStatus('railway',401),'revoked');
 assert.equal(connectionFailureStatus('github',500),'error');
 assert.equal(connectionFailureStatus('netlify',401),'error');
 assert.match(safeConnectionFailureDetail('github',401),/AUTHORIZE GITHUB/);
 assert.match(safeConnectionFailureDetail('railway',401),/AUTHORIZE READ-ONLY/);
 assert.match(safeConnectionFailureDetail('resend',429),/rate limit/i);
 assert.match(safeConnectionFailureDetail('vercel',503),/service error/i);
});

test('disconnect accepts only credential-bearing provider cards',()=>{
 for(const id of [...DIRECT_CREDENTIAL_PROVIDER_IDS,...OAUTH_PROVIDER_IDS])assert.doesNotThrow(()=>validateProviderDisconnect(id));
 assert.throws(()=>validateProviderDisconnect('comfyui'),/auto-detected/i);
 assert.throws(()=>validateProviderDisconnect('made-up'),/Unsupported provider/i);
});

test('successful reconnect replaces stale secret without deleting the new one',()=>{
 assert.equal(replacementSecretId({id:'old-secret'},'new-secret'),'old-secret');
 assert.equal(replacementSecretId({id:'same-secret'},'same-secret'),null);
 assert.equal(replacementSecretId(null,'new-secret'),null);
});

test('connection methods still cover every provider exactly once after hardening',()=>{
 const all=[...DIRECT_CREDENTIAL_PROVIDER_IDS,...OAUTH_PROVIDER_IDS,...AUTO_DETECT_PROVIDER_IDS];
 assert.equal(all.length,12);
 assert.equal(new Set(all).size,12);
 assert.deepEqual(new Set(all),new Set(PROVIDER_CONNECTION_IDS));
});
