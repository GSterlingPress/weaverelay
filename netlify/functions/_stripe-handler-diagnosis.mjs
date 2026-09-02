const UA='weaverelay-stripe-handler-diagnosis';
const clean=v=>String(v??'').trim();
const timeout=ms=>AbortSignal.timeout?AbortSignal.timeout(ms):undefined;

async function stripeGet(token,path,fetchImpl=fetch){
  const r=await fetchImpl(`https://api.stripe.com${path}`,{headers:{authorization:`Bearer ${token}`,'user-agent':UA},signal:timeout(10000)});
  const data=await r.json().catch(()=>null);return{ok:r.ok,status:r.status,data};
}
function previousCheck(workspace,id){return workspace?.lastDiagnosticSnapshot?.checks?.find?.(x=>x?.id===id)||null}
function missingWebhookConfig(workspace){
  const missing=previousCheck(workspace,'runtime.railway-env-coverage')?.evidence?.missingKeys;
  if(!Array.isArray(missing))return[];
  return missing.filter(x=>/STRIPE.*WEBHOOK|WEBHOOK.*(?:SECRET|SIGNING)|STRIPE.*SIGNING/i.test(String(x))).slice(0,10);
}
async function safeRouteProbe(url,fetchImpl=fetch){
  try{
    const r=await fetchImpl(url,{method:'GET',headers:{'user-agent':UA,accept:'text/plain,application/json,*/*'},redirect:'manual',signal:timeout(6000)});
    try{await r.body?.cancel?.()}catch{}
    return{reachable:true,status:r.status,timedOut:false};
  }catch(error){
    const name=clean(error?.name).toLowerCase();
    return{reachable:false,status:null,timedOut:name.includes('timeout')||name.includes('abort')};
  }
}
function result(classification,detail,evidence={}){return{status:'FAIL',classification,detail,evidence:{handlerFailureClass:classification,handlerFailureIsolated:true,probeMethod:'GET',syntheticStripeEventSent:false,responseBodiesRetained:false,endpointUrlsRetained:false,...evidence}}}

export async function diagnoseStripeHandlerFailure({workspace,stripeToken,fetchImpl=fetch}={}){
  const repair=workspace?.lastRepair||{};
  if(repair.type!=='stripe-webhook-host'||repair.configurationVerified!==true)return null;
  if(!stripeToken)return{status:'WARN',classification:'authorization-unavailable',detail:'Stripe delivery is failing, but handler diagnosis cannot run without the connected Stripe authorization.',evidence:{handlerFailureIsolated:false,syntheticStripeEventSent:false}};
  const endpointId=clean(repair.endpointId);if(!endpointId)return{status:'WARN',classification:'endpoint-unavailable',detail:'Stripe delivery is failing, but the repaired endpoint identifier is unavailable for handler diagnosis.',evidence:{handlerFailureIsolated:false,syntheticStripeEventSent:false}};
  const endpoint=await stripeGet(stripeToken,`/v1/webhook_endpoints/${encodeURIComponent(endpointId)}`,fetchImpl);
  if(!endpoint.ok||!endpoint.data?.url)return{status:'WARN',classification:'endpoint-unreadable',detail:'Stripe delivery is failing, but WeaveRelay could not safely re-read the repaired endpoint.',evidence:{handlerFailureIsolated:false,httpStatus:endpoint.status||null,syntheticStripeEventSent:false,endpointUrlsRetained:false}};

  const missing=missingWebhookConfig(workspace);
  if(missing.length)return result('signature-configuration-missing','The Railway runtime is missing webhook-signature configuration referenced by the application source. Fix that configuration before changing the Stripe destination again.',{missingWebhookConfigNames:missing,routeProbeSkipped:true});

  const probe=await safeRouteProbe(endpoint.data.url,fetchImpl);
  if(!probe.reachable){
    if(probe.timedOut)return result('timeout-or-network','The webhook destination is correct, but a safe read-only route probe timed out. This supports a timeout or network/runtime availability problem rather than a Stripe URL mismatch.',{routeReachable:false,probeTimedOut:true});
    return result('network-unreachable','The webhook destination is correct, but a safe read-only route probe could not connect to the handler URL.',{routeReachable:false,probeTimedOut:false});
  }
  const s=Number(probe.status||0);
  if(s===404)return result('route-missing','The webhook host is correct, but the configured webhook path returns HTTP 404 to a safe read-only probe. Check that the Railway application actually exposes this route.',{routeReachable:true,httpStatus:s});
  if(s>=300&&s<400)return result('redirect','The webhook host is correct, but the configured webhook route redirects. Stripe treats redirect responses as failed webhook deliveries; configure the endpoint to the final non-redirecting route.',{routeReachable:true,httpStatus:s});
  if(s===401||s===403)return result('access-blocked','The webhook host is correct, but the route is access-controlled for a safe probe. Check middleware or gateway rules so Stripe can reach the webhook handler directly.',{routeReachable:true,httpStatus:s});
  if(s>=500)return result('handler-or-runtime-error','The webhook host is correct, but the handler path returns a server error even to a safe read-only probe. Inspect the Railway application logs and handler startup/runtime path.',{routeReachable:true,httpStatus:s});
  if(s===405)return result('post-route-present','The webhook path exists and rejects GET with HTTP 405, which is consistent with a POST-only webhook route. Delivery is still failing, so inspect signature verification and application processing rather than changing the destination URL.',{routeReachable:true,httpStatus:s,postOnlyRouteLikely:true});
  if(s===400)return result('request-validation-or-signature','The webhook path is reachable but rejects an unsigned non-Stripe request with HTTP 400. This is compatible with signature/request validation, but WeaveRelay will not claim a signature-secret failure without stronger evidence.',{routeReachable:true,httpStatus:s,signatureFailureProven:false});
  return result('handler-processing-unclassified',`The webhook route is reachable (HTTP ${s}), but Stripe delivery remains failed. The destination URL is no longer the likely problem; inspect Stripe's delivery attempt and Railway handler logs for the exact application response.`,{routeReachable:true,httpStatus:s,signatureFailureProven:false});
}
