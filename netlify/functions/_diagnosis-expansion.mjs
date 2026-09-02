const clean=v=>String(v??'').trim();
const severityRank={critical:4,high:3,medium:2,low:1};
const byId=checks=>Object.fromEntries((checks||[]).map(c=>[c.id,c]));

function providerOpen(provider){const map={netlify:{label:'Open Netlify',url:'https://app.netlify.com/'},railway:{label:'Open Railway',url:'https://railway.com/dashboard'},runpod:{label:'Open RunPod',url:'https://www.runpod.io/console/pods'},vercel:{label:'Open Vercel',url:'https://vercel.com/dashboard'},render:{label:'Open Render',url:'https://dashboard.render.com/'},cloudflare:{label:'Open Cloudflare',url:'https://dash.cloudflare.com/'},neon:{label:'Open Neon',url:'https://console.neon.tech/'},resend:{label:'Open Resend',url:'https://resend.com/domains'}};return map[provider]||null}
function finding(id,severity,title,explanation,evidence,actions,provider,repair){return{id,severity,title,explanation,evidence:[evidence].filter(Boolean),actions,provider,repair:repair||{supported:false,approvalRequired:true,label:'GUIDED FIX'},openProvider:providerOpen(provider)}}
function put(list,item){const i=list.findIndex(x=>x.id===item.id);if(i>=0)list[i]=item;else list.push(item)}
function refresh(diagnosis){diagnosis.findings.sort((a,b)=>(severityRank[b.severity]||0)-(severityRank[a.severity]||0));if(diagnosis.findings[0])diagnosis.headline=diagnosis.findings[0].title;diagnosis.safeRepairs=diagnosis.findings.map(f=>({finding:f.id,label:f.repair?.label||'Review issue',supported:Boolean(f.repair?.supported),approvalRequired:f.repair?.approvalRequired!==false,type:f.repair?.type||null,provider:f.repair?.provider||f.provider||null,openProvider:f.openProvider||null})).slice(0,30);if(diagnosis.findings.some(f=>f.severity==='critical'||f.severity==='high'))diagnosis.status='broken';return diagnosis}

export function augmentDiagnosis(inputDiagnosis={},snapshot={}){
  const diagnosis={...inputDiagnosis,findings:[...(inputDiagnosis.findings||[])],safeRepairs:[...(inputDiagnosis.safeRepairs||[])]};
  const c=byId(snapshot.checks||[]);

  const deployDrift=c['map.github-netlify-deploy'],deployState=c['env.netlify-deploy-state'];
  if(deployState?.status==='FAIL'||deployDrift?.status==='WARN'||deployDrift?.status==='FAIL'){
    const source=deployState?.status==='FAIL'?deployState:deployDrift;
    put(diagnosis.findings,finding('netlify-production-rebuild','high','Netlify production needs a clean rebuild',source?.detail||'The deployed Netlify state does not match the proven source/deploy evidence.',source?.id,['Approve a rebuild only after WeaveRelay re-proves exactly one production site, one GitHub source repository, and one production branch. The rebuild does not change source code or environment values.'],'netlify',{supported:true,approvalRequired:true,type:'netlify-redeploy',provider:'netlify',label:'REBUILD & VERIFY'}));
  }

  const netlifyEnv=c['env.netlify-config-coverage'];
  if(netlifyEnv?.status==='WARN'&&Number(netlifyEnv.evidence?.missingKeyCount)>0){
    put(diagnosis.findings,finding('netlify-environment-missing','high','Netlify is missing environment configuration used by the source',netlifyEnv.detail,netlifyEnv.id,[`Missing configuration names: ${(netlifyEnv.evidence?.missingKeys||[]).slice(0,8).map(clean).filter(Boolean).join(', ')||'see diagnosis evidence'}. WeaveRelay will not invent secret values.`],'netlify',{supported:false,approvalRequired:true,label:'ADD PROVEN VALUES'}));
  }

  const railwayEnv=c['runtime.railway-env-coverage'];
  const missing=(railwayEnv?.evidence?.missingKeys||[]).map(clean);
  if(railwayEnv?.status==='WARN'&&missing.some(x=>x==='SUPABASE_URL')){
    put(diagnosis.findings,finding('railway-supabase-url-missing','critical','Railway is missing the Supabase project URL used by this app',railwayEnv.detail,railwayEnv.id,['WeaveRelay can fill only SUPABASE_URL when the deployed app proves exactly one Railway service and exactly one Supabase project in the connected accounts. The repair endpoint re-checks those facts immediately before writing.'],'railway',{supported:true,approvalRequired:true,type:'railway-supabase-url',provider:'railway',label:'FIX SUPABASE CONNECTION'}));
  }

  for(const [id,provider,label] of [['vercel.live','vercel','Vercel'],['render.live','render','Render'],['cloudflare.live','cloudflare','Cloudflare'],['neon.live','neon','Neon'],['resend.live','resend','Resend']]){
    if(c[id]?.status==='FAIL')put(diagnosis.findings,finding(`${provider}-connection-failed`,'high',`${label} connection is failing`,c[id].detail,id,[`Reconnect ${label} with the minimum required permission, then rerun diagnosis.`],provider,{supported:true,approvalRequired:true,type:'reconnect-provider',provider,label:`Reconnect ${label}`}));
  }

  const comfy=c['map.app-runpod-comfyui']||c['map.runpod-comfyui'];
  if(comfy?.status==='FAIL')put(diagnosis.findings,finding('runpod-comfyui-runtime-failed','critical','RunPod is present, but the ComfyUI runtime is not healthy',comfy.detail,comfy.id,['Inspect the proven RunPod target and ComfyUI runtime. WeaveRelay will not automatically start compute because that can create GPU spend. A separately approved start/restart repair can be added only when the exact target and cost boundary are proven.'],'runpod',{supported:false,approvalRequired:true,label:'REVIEW COMPUTE'}));

  const workflow=c['comfyui.workflow-compatibility'];
  if(workflow?.status==='FAIL')put(diagnosis.findings,finding('comfyui-workflow-incompatible','high','The selected ComfyUI workflow does not match the live runtime',workflow.detail,workflow.id,['Install or select the missing model/node dependency, or point the app at the intended ComfyUI runtime. WeaveRelay will not install arbitrary code or models automatically.'],'runpod',{supported:false,approvalRequired:true,label:'REPAIR WORKFLOW'}));

  return refresh(diagnosis);
}
