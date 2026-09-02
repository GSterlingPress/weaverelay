import{requireUser}from'./_auth.mjs';
import{requireWorkspace,readConnection,readSecret}from'./_workspace-store.mjs';
import{decryptSecret}from'./_vault.mjs';
import{json,safeError}from'./_http.mjs';
import{planApprovedStopScope}from'./_runpod-cost-safety.mjs';

const UA='weaverelay-runpod-stop-all';
const timeout=ms=>AbortSignal.timeout?AbortSignal.timeout(ms):undefined;
const validId=v=>/^[A-Za-z0-9_-]{3,128}$/.test(String(v||''));
async function runpod(token,path,options={}){const r=await fetch(`https://rest.runpod.io/v1/${path}`,{...options,headers:{authorization:`Bearer ${token}`,'user-agent':UA,accept:'application/json',...(options.headers||{})},signal:timeout(9000)});const data=await r.json().catch(()=>null);return{ok:r.ok,status:r.status,data}}

export default async request=>{
 if(request.method!=='POST')return json(405,{error:'Method not allowed.'});
 try{
  const user=await requireUser(request),body=await request.json(),workspace=await requireWorkspace(user.id,body.workspaceId);
  if(body.approved!==true)return json(400,{error:'Explicit approval is required immediately before stopping multiple Pods.'});
  const expected=[...new Set((Array.isArray(body.expectedPodIds)?body.expectedPodIds:[]).map(String))];
  if(!expected.length||expected.length>50||expected.some(id=>!validId(id)))return json(400,{error:'A valid reviewed list of RunPod Pod IDs is required.'});
  const c=await readConnection(workspace.id,'runpod').catch(()=>null);if(!c?.id||c.status==='revoked')return json(409,{error:'Connect RunPod first.'});const secret=decryptSecret(await readSecret(c.id));const token=secret?.accessToken;if(!token)return json(409,{error:'RunPod credential is unavailable.'});
  const inventory=await runpod(token,'pods');if(!inventory.ok)return json(inventory.status===401||inventory.status===403?403:502,{error:`RunPod Pod inventory returned HTTP ${inventory.status}.`});
  const plan=planApprovedStopScope(inventory.data,expected);if(plan.missing.length)return json(409,{error:'The reviewed Pod list changed before approval could be applied. Refresh the RunPod safety panel and try again.',scopeChanged:true,missingCount:plan.missing.length});
  const results=await Promise.all(plan.stop.map(async p=>{const r=await runpod(token,`pods/${encodeURIComponent(p.id)}/stop`,{method:'POST'});return{id:p.id,ok:r.ok,status:r.status}}));
  const stopped=results.filter(x=>x.ok),failed=results.filter(x=>!x.ok);
  return json(200,{ok:failed.length===0,stopRequestedCount:stopped.length,failedStopCount:failed.length,blockedCount:plan.blocked.length,reviewedPodCount:expected.length,message:failed.length?`RunPod accepted ${stopped.length} stop request${stopped.length===1?'':'s'}, but ${failed.length} request${failed.length===1?'':'s'} failed. ${plan.blocked.length} reviewed running Pod${plan.blocked.length===1?' was':'s were'} left untouched because stopping was not safely available.`:`RunPod accepted ${stopped.length} approved stop request${stopped.length===1?'':'s'}. ${plan.blocked.length} reviewed running Pod${plan.blocked.length===1?' was':'s were'} left untouched because stopping was not safely available.`,podIdsRetained:false,terminationRequested:false,newlyDiscoveredPodsStopped:false});
 }catch(error){return safeError(error)}
};
