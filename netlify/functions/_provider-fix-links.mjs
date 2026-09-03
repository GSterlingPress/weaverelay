import{prioritizeDiagnosis}from'./_diagnosis-priority.mjs';
const clean=v=>String(v??'').trim();
const enc=v=>encodeURIComponent(clean(v));

export const PROVIDER_FIX_FALLBACKS=Object.freeze({
  github:{label:'Open GitHub',url:'https://github.com/'},
  netlify:{label:'Open Netlify deploys',url:'https://app.netlify.com/'},
  vercel:{label:'Open Vercel projects',url:'https://vercel.com/dashboard'},
  render:{label:'Open Render services',url:'https://dashboard.render.com/'},
  cloudflare:{label:'Open Cloudflare dashboard',url:'https://dash.cloudflare.com/'},
  railway:{label:'Open Railway project',url:'https://railway.com/dashboard'},
  supabase:{label:'Open Supabase projects',url:'https://supabase.com/dashboard/projects'},
  neon:{label:'Open Neon projects',url:'https://console.neon.tech/app/projects'},
  stripe:{label:'Open Stripe webhooks',url:'https://dashboard.stripe.com/webhooks'},
  resend:{label:'Open Resend domains',url:'https://resend.com/domains'},
  runpod:{label:'Open RunPod Pods',url:'https://www.runpod.io/console/pods'},
  comfyui:{label:'Open proven ComfyUI target',url:null}
});

const safeHttps=value=>{try{const u=new URL(clean(value));return u.protocol==='https:'?u.toString():null}catch{return null}};
const first=(obj,keys)=>{for(const key of keys){const value=clean(obj?.[key]);if(value)return value}return''};

export function closestProviderFixLink(provider,evidence={}){
  const p=clean(provider).toLowerCase(),fallback=PROVIDER_FIX_FALLBACKS[p]||null;
  if(!fallback)return null;
  if(p==='github'){
    const repo=first(evidence,['repositoryFullName','repoFullName','repository','repo']);
    if(/^[^/\s]+\/[^/\s]+$/.test(repo))return{label:'Open exact GitHub repository',url:`https://github.com/${repo}`,depth:'resource'};
  }
  if(p==='netlify'){
    const site=first(evidence,['siteName','siteSlug']);
    if(site)return{label:'Open exact Netlify deploys',url:`https://app.netlify.com/sites/${enc(site)}/deploys`,depth:'resource'};
  }
  if(p==='vercel'){
    const project=first(evidence,['projectName','project']);
    const team=first(evidence,['teamSlug','team']);
    if(project&&team)return{label:'Open exact Vercel project',url:`https://vercel.com/${enc(team)}/${enc(project)}`,depth:'resource'};
  }
  if(p==='render'){
    const serviceId=first(evidence,['serviceId']);
    if(serviceId)return{label:'Open exact Render service',url:`https://dashboard.render.com/web/${enc(serviceId)}`,depth:'resource'};
  }
  if(p==='cloudflare'){
    const accountId=first(evidence,['accountId']);
    const zoneId=first(evidence,['zoneId']);
    if(accountId&&zoneId)return{label:'Open exact Cloudflare DNS zone',url:`https://dash.cloudflare.com/${enc(accountId)}/${enc(zoneId)}/dns/records`,depth:'resource'};
  }
  if(p==='railway'){
    const projectId=first(evidence,['railwayProjectId','projectId']);
    const serviceId=first(evidence,['railwayServiceId','serviceId']);
    if(projectId&&serviceId)return{label:'Open exact Railway service',url:`https://railway.com/project/${enc(projectId)}/service/${enc(serviceId)}`,depth:'resource'};
    if(projectId)return{label:'Open exact Railway project',url:`https://railway.com/project/${enc(projectId)}`,depth:'resource'};
  }
  if(p==='supabase'){
    const ref=first(evidence,['projectRef','supabaseProjectRef','projectId']);
    if(ref)return{label:'Open exact Supabase project',url:`https://supabase.com/dashboard/project/${enc(ref)}`,depth:'resource'};
  }
  if(p==='neon'){
    const projectId=first(evidence,['projectId']);
    if(projectId)return{label:'Open exact Neon project',url:`https://console.neon.tech/app/projects/${enc(projectId)}`,depth:'resource'};
  }
  if(p==='stripe'){
    const endpoint=first(evidence,['webhookEndpointId','endpointId']);
    if(endpoint&&endpoint.startsWith('we_'))return{label:'Open exact Stripe webhook',url:`https://dashboard.stripe.com/webhooks/${enc(endpoint)}`,depth:'resource'};
  }
  if(p==='resend'){
    const domainId=first(evidence,['domainId']);
    if(domainId)return{label:'Open exact Resend domain',url:`https://resend.com/domains/${enc(domainId)}`,depth:'resource'};
  }
  if(p==='runpod'){
    const podId=first(evidence,['podId','runpodPodId']);
    if(podId)return{label:'Open exact RunPod Pod',url:`https://www.runpod.io/console/pods/${enc(podId)}`,depth:'resource'};
  }
  if(p==='comfyui'){
    const target=safeHttps(first(evidence,['comfyuiUrl','targetUrl','runtimeUrl','url']));
    if(target)return{label:'Open proven ComfyUI target',url:target,depth:'resource'};
    return null;
  }
  return fallback.url?{...fallback,depth:'provider'}:null;
}

function evidenceForFinding(finding,checks){
  const out={};
  for(const id of finding?.evidence||[]){const check=checks.get(id);if(check?.evidence&&typeof check.evidence==='object')Object.assign(out,check.evidence)}
  return out;
}

export function applyClosestProviderFixLinks(diagnosis={},snapshot={}){
  const checks=new Map((snapshot.checks||[]).map(c=>[c.id,c]));
  for(const finding of diagnosis.findings||[]){if(!finding.provider)continue;const link=closestProviderFixLink(finding.provider,evidenceForFinding(finding,checks));if(link)finding.openProvider=link}
  diagnosis.safeRepairs=(diagnosis.safeRepairs||[]).map(repair=>{const finding=(diagnosis.findings||[]).find(f=>f.id===repair.finding);return finding?.openProvider?{...repair,openProvider:finding.openProvider}:repair});
  return prioritizeDiagnosis(diagnosis,snapshot);
}
