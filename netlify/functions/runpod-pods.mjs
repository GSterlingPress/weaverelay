import{requireUser}from'./_auth.mjs';
import{requireWorkspace,readConnection,readSecret}from'./_workspace-store.mjs';
import{decryptSecret}from'./_vault.mjs';
import{json,safeError}from'./_http.mjs';

const UA='weaverelay-runpod-pod-controls';
const timeout=ms=>AbortSignal.timeout?AbortSignal.timeout(ms):undefined;
const clean=v=>String(v??'').trim();

async function runpod(token,path,options={}){
  const r=await fetch(`https://rest.runpod.io/v1/${path}`,{...options,headers:{authorization:`Bearer ${token}`,'user-agent':UA,accept:'application/json',...(options.headers||{})},signal:timeout(8000)});
  const data=await r.json().catch(()=>null);return{ok:r.ok,status:r.status,data};
}

function safePod(p={}){
  const status=clean(p.desiredStatus||p.status).toUpperCase();
  const locked=Boolean(p.locked);const hasNetworkVolume=Boolean(p.networkVolumeId);
  const running=status==='RUNNING';
  return{id:clean(p.id),name:clean(p.name)||'RunPod Pod',status,locked,hasNetworkVolume,running,stoppable:running&&!locked&&!hasNetworkVolume,stopBlockedReason:!running?'Pod is not running.':locked?'Pod is locked in RunPod.':hasNetworkVolume?'Pods with attached network volumes cannot be stopped; RunPod requires termination instead.':null};
}

export default async request=>{
  if(request.method!=='GET')return json(405,{error:'Method not allowed.'});
  try{
    const user=await requireUser(request),url=new URL(request.url),workspace=await requireWorkspace(user.id,url.searchParams.get('workspaceId'));
    const c=await readConnection(workspace.id,'runpod').catch(()=>null);if(!c?.id||c.status==='revoked')return json(409,{error:'Connect RunPod first.'});
    const secret=decryptSecret(await readSecret(c.id));const token=secret?.accessToken;if(!token)return json(409,{error:'RunPod credential is unavailable.'});
    const r=await runpod(token,'pods');if(!r.ok)return json(r.status===401||r.status===403?403:502,{error:`RunPod Pod inventory returned HTTP ${r.status}.`});
    const pods=(Array.isArray(r.data)?r.data:[]).map(safePod).filter(p=>p.id);
    return json(200,{ok:true,pods,runningCount:pods.filter(p=>p.running).length,stoppableCount:pods.filter(p=>p.stoppable).length,resourceBodiesRetained:false,environmentValuesRetained:false});
  }catch(error){return safeError(error)}
};
