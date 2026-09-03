import test from'node:test';
import assert from'node:assert/strict';
import fs from'node:fs';
import{sanitizeRuntimeEvent,sanitizeRuntimeBatch,runtimeCheckFromEvents,boundedRuntimeWindow}from'../netlify/functions/_browser-runtime.mjs';
import{augmentWebsiteDiagnosis}from'../netlify/functions/_website-diagnostics.mjs';

test('runtime sanitizer strips URL query secrets and ignores arbitrary event types',()=>{
 const safe=sanitizeRuntimeEvent({type:'fetch-failure',message:'boom',url:'https://example.com/api/order?token=secret#x',status:500,interaction:{kind:'submit',element:'form',journey:'Checkout',step:'Submit Order'}});
 assert.equal(safe.url,'https://example.com/api/order');
 assert.equal(safe.status,500);
 assert.equal(safe.interaction.journey,'Checkout');
 assert.equal(sanitizeRuntimeEvent({type:'form-values',message:'card=4111'}),null);
});

test('runtime batch is bounded and accepts only diagnostic event types',()=>{
 const input=Array.from({length:40},(_,i)=>({type:i%2?'javascript-error':'unknown',message:String(i),url:'https://example.com/app.js'}));
 const out=sanitizeRuntimeBatch(input);
 assert.ok(out.length<=20);
 assert.ok(out.every(x=>x.type==='javascript-error'));
});

test('runtime ingestion window caps noisy sites without losing the stored diagnostic model',()=>{
 const now=Date.parse('2026-09-03T14:00:30Z');
 const first=boundedRuntimeWindow({},100,{now,limit:120});
 assert.equal(first.accepted,100);
 assert.equal(first.rateLimited,false);
 const second=boundedRuntimeWindow({windowStartedAt:first.windowStartedAt,windowAccepted:100},40,{now:now+1000,limit:120});
 assert.equal(second.accepted,20);
 assert.equal(second.rateLimited,true);
 const reset=boundedRuntimeWindow({windowStartedAt:first.windowStartedAt,windowAccepted:120},5,{now:now+61000,limit:120});
 assert.equal(reset.accepted,5);
 assert.equal(reset.windowAccepted,5);
});

test('runtime evidence correlates a journey with the exact failing API without customer payloads',()=>{
 const now=Date.parse('2026-09-03T14:00:00Z');
 const check=runtimeCheckFromEvents([{type:'fetch-failure',message:'Fetch request failed',url:'https://shop.example.com/api/order',status:500,interaction:{kind:'submit',element:'form',journey:'Checkout',step:'Submit Order'},receivedAt:'2026-09-03T13:59:30Z'}],{now});
 assert.equal(check.status,'FAIL');
 assert.match(check.detail,/Checkout → Submit Order/);
 assert.match(check.detail,/HTTP 500/);
 assert.equal(check.evidence.formValuesRetained,false);
 assert.equal(check.evidence.responseBodiesRetained,false);
 assert.equal(check.evidence.headersRetained,false);
 assert.equal(check.evidence.cookiesRetained,false);
});

test('stale browser errors do not create a current failure',()=>{
 const check=runtimeCheckFromEvents([{type:'javascript-error',url:'https://example.com/app.js',receivedAt:'2026-09-03T10:00:00Z'}],{now:Date.parse('2026-09-03T14:00:00Z'),maxAgeMinutes:60});
 assert.equal(check.status,'WARN');
 assert.equal(check.evidence.eventCount,0);
});

test('browser runtime failure becomes an exact SHOW ME HOW website finding',()=>{
 const diagnosis=augmentWebsiteDiagnosis({findings:[],safeRepairs:[],status:'healthy'},{checks:[{id:'website.browser-runtime',status:'FAIL',detail:'Checkout → Submit Order: fetch failure at https://shop.example.com/api/order (HTTP 500).',evidence:{url:'https://shop.example.com/api/order',journey:'Checkout',step:'Submit Order'}}]});
 const finding=diagnosis.findings.find(x=>x.id==='website-browser-runtime-failed');
 assert.equal(finding.severity,'critical');
 assert.equal(finding.openProvider.url,'https://shop.example.com/api/order');
 assert.equal(finding.repair.supported,false);
 assert.equal(finding.repair.label,'SHOW ME HOW');
});

test('runtime agent never reads form values, cookies, response bodies, or request headers',()=>{
 const source=fs.readFileSync(new URL('../wr-runtime-agent.js',import.meta.url),'utf8');
 assert.doesNotMatch(source,/FormData\s*\(|\.value\b|document\.cookie|response\.text\s*\(|response\.json\s*\(|\.headers\b/);
 assert.match(source,/unhandledrejection/);
 assert.match(source,/fetch-failure/);
 assert.match(source,/xhr-failure/);
 assert.match(source,/data-weaverelay-journey|weaverelayJourney/);
 assert.match(source,/rawFetch/);
 assert.match(source,/isSelf/);
});

test('runtime observer is routed and surfaced in the app without enabling automatic clicks',()=>{
 const app=fs.readFileSync(new URL('../app.html',import.meta.url),'utf8');
 const netlify=fs.readFileSync(new URL('../netlify.toml',import.meta.url),'utf8');
 const setup=fs.readFileSync(new URL('../wr-runtime-setup.js',import.meta.url),'utf8');
 assert.match(app,/wr-runtime-setup\.js/);
 assert.match(netlify,/\/api\/runtime\/beacon/);
 assert.match(setup,/does not perform the interaction itself/i);
 assert.doesNotMatch(setup,/AUTO.?CLICK|AUTO.?SUBMIT/i);
});
