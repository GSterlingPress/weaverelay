const clean=v=>String(v??'').trim();
const byId=checks=>Object.fromEntries((checks||[]).map(c=>[c.id,c]));

const CONTROL_PLANE_PREFIXES=['github.','netlify.','vercel.','render.','cloudflare.','railway.runtime','supabase.','neon.','stripe.live','resend.','runpod.live'];
const OPERATIONAL_RULES=[
  {id:'map.app-railway',kind:'critical-dependency',detail:'The website loads, but the backend endpoint used by the deployed app does not match a proven Railway service.'},
  {id:'map.railway-supabase',kind:'critical-dependency',detail:'The website loads, but the Railway backend points at a Supabase project WeaveRelay cannot match to the connected production account.'},
  {id:'repair.railway-supabase-dependency',kind:'critical-dependency',detail:'The website loads, but the proven Railway → Supabase dependency is failing at runtime.'},
  {id:'map.app-runpod-comfyui',kind:'business-function',detail:'The website loads, but its proven RunPod/ComfyUI application path is not healthy.'},
  {id:'map.runpod-comfyui',kind:'business-function',detail:'The website loads, but the proven RunPod → ComfyUI runtime path is not healthy.'},
  {id:'comfyui.workflow-compatibility',kind:'business-function',detail:'The website loads, but its selected ComfyUI workflow is incompatible with the proven live runtime.'}
];

export function classifyOperationalHealth({siteObservation={},checks=[]}={}){
  if(siteObservation.status==='broken')return{status:'broken',incidentKind:'site-outage',detail:clean(siteObservation.detail)||'The public website is unreachable.',evidenceId:'app.public'};
  if(siteObservation.status!=='healthy')return{status:'attention',incidentKind:'site-outage',detail:clean(siteObservation.detail)||'The public website needs attention.',evidenceId:'app.public'};
  const index=byId(checks);
  for(const rule of OPERATIONAL_RULES){
    if(index[rule.id]?.status==='FAIL')return{status:'broken',incidentKind:rule.kind,detail:clean(index[rule.id]?.detail)||rule.detail,evidenceId:rule.id,publicSiteHealthy:true};
  }
  const failedControl=(checks||[]).find(c=>c?.status==='FAIL'&&CONTROL_PLANE_PREFIXES.some(prefix=>String(c.id||'').startsWith(prefix)));
  if(failedControl)return{status:'healthy',incidentKind:'control-plane',detail:`The website is responding. WeaveRelay could not inspect ${clean(failedControl.label)||'one connected provider'}, so this is a control-plane warning rather than an app outage.`,evidenceId:failedControl.id,publicSiteHealthy:true};
  return{status:'healthy',incidentKind:'healthy',detail:clean(siteObservation.detail)||'The public website and currently proven critical paths are healthy.',evidenceId:'app.public',publicSiteHealthy:true};
}

export const FUNCTIONAL_MONITOR_RULE_IDS=Object.freeze(OPERATIONAL_RULES.map(x=>x.id));
