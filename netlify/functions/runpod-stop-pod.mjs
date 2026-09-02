import{requireUser}from'./_auth.mjs';
import{requireWorkspace,readConnection,readSecret}from'./_workspace-store.mjs';
import{decryptSecret}from'./_vault.mjs';
import{json,safeError}from'./_http.mjs';

const UA='weaverelay-runpod-stop-pod';
const timeout=ms=>AbortSignal.timeout?AbortSignal.timeout(ms):undefined;
const clean=v=>String(v??'').trim();
async function runpod(token,path,options={}){const r=await fetch(`https://rest.runpod.io/v1/${path}`,{...options,headers:{authorization:`Bearer ${token}`,'user-agent':UA,accept:'application/json',...(options.headers||{})},signal:timeout(9000)});const data=await r.json().catch(()=>null);return{ok:r.ok,status:r.status,data}}
function podState(p={}){return{status:clean(p.desiredStatus||p.status).toUpperCase(),locked:Boolean(p.locked),hasNetworkVolume:Boolean(p.networkVolumeId)}}
export default async request=>{
 if(request.method!=='POST')return json(405,{error:'Method not allowed.'});
 try{
  const user=await requireUser(request),body=await request.json(),workspace=await requireWorkspace(user.id,body.workspaceId);if(body.approved!==true)return json(400,{error:'Explicit approval is required immediately before stopping a Pod.'});
  const podId=clean(body.podId);if(!/^[A-Za-z0-9_-]{3,128}$/.test(podId))return json(400,{error:'A valid RunPod Pod ID is required.'});
  const c=await readConnection(workspace.id,'runpod').catch(()=>null);if(!c?.id||c.status==='revoked')return json(409,{error:'Connect RunPod first.'});const secret=decryptSecret(await readSecret(c.id));const token=secret?.accessToken;if(!token)return json(409,{error:'RunPod credential is unavailable.'});
  const before=await runpod(token,`pods/${encodeURIComponent(podId)}`);if(!before.ok)return json(before.status===404?404:before.status===401||before.status===403?403:502,{error:'WeaveRelay could not prove this Pod belongs to the connected RunPod account.'});const state=podState(before.data);
  if(state.status!=='RUNNING')return json(409,{error:'This Pod is not currently running.'});if(state.locked)return json(409,{error:'This Pod is locked in RunPod and cannot be stopped until it is unlocked there.'});if(state.hasNetworkVolume)return json(409,{error:'RunPod does not allow stopping Pods with attached network volumes. WeaveRelay will not terminate it automatically.'});
  const stopped=await runpod(token,`pods/${encodeURIComponent(podId)}/stop`,{method:'POST'});if(!stopped.ok)return json(stopped.status===401||stopped.status===403?403:502,{error:`RunPod rejected the stop request (HTTP ${stopped.status}).`});
  const after=await runpod(token,`pods/${encodeURIComponent(podId)}`).catch(()=>({ok:false,status:null,data:null}));const afterStatus=after.ok?podState(after.data).status:null;const stopVerified=afterStatus==='EXITED'||afterStatus==='TERMINATED';
  return json(200,{ok:true,message:stopVerified?'RunPod confirms the Pod is stopped.':'RunPod accepted the stop request. The Pod is transitioning out of RUNNING.',stopRequested:true,stopVerified,status:afterStatus||'STOP_REQUESTED',podIdRetained:false});
 }catch(error){return safeError(error)}
};
