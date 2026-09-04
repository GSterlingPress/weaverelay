import crypto from 'node:crypto';

export const MONITOR_DEFAULTS=Object.freeze({
  enabled:false,
  intervalMinutes:5,
  emailAlerts:true,
  recoveryAlerts:true,
  failureThreshold:2,
  autoRepairMode:'off'
});

const clean=v=>String(v??'').trim();
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const esc=value=>clean(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function normalizeMonitoring(input={}){
  return{
    enabled:Boolean(input.enabled),
    intervalMinutes:clamp(Number(input.intervalMinutes)||MONITOR_DEFAULTS.intervalMinutes,5,60),
    emailAlerts:input.emailAlerts!==false,
    recoveryAlerts:input.recoveryAlerts!==false,
    failureThreshold:clamp(Number(input.failureThreshold)||MONITOR_DEFAULTS.failureThreshold,1,3),
    autoRepairMode:input.autoRepairMode==='preapproved-only'?'preapproved-only':'off'
  };
}

export function isMonitorDue(previous={},monitoringInput={},now=Date.now()){
  const monitoring=normalizeMonitoring(monitoringInput);
  if(!monitoring.enabled)return false;
  const last=Date.parse(previous.lastCheckedAt||'');
  if(!Number.isFinite(last))return true;
  return now-last>=monitoring.intervalMinutes*60*1000-5000;
}

export async function probePublicSite(siteOrigin,{fetchImpl=fetch,timeoutMs=8000}={}){
  const origin=clean(siteOrigin);
  if(!origin)return{status:'skipped',detail:'No production URL is configured for this workspace.',httpStatus:null,checkedAt:new Date().toISOString()};
  let url;
  try{url=new URL(origin);if(url.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(url.hostname))throw new Error();}catch{return{status:'attention',detail:'The configured production URL is invalid.',httpStatus:null,checkedAt:new Date().toISOString()};}
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetchImpl(url.origin,{method:'GET',redirect:'follow',headers:{'user-agent':'WeaveRelay-Monitor/1.0','cache-control':'no-cache'},signal:controller.signal});
    await response.body?.cancel?.().catch?.(()=>{});
    const httpStatus=response.status;
    if(httpStatus>=200&&httpStatus<400)return{status:'healthy',detail:`The production site answered HTTP ${httpStatus}.`,httpStatus,checkedAt:new Date().toISOString()};
    if(httpStatus>=500)return{status:'broken',detail:`The production site answered HTTP ${httpStatus}.`,httpStatus,checkedAt:new Date().toISOString()};
    return{status:'attention',detail:`The production site answered HTTP ${httpStatus}.`,httpStatus,checkedAt:new Date().toISOString()};
  }catch(error){
    return{status:'broken',detail:error?.name==='AbortError'?'The production site timed out.':'The production site could not be reached.',httpStatus:null,checkedAt:new Date().toISOString()};
  }finally{clearTimeout(timer)}
}

export function advanceMonitorState(previous={},observation,monitoringInput={},now=new Date().toISOString()){
  const monitoring=normalizeMonitoring(monitoringInput),oldStatus=previous.status||'unknown';
  const broken=observation?.status==='broken';
  const healthy=observation?.status==='healthy';
  const consecutiveFailures=broken?(Number(previous.consecutiveFailures)||0)+1:0;
  const confirmedBroken=broken&&consecutiveFailures>=monitoring.failureThreshold;
  const wasIncident=oldStatus==='broken'||Boolean(previous.incidentId);
  const incidentId=confirmedBroken?(previous.incidentId||crypto.randomUUID()):(healthy?null:previous.incidentId||null);
  const shouldAlertDown=monitoring.enabled&&monitoring.emailAlerts&&confirmedBroken&&!previous.alertedAt;
  const shouldAlertRecovery=monitoring.enabled&&monitoring.recoveryAlerts&&healthy&&wasIncident&&Boolean(previous.alertedAt);
  return{
    ...previous,
    status:confirmedBroken?'broken':healthy?'healthy':broken?'attention':observation?.status||'attention',
    consecutiveFailures,
    incidentId,
    lastCheckedAt:observation?.checkedAt||now,
    lastDetail:clean(observation?.detail).slice(0,500),
    lastHttpStatus:Number.isFinite(observation?.httpStatus)?observation.httpStatus:null,
    alertedAt:shouldAlertDown?now:(shouldAlertRecovery?null:previous.alertedAt||null),
    recoveredAt:shouldAlertRecovery?now:previous.recoveredAt||null,
    shouldAlertDown,
    shouldAlertRecovery
  };
}

export function topDiagnostic(diagnosis){
  const finding=Array.isArray(diagnosis?.findings)?diagnosis.findings[0]:null;
  return finding?{title:clean(finding.title).slice(0,180),explanation:clean(finding.explanation).slice(0,500),severity:clean(finding.severity).slice(0,30)}:null;
}

function incidentMessage(app,observation={}){
  if(observation.incidentKind==='critical-dependency')return{subject:`WeaveRelay alert: ${app} loads, but its backend is failing`,headline:`${app} loads, but its backend is failing`};
  if(observation.incidentKind==='business-function')return{subject:`WeaveRelay alert: ${app} loads, but a critical function is broken`,headline:`${app} loads, but a critical function is broken`};
  return{subject:`WeaveRelay alert: ${app} may be down`,headline:`${app} may be down`};
}

export function buildOutageEmail({workspace,observation,diagnosis,checkedAt=new Date().toISOString()}){
  const app=clean(workspace?.name)||'Your app',finding=topDiagnostic(diagnosis),message=incidentMessage(app,observation);
  const detail=finding?`${finding.title}. ${finding.explanation}`:clean(observation?.detail)||'WeaveRelay found a production-health problem.';
  const text=[message.headline,`Checked: ${checkedAt}`,clean(observation?.detail),finding?`Diagnosis: ${detail}`:'Diagnosis: WeaveRelay did not find enough evidence for a safe automatic repair.',`Automatic repair: not attempted unless this workspace has a separately approved, proven-safe repair policy.`,`Open WeaveRelay: https://weaverelay.com/app.html`].filter(Boolean).join('\n\n');
  const html=`<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;padding:28px;color:#17211d"><div style="font-size:12px;font-weight:700;letter-spacing:.08em;color:#66756f">WEAVERELAY MONITOR</div><h1 style="font-size:26px">${esc(message.headline)}</h1><p>${esc(observation?.detail||'WeaveRelay found a production-health problem.')}</p>${finding?`<p><strong>Diagnosis:</strong> ${esc(detail)}</p>`:'<p><strong>Diagnosis:</strong> WeaveRelay did not find enough evidence for a safe automatic repair.</p>'}<p><strong>Automatic repair:</strong> not attempted unless this workspace has a separately approved, proven-safe repair policy.</p><p><a href="https://weaverelay.com/app.html">Open WeaveRelay</a></p><p style="font-size:12px;color:#66756f">Checked ${esc(checkedAt)}</p></div>`;
  return{subject:message.subject,text,html};
}

export function buildRecoveryEmail({workspace,observation,checkedAt=new Date().toISOString()}){
  const app=clean(workspace?.name)||'Your app';
  const functional=observation?.incidentKind==='critical-dependency'||observation?.incidentKind==='business-function';
  const headline=functional?`${app}'s monitored function is healthy again`:`${app} is responding again`;
  return{subject:`WeaveRelay recovery: ${headline}`,text:`${headline}.\n\n${clean(observation?.detail)}\n\nChecked: ${checkedAt}\n\nOpen WeaveRelay: https://weaverelay.com/app.html`,html:`<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;padding:28px;color:#17211d"><div style="font-size:12px;font-weight:700;letter-spacing:.08em;color:#66756f">WEAVERELAY RECOVERY</div><h1 style="font-size:26px">${esc(headline)}</h1><p>${esc(observation?.detail||'The monitored production path is healthy again.')}</p><p><a href="https://weaverelay.com/app.html">Open WeaveRelay</a></p><p style="font-size:12px;color:#66756f">Checked ${esc(checkedAt)}</p></div>`};
}
