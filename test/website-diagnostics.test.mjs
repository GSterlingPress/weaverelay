import test from'node:test';
import assert from'node:assert/strict';
import{buildWebsiteDiagnosticEvidence,augmentWebsiteDiagnosis}from'../netlify/functions/_website-diagnostics.mjs';
import{applyClosestProviderFixLinks}from'../netlify/functions/_provider-fix-links.mjs';

const response=(body,{status=200,url='https://example.com/',type='text/html'}={})=>{const r=new Response(body,{status,headers:{'content-type':type}});Object.defineProperty(r,'url',{value:url});return r};

test('website layer identifies broken same-origin browser assets',async()=>{
 const fetchImpl=async url=>{
  const u=String(url);
  if(u==='https://example.com/')return response('<html><head><script src="/app.js"></script><link rel="stylesheet" href="/app.css"></head><body><a href="/pricing">Pricing</a></body></html>',{url:u});
  if(u==='https://example.com/app.js')return response('missing',{status:404,url:u,type:'text/plain'});
  if(u==='https://example.com/app.css')return response('body{}',{url:u,type:'text/css'});
  if(u==='https://example.com/pricing')return response('<html>ok</html>',{url:u});
  if(u.includes('/.well-known/weaverelay/health')||u.includes('/api/weaverelay/diagnostic'))return response('missing',{status:404,url:u,type:'text/plain'});
  throw new Error('unexpected '+u);
 };
 const result=await buildWebsiteDiagnosticEvidence('https://example.com/',{fetchImpl});
 const assets=result.checks.find(x=>x.id==='website.assets');
 assert.equal(assets.status,'FAIL');
 assert.equal(assets.evidence.firstBrokenUrl,'https://example.com/app.js');
});

test('website layer detects mixed content before asking customer to change a backend provider',async()=>{
 const fetchImpl=async url=>{const u=String(url);if(u==='https://example.com/')return response('<html><script src="http://cdn.example.com/app.js"></script></html>',{url:u});if(u==='http://cdn.example.com/app.js')return response('ok',{url:u,type:'application/javascript'});if(u.includes('weaverelay'))return response('missing',{status:404,url:u,type:'text/plain'});return response('ok',{url:u})};
 const result=await buildWebsiteDiagnosticEvidence('https://example.com/',{fetchImpl});
 assert.equal(result.checks.find(x=>x.id==='website.mixed-content').status,'FAIL');
});

test('customer-owned diagnostic endpoint can prove HTTP-200-but-functionally-broken',async()=>{
 const fetchImpl=async url=>{const u=String(url);if(u==='https://example.com/')return response('<html><body>loads</body></html>',{url:u});if(u.endsWith('/.well-known/weaverelay/health'))return response(JSON.stringify({status:'broken',checks:[{status:'fail',component:'database'}]}),{url:u,type:'application/json'});return response('ok',{url:u})};
 const result=await buildWebsiteDiagnosticEvidence('https://example.com/',{fetchImpl});
 const self=result.checks.find(x=>x.id==='website.self-diagnostic');
 assert.equal(self.status,'FAIL');
 assert.equal(self.evidence.failedCheckCount,1);
 assert.equal(self.evidence.payloadRetained,false);
});

test('website findings route customer to the exact broken URL',()=>{
 const snapshot={checks:[{id:'website.assets',status:'FAIL',detail:'script broken',evidence:{firstBrokenUrl:'https://example.com/app.js'}}]};
 const diagnosis=augmentWebsiteDiagnosis({status:'attention',headline:'x',findings:[],safeRepairs:[]},snapshot);
 const finding=diagnosis.findings.find(x=>x.id==='website-assets-broken');
 assert.equal(finding.openProvider.url,'https://example.com/app.js');
 assert.equal(finding.openProvider.depth,'exact-failure');
});

test('provider findings are upgraded to the closest proven resource link',()=>{
 const snapshot={checks:[{id:'map.netlify-site',status:'FAIL',evidence:{siteName:'my-site'}}]};
 const diagnosis={findings:[{id:'nf',provider:'netlify',evidence:['map.netlify-site'],openProvider:{label:'generic',url:'https://app.netlify.com/'}}],safeRepairs:[{finding:'nf'}]};
 applyClosestProviderFixLinks(diagnosis,snapshot);
 assert.equal(diagnosis.findings[0].openProvider.url,'https://app.netlify.com/sites/my-site/deploys');
 assert.equal(diagnosis.findings[0].openProvider.depth,'resource');
});
