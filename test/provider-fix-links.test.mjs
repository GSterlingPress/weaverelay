import test from 'node:test';
import assert from 'node:assert/strict';
import { PROVIDER_FIX_FALLBACKS,closestProviderFixLink } from '../netlify/functions/_provider-fix-links.mjs';

test('all twelve supported systems have a closest-link strategy',()=>{
  assert.deepEqual(Object.keys(PROVIDER_FIX_FALLBACKS).sort(),['cloudflare','comfyui','github','neon','netlify','railway','render','resend','runpod','stripe','supabase','vercel'].sort());
  for(const provider of Object.keys(PROVIDER_FIX_FALLBACKS)){
    const link=closestProviderFixLink(provider,{});
    if(provider==='comfyui')assert.equal(link,null);
    else{assert.ok(link?.url,provider);assert.match(link.url,/^https:\/\//)}
  }
});

test('resource identity beats generic provider dashboard',()=>{
  assert.equal(closestProviderFixLink('github',{repositoryFullName:'owner/repo'}).url,'https://github.com/owner/repo');
  assert.equal(closestProviderFixLink('netlify',{siteName:'studio-one'}).url,'https://app.netlify.com/sites/studio-one/deploys');
  assert.equal(closestProviderFixLink('supabase',{projectRef:'abc123'}).url,'https://supabase.com/dashboard/project/abc123');
  assert.equal(closestProviderFixLink('stripe',{webhookEndpointId:'we_123'}).url,'https://dashboard.stripe.com/webhooks/we_123');
  assert.equal(closestProviderFixLink('resend',{domainId:'dom_123'}).url,'https://resend.com/domains/dom_123');
});

test('ComfyUI links only to a proven HTTPS runtime target',()=>{
  assert.equal(closestProviderFixLink('comfyui',{targetUrl:'http://unsafe.example.com'}),null);
  const link=closestProviderFixLink('comfyui',{targetUrl:'https://runtime.example.com/'});
  assert.equal(link.url,'https://runtime.example.com/');
  assert.equal(link.depth,'resource');
});
