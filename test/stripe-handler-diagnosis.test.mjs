import test from'node:test';
import assert from'node:assert/strict';
import{diagnoseStripeHandlerFailure}from'../netlify/functions/_stripe-handler-diagnosis.mjs';

const baseWorkspace={lastRepair:{type:'stripe-webhook-host',configurationVerified:true,endpointId:'we_123'},lastDiagnosticSnapshot:{checks:[]}};
const stripeEndpoint={id:'we_123',url:'https://backend.up.railway.app/api/stripe/webhook'};
function fetchWithProbe(status,{throwProbe=false}={}){return async url=>{if(String(url).includes('api.stripe.com'))return new Response(JSON.stringify(stripeEndpoint),{status:200,headers:{'content-type':'application/json'}});if(throwProbe){const e=new Error('timed out');e.name='TimeoutError';throw e}return new Response('',{status})}}

test('classifies missing webhook signature configuration before probing the route',async()=>{
 const workspace={...baseWorkspace,lastDiagnosticSnapshot:{checks:[{id:'runtime.railway-env-coverage',evidence:{missingKeys:['STRIPE_WEBHOOK_SECRET']}}]}};
 let calls=0;const fetchImpl=async url=>{calls++;if(String(url).includes('api.stripe.com'))return new Response(JSON.stringify(stripeEndpoint),{status:200});throw new Error('probe should not run')};
 const r=await diagnoseStripeHandlerFailure({workspace,stripeToken:'rk_test',fetchImpl});
 assert.equal(r.classification,'signature-configuration-missing');assert.deepEqual(r.evidence.missingWebhookConfigNames,['STRIPE_WEBHOOK_SECRET']);assert.equal(r.evidence.syntheticStripeEventSent,false);assert.equal(calls,1);
});

test('classifies a missing webhook route from safe GET 404',async()=>{const r=await diagnoseStripeHandlerFailure({workspace:baseWorkspace,stripeToken:'rk_test',fetchImpl:fetchWithProbe(404)});assert.equal(r.classification,'route-missing');assert.equal(r.evidence.httpStatus,404);assert.equal(r.evidence.probeMethod,'GET')});

test('classifies POST-only route without pretending signature failure is proven',async()=>{const r=await diagnoseStripeHandlerFailure({workspace:baseWorkspace,stripeToken:'rk_test',fetchImpl:fetchWithProbe(405)});assert.equal(r.classification,'post-route-present');assert.equal(r.evidence.postOnlyRouteLikely,true);assert.equal(r.evidence.syntheticStripeEventSent,false)});

test('classifies server error and timeout separately',async()=>{const server=await diagnoseStripeHandlerFailure({workspace:baseWorkspace,stripeToken:'rk_test',fetchImpl:fetchWithProbe(500)});assert.equal(server.classification,'handler-or-runtime-error');const timed=await diagnoseStripeHandlerFailure({workspace:baseWorkspace,stripeToken:'rk_test',fetchImpl:fetchWithProbe(0,{throwProbe:true})});assert.equal(timed.classification,'timeout-or-network')});

test('HTTP 400 is treated as compatible with validation but not proof of bad Stripe signature secret',async()=>{const r=await diagnoseStripeHandlerFailure({workspace:baseWorkspace,stripeToken:'rk_test',fetchImpl:fetchWithProbe(400)});assert.equal(r.classification,'request-validation-or-signature');assert.equal(r.evidence.signatureFailureProven,false)});
