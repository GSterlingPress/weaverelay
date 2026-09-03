const clean=v=>String(v??'').trim();
const byId=checks=>Object.fromEntries((checks||[]).map(c=>[c.id,c]));

const CONTROL_PLANE_PREFIXES=['github.','netlify.','vercel.','render.','cloudflare.','railway.runtime','supabase.','neon.','stripe.live','resend.','runpod.live'];
const OPERATIONAL_RULES=[
  {id:'map.app-railway',kind:'critical-dependency',title:'Website loads, but the backend connection is broken',where:'App → Railway',detail:'The website loads, but the backend endpoint used by the deployed app does not match a proven Railway service.'},
  {id:'map.railway-supabase',kind:'critical-dependency',title:'Website loads, but the database connection is broken',where:'Railway → Supabase',detail:'The website loads, but the Railway backend points at a Supabase project WeaveRelay cannot match to the connected production account.'},
  {id:'repair.railway-supabase-dependency',kind:'critical-dependency',title:'Website loads, but the backend cannot reach its database',where:'Railway → Supabase runtime',detail:'The website loads, but the proven Railway → Supabase dependency is failing at runtime.'},
  {id:'map.app-runpod-comfyui',kind:'business-function',title:'Website loads, but its AI function is broken',where:'App → RunPod / ComfyUI',detail:'The website loads, but its proven RunPod/ComfyUI application path is not healthy.'},
  {id:'map.runpod-comfyui',kind:'business-function',title:'Website loads, but its AI runtime is broken',where:'RunPod → ComfyUI',detail:'The website loads, but the proven RunPod → ComfyUI runtime path is not healthy.'},
  {id:'comfyui.workflow-compatibility',kind:'business-function',title:'Website loads, but the selected AI workflow cannot run',where:'ComfyUI workflow → live runtime',detail:'The website loads, but its selected ComfyUI workflow is incompatible with the proven live runtime.'}
];

function safeEvidence(check={}){
  return{
    id:clean(check.id).slice(0,120)||null,
    label:clean(check.label).slice(0,160)||null,
    status:clean(check.status).slice(0,20)||null,
    detail:clean(check.detail).slice(0,500)||null
  };
}

export function classifyOperationalHealth({siteObservation={},checks=[]}={}){
  if(siteObservation.status==='broken')return{status:'broken',incidentKind:'site-outage',title:'Website is not responding',where:'Public website',detail:clean(siteObservation.detail)||'The public website is unreachable.',evidenceId:'app.public'};
  if(siteObservation.status!=='healthy')return{status:'attention',incidentKind:'site-outage',title:'Website needs attention',where:'Public website',detail:clean(siteObservation.detail)||'The public website needs attention.',evidenceId:'app.public'};
  const index=byId(checks);
  for(const rule of OPERATIONAL_RULES){
    if(index[rule.id]?.status==='FAIL')return{status:'broken',incidentKind:rule.kind,title:rule.title,where:rule.where,detail:clean(index[rule.id]?.detail)||rule.detail,evidenceId:rule.id,evidence:safeEvidence(index[rule.id]),publicSiteHealthy:true};
  }
  const failedControl=(checks||[]).find(c=>c?.status==='FAIL'&&CONTROL_PLANE_PREFIXES.some(prefix=>String(c.id||'').startsWith(prefix)));
  if(failedControl)return{status:'healthy',incidentKind:'control-plane',title:'Website is responding; WeaveRelay access needs attention',where:clean(failedControl.label)||'Connected provider',detail:`The website is responding. WeaveRelay could not inspect ${clean(failedControl.label)||'one connected provider'}, so this is a control-plane warning rather than an app outage.`,evidenceId:failedControl.id,evidence:safeEvidence(failedControl),publicSiteHealthy:true};
  return{status:'healthy',incidentKind:'healthy',title:'Monitored production paths are healthy',where:'Production app',detail:clean(siteObservation.detail)||'The public website and currently proven critical paths are healthy.',evidenceId:'app.public',publicSiteHealthy:true};
}

export function customerIncidentSummary(operational={}){
  const kind=clean(operational.incidentKind)||'unknown';
  const active=operational.status==='broken'||operational.status==='attention';
  return{
    active,
    kind,
    title:clean(operational.title).slice(0,180)||null,
    whatIsHappening:clean(operational.detail).slice(0,500)||null,
    whereItBreaks:clean(operational.where).slice(0,180)||null,
    evidenceId:clean(operational.evidenceId).slice(0,120)||null,
    evidence:operational.evidence?safeEvidence(operational.evidence):null,
    publicSiteHealthy:Boolean(operational.publicSiteHealthy),
    automaticRepairAttempted:false
  };
}

export const FUNCTIONAL_MONITOR_RULE_IDS=Object.freeze(OPERATIONAL_RULES.map(x=>x.id));
