const UA='weaverelay-runpod-comfyui-readonly';
const clean=v=>String(v??'').trim();
const timeout=ms=>AbortSignal.timeout?AbortSignal.timeout(ms):undefined;

async function runpodGet(token,path,fetchImpl=fetch){
  const r=await fetchImpl(`https://rest.runpod.io/v1/${path}`,{headers:{authorization:`Bearer ${token}`,'user-agent':UA,accept:'application/json'},signal:timeout(10000)});
  const data=await r.json().catch(()=>null);return{ok:r.ok,status:r.status,data};
}
function candidatePod(p={}){
  const text=[p.name,p.image,p.imageName,...(Array.isArray(p.dockerStartCmd)?p.dockerStartCmd:[]),...(Array.isArray(p.dockerEntrypoint)?p.dockerEntrypoint:[])].join(' ').toLowerCase();
  const ports=Array.isArray(p.ports)?p.ports.map(String):[];
  const comfyPort=ports.find(x=>/^8188\/http$/i.test(x))?'8188':(text.includes('comfyui')?'8188':null);
  return comfyPort&&clean(p.id)&&String(p.desiredStatus||'').toUpperCase()==='RUNNING'?{id:clean(p.id),port:comfyPort}:null;
}
async function comfyProbe(pod,fetchImpl=fetch){
  const url=`https://${encodeURIComponent(pod.id)}-${pod.port}.proxy.runpod.net/system_stats`;
  try{
    const r=await fetchImpl(url,{method:'GET',headers:{'user-agent':UA,accept:'application/json'},redirect:'manual',signal:timeout(6500)});
    const data=await r.json().catch(()=>null);
    const looksComfy=Boolean(r.ok&&data&&typeof data==='object'&&data.system&&Array.isArray(data.devices));
    return{reachable:r.ok,httpStatus:r.status,looksComfy,version:looksComfy&&typeof data.system?.comfyui_version==='string'?clean(data.system.comfyui_version).slice(0,40):null};
  }catch{return{reachable:false,httpStatus:null,looksComfy:false,version:null}}
}

export async function buildRunPodComfyUIEvidence({runpodToken,fetchImpl=fetch}={}){
  if(!runpodToken)return{checks:[]};
  const pods=await runpodGet(runpodToken,'pods',fetchImpl);
  if(!pods.ok)return{checks:[{id:'runpod.inventory',label:'RunPod inventory',status:pods.status===401||pods.status===403?'FAIL':'WARN',detail:`RunPod Pod inventory could not be read${pods.status?` (HTTP ${pods.status})`:''}.`,evidence:{source:'weaverelay-runpod-comfyui',httpStatus:pods.status||null,resourceBodiesRetained:false,environmentValuesRetained:false}}]};
  const list=Array.isArray(pods.data)?pods.data:[];
  const running=list.filter(p=>String(p?.desiredStatus||'').toUpperCase()==='RUNNING').length;
  const candidates=list.map(candidatePod).filter(Boolean).slice(0,5);
  const checks=[{id:'runpod.inventory',label:'RunPod compute inventory',status:'PASS',detail:`RunPod returned ${list.length} Pod${list.length===1?'':'s'}; ${running} currently running.`,evidence:{source:'weaverelay-runpod-comfyui',podCount:list.length,runningPodCount:running,resourceBodiesRetained:false,environmentValuesRetained:false}}];
  if(!candidates.length){checks.push({id:'map.runpod-comfyui',label:'RunPod → ComfyUI',status:'WARN',detail:'RunPod is connected, but no currently running Pod can be safely identified as a ComfyUI runtime from non-secret Pod metadata. No GPU workload was started merely to test it.',evidence:{source:'weaverelay-runpod-comfyui',candidateComfyPodCount:0,computeStartedForTest:false,responseBodiesRetained:false}});return{checks}}
  const probes=[];for(const p of candidates)probes.push(await comfyProbe(p,fetchImpl));
  const verified=probes.filter(x=>x.looksComfy);
  if(verified.length===1){checks.push({id:'map.runpod-comfyui',label:'RunPod → ComfyUI',status:'PASS',detail:'A currently running RunPod Pod answered ComfyUI’s read-only system-stats route with the expected structured shape.',evidence:{source:'weaverelay-runpod-comfyui',candidateComfyPodCount:candidates.length,verifiedComfyRuntimeCount:1,httpStatus:verified[0].httpStatus,comfyuiVersion:verified[0].version||null,computeStartedForTest:false,responseBodiesRetained:false,systemArgvRetained:false}})}
  else if(verified.length>1)checks.push({id:'map.runpod-comfyui',label:'RunPod → ComfyUI',status:'WARN',detail:'Multiple running RunPod Pods answered as ComfyUI. WeaveRelay will not guess which runtime belongs to this application.',evidence:{source:'weaverelay-runpod-comfyui',candidateComfyPodCount:candidates.length,verifiedComfyRuntimeCount:verified.length,computeStartedForTest:false,responseBodiesRetained:false}});
  else checks.push({id:'map.runpod-comfyui',label:'RunPod → ComfyUI',status:'FAIL',detail:'RunPod has a running Pod that looks configured for ComfyUI, but its read-only ComfyUI system-stats route did not verify.',evidence:{source:'weaverelay-runpod-comfyui',candidateComfyPodCount:candidates.length,verifiedComfyRuntimeCount:0,httpStatuses:probes.map(x=>x.httpStatus).filter(x=>x!=null),computeStartedForTest:false,responseBodiesRetained:false}});
  return{checks};
}
