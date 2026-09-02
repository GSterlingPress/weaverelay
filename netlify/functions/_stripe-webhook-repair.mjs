const UA='weaverelay-stripe-webhook-repair';
const clean=v=>String(v??'').trim();
const timeout=ms=>AbortSignal.timeout?AbortSignal.timeout(ms):undefined;
const hostOf=value=>{try{return new URL(value).hostname.toLowerCase()}catch{return''}};
const uniq=a=>[...new Set(a.filter(Boolean))];

async function graphql(token,query,variables={},fetchImpl=fetch){
  const r=await fetchImpl('https://backboard.railway.com/graphql/v2',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json','user-agent':UA},body:JSON.stringify({query,variables}),signal:timeout(10000)});
  const body=await r.json().catch(()=>null);
  return{ok:r.ok&&!body?.errors,status:r.status,data:body?.data||null};
}
async function stripeGet(token,path,fetchImpl=fetch){
  const r=await fetchImpl(`https://api.stripe.com${path}`,{headers:{authorization:`Bearer ${token}`,'user-agent':UA},signal:timeout(10000)});
  const data=await r.json().catch(()=>null);return{ok:r.ok,status:r.status,data};
}
async function stripePost(token,path,form,fetchImpl=fetch){
  const r=await fetchImpl(`https://api.stripe.com${path}`,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/x-www-form-urlencoded','user-agent':UA},body:new URLSearchParams(form).toString(),signal:timeout(10000)});
  const data=await r.json().catch(()=>null);return{ok:r.ok,status:r.status,data};
}
function extractRailwayHosts(text=''){const out=[];const re=/\b([a-z0-9-]+\.(?:up\.)?railway\.app)\b/gi;let m;while((m=re.exec(String(text)))&&out.length<50)out.push(m[1].toLowerCase());return uniq(out)}
async function scanAppRailwayHosts(siteOrigin,fetchImpl=fetch){
  if(!siteOrigin)return[];try{const home=await fetchImpl(siteOrigin,{headers:{'user-agent':UA,accept:'text/html,*/*'},redirect:'follow',signal:timeout(8000)});const html=(await home.text()).slice(0,350000);const chunks=[html],scripts=[];const re=/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;let m;while((m=re.exec(html))&&scripts.length<5){try{scripts.push(new URL(m[1],home.url||siteOrigin).href)}catch{}}for(const url of scripts){try{const r=await fetchImpl(url,{headers:{'user-agent':UA,accept:'application/javascript,*/*'},redirect:'follow',signal:timeout(8000)});if(r.ok)chunks.push((await r.text()).slice(0,450000))}catch{}}return extractRailwayHosts(chunks.join('\n'))}catch{return[]}}
async function railwayDomains(token,workspaceName,fetchImpl=fetch){
  const list=await graphql(token,'query { projects { edges { node { id name } } } }',{},fetchImpl);if(!list.ok)return[];const projects=(list.data?.projects?.edges||[]).map(e=>e?.node).filter(Boolean);const norm=v=>clean(v).toLowerCase().replace(/[^a-z0-9]+/g,'');const wanted=norm(workspaceName);let candidates=projects.filter(p=>{const n=norm(p.name);return wanted&&n&&(n.includes(wanted)||wanted.includes(n))});if(!candidates.length)candidates=projects.slice(0,6);else candidates=candidates.slice(0,4);const domains=[];
  for(const p of candidates){const q=await graphql(token,'query project($id: String!) { project(id: $id) { services { edges { node { id name } } } environments { edges { node { id name } } } } }',{id:p.id},fetchImpl);const pr=q.data?.project;if(!q.ok||!pr)continue;const envs=(pr.environments?.edges||[]).map(e=>e?.node).filter(Boolean).sort((a,b)=>/^(production|prod)$/i.test(b.name)-/^(production|prod)$/i.test(a.name)).slice(0,2);const services=(pr.services?.edges||[]).map(e=>e?.node).filter(Boolean).slice(0,10);for(const env of envs)for(const service of services){const v=await graphql(token,'query variables($projectId: String!, $environmentId: String!, $serviceId: String) { variables(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId) }',{projectId:p.id,environmentId:env.id,serviceId:service.id},fetchImpl);const raw=clean(v.data?.variables?.RAILWAY_PUBLIC_DOMAIN).toLowerCase().replace(/^https?:\/\//,'').split('/')[0];if(raw)domains.push(raw)}}return uniq(domains)}
function safeWebhookPath(url=''){try{const u=new URL(url);return /^\/(?:.*\/)?(?:stripe[-_]?webhooks?|webhooks?(?:\/stripe)?)(?:\/|$)/i.test(u.pathname)||/webhook/i.test(u.pathname)}catch{return false}}
function replaceHostOnly(url,targetHost){const u=new URL(url);u.protocol='https:';u.hostname=targetHost;u.port='';u.hash='';return u.toString()}

export async function inspectStripeWebhookRepair({workspace,railwayToken,stripeToken,fetchImpl=fetch}={}){
  if(!railwayToken||!stripeToken)return{eligible:false,reason:'providers-not-connected'};
  const [appHosts,ownedDomains,wh]=await Promise.all([scanAppRailwayHosts(workspace?.siteOrigin,fetchImpl),railwayDomains(railwayToken,workspace?.name,fetchImpl),stripeGet(stripeToken,'/v1/webhook_endpoints?limit=100',fetchImpl)]);
  if(!wh.ok)return{eligible:false,reason:wh.status===401||wh.status===403?'stripe-webhook-permission-unavailable':'stripe-webhooks-unreadable',httpStatus:wh.status};
  const enabled=Array.isArray(wh.data?.data)?wh.data.data.filter(x=>x?.status==='enabled'):[];
  const provenTargets=uniq(appHosts.filter(h=>ownedDomains.includes(h)));
  if(provenTargets.length!==1)return{eligible:false,reason:'railway-target-not-unique',provenTargetCount:provenTargets.length};
  if(enabled.length!==1)return{eligible:false,reason:'stripe-endpoint-not-unique',enabledEndpointCount:enabled.length};
  const endpoint=enabled[0];const currentHost=hostOf(endpoint?.url);const targetHost=provenTargets[0];
  if(!currentHost||!safeWebhookPath(endpoint?.url))return{eligible:false,reason:'webhook-route-not-proven'};
  if(currentHost===targetHost)return{eligible:false,reason:'already-correct',alreadyCorrect:true,targetHost};
  return{eligible:true,reason:'single-proven-host-mismatch',targetHost,endpointId:clean(endpoint.id),currentHost,pathPreserved:true};
}

export async function applyStripeWebhookRepair({workspace,railwayToken,stripeToken,fetchImpl=fetch}={}){
  const proposal=await inspectStripeWebhookRepair({workspace,railwayToken,stripeToken,fetchImpl});
  if(!proposal.eligible)throw new Error(`WeaveRelay cannot safely repair this Stripe webhook: ${proposal.reason}.`);
  const before=await stripeGet(stripeToken,`/v1/webhook_endpoints/${encodeURIComponent(proposal.endpointId)}`,fetchImpl);if(!before.ok||!before.data?.url)throw new Error('Stripe webhook could not be re-read immediately before the approved repair.');
  if(hostOf(before.data.url)!==proposal.currentHost||!safeWebhookPath(before.data.url))throw new Error('Stripe webhook changed after diagnosis; repair stopped without writing.');
  const oldUrl=new URL(before.data.url);const desired=replaceHostOnly(before.data.url,proposal.targetHost);const update=await stripePost(stripeToken,`/v1/webhook_endpoints/${encodeURIComponent(proposal.endpointId)}`,{url:desired},fetchImpl);
  if(!update.ok){if(update.status===401||update.status===403)throw new Error('Stripe authorization can read webhook metadata but cannot update the endpoint. Reconnect Stripe with narrowly scoped webhook endpoint write permission, then retry.');throw new Error(`Stripe rejected the approved webhook update (HTTP ${update.status}).`)}
  const verify=await stripeGet(stripeToken,`/v1/webhook_endpoints/${encodeURIComponent(proposal.endpointId)}`,fetchImpl);if(!verify.ok||!verify.data?.url)throw new Error('Stripe accepted the update, but WeaveRelay could not verify the saved webhook endpoint.');
  const v=new URL(verify.data.url);const verified=v.hostname.toLowerCase()===proposal.targetHost&&v.pathname===oldUrl.pathname&&v.search===oldUrl.search;
  if(!verified)throw new Error('Stripe webhook verification did not match the approved host-only repair.');
  return{changed:true,verified:true,targetHost:proposal.targetHost,pathPreserved:true,endpointId:proposal.endpointId,endpointUrlsRetained:false,signingSecretsRetained:false};
}
