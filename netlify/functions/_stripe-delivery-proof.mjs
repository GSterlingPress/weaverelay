const UA='weaverelay-stripe-delivery-proof';
const clean=v=>String(v??'').trim();
const timeout=ms=>AbortSignal.timeout?AbortSignal.timeout(ms):undefined;
const hostOf=value=>{try{return new URL(value).hostname.toLowerCase()}catch{return''}};

async function stripeGet(token,path,fetchImpl=fetch){
  const r=await fetchImpl(`https://api.stripe.com${path}`,{headers:{authorization:`Bearer ${token}`,'user-agent':UA},signal:timeout(10000)});
  const data=await r.json().catch(()=>null);return{ok:r.ok,status:r.status,data};
}
function selected(type,enabled=[]){return enabled.includes('*')||enabled.includes(type)}
function unixSeconds(value){const n=Date.parse(value);return Number.isFinite(n)?Math.floor(n/1000):null}

export async function verifyStripeWebhookDelivery({workspace,stripeToken,fetchImpl=fetch,nowMs=Date.now()}={}){
  const repair=workspace?.lastRepair||{};
  if(repair.type!=='stripe-webhook-host'||repair.configurationVerified!==true)return null;
  if(!stripeToken)return{status:'WARN',detail:'The Stripe webhook configuration is saved, but Stripe delivery verification cannot run without the connected Stripe authorization.',evidence:{deliveryVerified:false}};
  const endpointId=clean(repair.endpointId),targetHost=clean(repair.targetHost).toLowerCase(),approvedAt=unixSeconds(repair.approvedAt);
  if(!endpointId||!targetHost||!approvedAt)return{status:'WARN',detail:'The Stripe webhook configuration is saved, but the repair record does not contain enough non-secret metadata for delivery verification.',evidence:{deliveryVerified:false}};

  const [endpoint,list]=await Promise.all([
    stripeGet(stripeToken,`/v1/webhook_endpoints/${encodeURIComponent(endpointId)}`,fetchImpl),
    stripeGet(stripeToken,'/v1/webhook_endpoints?limit=100',fetchImpl)
  ]);
  if(!endpoint.ok||!endpoint.data?.url)return{status:'WARN',detail:'WeaveRelay could not re-read the repaired Stripe webhook endpoint, so delivery remains unverified.',evidence:{deliveryVerified:false,httpStatus:endpoint.status||null}};
  if(hostOf(endpoint.data.url)!==targetHost)return{status:'FAIL',detail:'The Stripe webhook destination no longer points to the Railway host that was approved and verified during repair.',evidence:{deliveryVerified:false,configurationDrift:true,endpointUrlsRetained:false}};
  const enabled=Array.isArray(list.data?.data)?list.data.data.filter(x=>x?.status==='enabled'):[];
  if(!list.ok||enabled.length!==1||clean(enabled[0]?.id)!==endpointId)return{status:'WARN',detail:'The webhook URL is correct, but Stripe now has multiple or changed enabled webhook destinations. WeaveRelay cannot safely attribute account-level delivery state to this one endpoint.',evidence:{deliveryVerified:false,enabledEndpointCount:enabled.length,endpointUrlsRetained:false}};

  const enabledEvents=Array.isArray(endpoint.data?.enabled_events)?endpoint.data.enabled_events.filter(x=>typeof x==='string').slice(0,100):[];
  const events=await stripeGet(stripeToken,`/v1/events?created[gte]=${approvedAt}&limit=25`,fetchImpl);
  if(!events.ok||!Array.isArray(events.data?.data))return{status:'WARN',detail:'The Stripe webhook URL is correct, but recent event delivery state could not be read with the current Stripe authorization.',evidence:{deliveryVerified:false,httpStatus:events.status||null,eventPayloadsRetained:false}};
  const matching=events.data.data.filter(e=>e&&selected(clean(e.type),enabledEvents));
  if(!matching.length)return{status:'WARN',detail:'The Stripe webhook URL is correct, but no post-repair Stripe event matching this endpoint has occurred yet. WeaveRelay will not create a financial event merely to manufacture a green check.',evidence:{deliveryVerified:false,matchingEventCount:0,endpointUrlsRetained:false,eventPayloadsRetained:false}};

  const successful=matching.filter(e=>Number(e.pending_webhooks||0)===0);
  if(successful.length)return{status:'PASS',detail:'After the webhook repair, Stripe recorded a matching event with no pending webhook deliveries. Because this is the only enabled webhook endpoint, the Stripe → Railway callback chain is now supported by real post-repair delivery evidence.',evidence:{deliveryVerified:true,matchingEventCount:matching.length,successfulEventCount:successful.length,pendingEventCount:matching.length-successful.length,endpointUrlsRetained:false,eventPayloadsRetained:false}};

  const graceSeconds=300;const now=Math.floor(nowMs/1000);const oldestAge=Math.max(...matching.map(e=>Math.max(0,now-Number(e.created||now))));
  if(oldestAge<graceSeconds)return{status:'WARN',detail:'Stripe has produced a matching post-repair event, but webhook delivery is still pending inside the short verification grace period.',evidence:{deliveryVerified:false,matchingEventCount:matching.length,pendingEventCount:matching.length,gracePeriodSeconds:graceSeconds,endpointUrlsRetained:false,eventPayloadsRetained:false}};
  return{status:'FAIL',detail:'The Stripe webhook URL is correct, but a matching post-repair event has remained pending beyond the verification grace period. This isolates the problem to webhook delivery or the Railway handler rather than the destination URL.',evidence:{deliveryVerified:false,matchingEventCount:matching.length,pendingEventCount:matching.length,oldestPendingAgeSeconds:oldestAge,endpointUrlsRetained:false,eventPayloadsRetained:false}};
}
