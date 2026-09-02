import{requireUser}from'./_auth.mjs';
import{requireWorkspace,readConnection,readSecret}from'./_workspace-store.mjs';
import{decryptSecret}from'./_vault.mjs';
import{json,safeError}from'./_http.mjs';
import{summarizeRunPodPods}from'./_runpod-cost-safety.mjs';

const UA='weaverelay-runpod-pod-controls';
const timeout=ms=>AbortSignal.timeout?AbortSignal.timeout(ms):undefined;
async function runpod(token,path,options={}){const r=await fetch(`https://rest.runpod.io/v1/${path}`,{...options,headers:{authorization:`Bearer ${token}`,'user-agent':UA,accept:'application/json',...(options.headers||{})},signal:timeout(8000)});const data=await r.json().catch(()=>null);return{ok:r.ok,status:r.status,data}}

export default async request=>{
  if(request.method!=='GET')return json(405,{error:'Method not allowed.'});
  try{
    const user=await requireUser(request),url=new URL(request.url),workspace=await requireWorkspace(user.id,url.searchParams.get('workspaceId'));
    const c=await readConnection(workspace.id,'runpod').catch(()=>null);if(!c?.id||c.status==='revoked')return json(409,{error:'Connect RunPod first.'});
    const secret=decryptSecret(await readSecret(c.id));const token=secret?.accessToken;if(!token)return json(409,{error:'RunPod credential is unavailable.'});
    const r=await runpod(token,'pods');if(!r.ok)return json(r.status===401||r.status===403?403:502,{error:`RunPod Pod inventory returned HTTP ${r.status}.`});
    const summary=summarizeRunPodPods(r.data);
    return json(200,{ok:true,...summary,resourceBodiesRetained:false,environmentValuesRetained:false,rateUnit:'RunPod credits/hour'});
  }catch(error){return safeError(error)}
};
