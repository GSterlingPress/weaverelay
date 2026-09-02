const rank={PASS:0,SKIPPED:1,WARN:2,FAIL:3};
const clean=v=>String(v??'').trim();

export function sanitizeSnapshot(input={}){
  const checks=Array.isArray(input.checks)?input.checks:[];
  return {
    product:clean(input.product).slice(0,80)||'Unknown app',
    version:clean(input.version).slice(0,80)||null,
    generatedAt:clean(input.generatedAt)||new Date().toISOString(),
    mode:'read-only',
    topology:input.topology&&typeof input.topology==='object'?input.topology:{},
    checks:checks.slice(0,100).map(c=>({
      id:clean(c.id).slice(0,120),
      label:clean(c.label).slice(0,120),
      status:['PASS','WARN','FAIL','SKIPPED'].includes(c.status)?c.status:'WARN',
      detail:clean(c.detail).slice(0,1000),
      evidence:safeEvidence(c.evidence)
    })).filter(c=>c.id)
  };
}
function safeEvidence(value,depth=0){
  if(depth>3||value==null)return null;
  if(typeof value==='string')return value.slice(0,500);
  if(typeof value==='number'||typeof value==='boolean')return value;
  if(Array.isArray(value))return value.slice(0,20).map(v=>safeEvidence(v,depth+1));
  if(typeof value==='object'){
    const out={};
    for(const [k,v] of Object.entries(value).slice(0,30)){
      if(/secret|token|password|key|authorization|cookie/i.test(k))continue;
      out[k.slice(0,80)]=safeEvidence(v,depth+1);
    }
    return out;
  }
  return null;
}

function byId(snapshot){return Object.fromEntries(snapshot.checks.map(c=>[c.id,c]));}
function finding(id,severity,title,explanation,evidence=[],actions=[]){return{id,severity,title,explanation,evidence,actions};}

export function diagnoseSnapshot(input={}){
  const snapshot=sanitizeSnapshot(input); const c=byId(snapshot); const findings=[];
  const active=snapshot.checks.filter(x=>x.status!=='SKIPPED');

  if(c['netlify.preview']?.status==='PASS' && c['railway.runtime']?.status==='PASS'){
    const front=c['netlify.preview']?.evidence?.origin;
    const back=c['railway.runtime']?.evidence?.domain;
    if(front&&back&&String(front).includes(String(back))){}
  }
  if(c['github.live']?.status==='FAIL') findings.push(finding('github-unreachable','high','GitHub connection is failing',c['github.live'].detail,['github.live'],['Reconnect GitHub with read-only repository/deployment access.']));
  if(c['supabase.live']?.status==='FAIL') findings.push(finding('supabase-unreachable','high','Supabase connection is failing',c['supabase.live'].detail,['supabase.live'],['Verify the selected Supabase project and authorization.']));
  if(c['stripe.live']?.status==='FAIL') findings.push(finding('stripe-unreachable','high','Stripe connection is failing',c['stripe.live'].detail,['stripe.live'],['Reconnect Stripe and re-check webhook configuration.']));
  if(c['netlify.preview']?.status==='FAIL') findings.push(finding('frontend-unreachable','critical','The deployed frontend is not healthy',c['netlify.preview'].detail,['netlify.preview'],['Inspect the latest frontend deploy and domain configuration.']));

  const rp=c['runpod.readonly'];
  const comfy=c['comfyui.readiness'];
  if(rp?.status==='PASS' && comfy && comfy.status!=='PASS') findings.push(finding('compute-app-boundary','high','Failure boundary is after RunPod provisioning',`RunPod is reachable, but the application readiness check is ${comfy.status.toLowerCase()}: ${comfy.detail}`,['runpod.readonly','comfyui.readiness'],['Inspect container startup output and ComfyUI readiness without starting a new pod.']));
  else if(rp?.status==='WARN') findings.push(finding('runpod-unverified','medium','RunPod is not yet verified',rp.detail,['runpod.readonly'],['Authorize read-only RunPod inspection or provide an existing pod ID.']));

  for(const check of active){
    if(check.status==='WARN'&&!findings.some(f=>f.evidence.includes(check.id)))findings.push(finding(`warn-${check.id}`,'medium',`${check.label} needs attention`,check.detail,[check.id],['Verify this connection in WeaveRelay.']));
  }
  findings.sort((a,b)=>({critical:4,high:3,medium:2,low:1}[b.severity]-({critical:4,high:3,medium:2,low:1}[a.severity])));
  const worst=active.reduce((m,x)=>rank[x.status]>rank[m]?x.status:m,'PASS');
  const passed=active.filter(x=>x.status==='PASS').length;
  const headline=findings[0]?.title || (worst==='PASS'?'No cross-system failure found in the current read-only snapshot':'More connection evidence is needed');
  return {
    mode:'read-only',
    status:worst==='FAIL'?'broken':findings.length?'attention':'healthy',
    headline,
    summary:`${passed} of ${active.length} active checks passed. ${findings.length} diagnostic finding${findings.length===1?'':'s'}.`,
    findings,
    safeRepairs:findings.flatMap(f=>f.actions.map(action=>({finding:f.id,action,automatic:false}))).slice(0,20),
    destructiveChangesAllowed:false,
    diagnosedAt:new Date().toISOString()
  };
}
