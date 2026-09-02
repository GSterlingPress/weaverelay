import{discoverSelectedComfyWorkflow}from'./_github-comfy-workflow-discovery.mjs';
import{extractComfyWorkflowRequirements,compareComfyWorkflowRequirements}from'./_comfyui-workflow-proof.mjs';

const clean=v=>String(v??'').trim();
const uniq=a=>[...new Set(a.filter(Boolean))];
const UA='weaverelay-runpod-app-relationship';
const timeout=ms=>AbortSignal.timeout?AbortSignal.timeout(ms):undefined;
const podProxy=/\b([a-z0-9-]+)-(\d+)\.proxy\.runpod\.net\b/gi;
const serverless=/\bapi\.runpod\.ai\/v2\/([a-z0-9-]+)\b/gi;

function refs(text=''){
  const pods=[],endpoints=[];let m;
  while((m=podProxy.exec(text)))pods.push({id:m[1],port:m[2]});
  while((m=serverless.exec(text)))endpoints.push(m[1]);
  return{pods:uniq(pods.map(x=>`${x.id}:${x.port}`)).map(x=>{const [id,port]=x.split(':');return{id,port}}),endpoints:uniq(endpoints)};
}
async function text(url,fetchImpl){try{const r=await fetchImpl(url,{headers:{'user-agent':UA,accept:'text/html,application/javascript,*/*'},redirect:'follow',signal:timeout(7000)});return r.ok?(await r.text()).slice(0,450000):''}catch{return''}}
async function appRefs(origin,fetchImpl){
  if(!origin)return{pods:[],endpoints:[]};
  const home=await text(origin,fetchImpl),chunks=[home];const re=/<script\b[^>]*\bsrc=["']([^"']+)["']/gi;let m,n=0;
  while((m=re.exec(home))&&n<5){try{chunks.push(await text(new URL(m[1],origin).href,fetchImpl));n++}catch{}}
  return refs(chunks.join('\n'));
}
async function comfyDetails(pod,fetchImpl){
  const base=`https://${encodeURIComponent(pod.id)}-${pod.port}.proxy.runpod.net`;
  try{
    const [stats,objects]=await Promise.all([
      fetchImpl(`${base}/system_stats`,{headers:{'user-agent':UA,accept:'application/json'},signal:timeout(6000)}),
      fetchImpl(`${base}/object_info`,{headers:{'user-agent':UA,accept:'application/json'},signal:timeout(8000)})
    ]);
    const s=await stats.json().catch(()=>null),o=await objects.json().catch(()=>null);const comfy=Boolean(stats.ok&&s?.system&&Array.isArray(s?.devices));const objectInfo=objects.ok&&o&&typeof o==='object'?o:{};const nodeNames=Object.keys(objectInfo);
    return{comfy,objectInfo,nodeCount:nodeNames.length,hasCheckpointLoader:nodeNames.some(x=>/checkpointloader/i.test(x)),hasKSampler:nodeNames.some(x=>/^ksampler/i.test(x)),hasVace:nodeNames.some(x=>/vace/i.test(x)),httpStatus:stats.status,objectInfoStatus:objects.status};
  }catch{return{comfy:false,objectInfo:{},nodeCount:0,hasCheckpointLoader:false,hasKSampler:false,hasVace:false,httpStatus:null,objectInfoStatus:null}}
}

export async function buildRunPodAppRelationshipEvidence({workspace,runpodInventory={},fetchImpl=fetch,workflowDiscovery=null}={}){
  const checks=[];const app=await appRefs(workspace?.siteOrigin,fetchImpl);const pods=Array.isArray(runpodInventory.pods)?runpodInventory.pods:[],endpoints=Array.isArray(runpodInventory.endpoints)?runpodInventory.endpoints:[];const podIds=new Set(pods.map(p=>clean(p.id))),endpointIds=new Set(endpoints.map(e=>clean(e.id)));const matchedPods=app.pods.filter(p=>podIds.has(p.id)),matchedEndpoints=app.endpoints.filter(id=>endpointIds.has(id));
  if(app.pods.length||app.endpoints.length){
    const badPods=app.pods.filter(p=>!podIds.has(p.id)),badEndpoints=app.endpoints.filter(id=>!endpointIds.has(id));const bad=badPods.length+badEndpoints.length;
    checks.push({id:'map.app-runpod',label:'Application → RunPod',status:bad?'FAIL':(matchedPods.length+matchedEndpoints.length?'PASS':'WARN'),detail:bad?'The deployed application references a RunPod Pod or Serverless endpoint that is not present in the connected RunPod account.':`The deployed application references ${matchedPods.length+matchedEndpoints.length} RunPod target${matchedPods.length+matchedEndpoints.length===1?'':'s'} present in the connected account.`,evidence:{source:'weaverelay-runpod-app-relationship',detectedPodTargetCount:app.pods.length,detectedServerlessTargetCount:app.endpoints.length,matchedPodTargetCount:matchedPods.length,matchedServerlessTargetCount:matchedEndpoints.length,resourceIdsRetained:false,responseBodiesRetained:false}});
  }else checks.push({id:'map.app-runpod',label:'Application → RunPod',status:'WARN',detail:'RunPod is connected, but the public application does not expose enough read-only evidence to prove which Pod or Serverless endpoint it uses.',evidence:{source:'weaverelay-runpod-app-relationship',detectedPodTargetCount:0,detectedServerlessTargetCount:0,responseBodiesRetained:false}});

  if(matchedPods.length===1){
    const proof=await comfyDetails(matchedPods[0],fetchImpl);
    checks.push({id:'map.app-runpod-comfyui',label:'Application → RunPod → ComfyUI',status:proof.comfy?'PASS':'FAIL',detail:proof.comfy?'The application’s RunPod target answers as ComfyUI, proving the application → RunPod → ComfyUI relationship.':'The application points to a RunPod Pod in the connected account, but that exact target does not verify as ComfyUI.',evidence:{source:'weaverelay-runpod-app-relationship',relationshipTargetCount:1,httpStatus:proof.httpStatus,objectInfoHttpStatus:proof.objectInfoStatus,responseBodiesRetained:false,resourceIdsRetained:false}});
    if(proof.comfy){
      checks.push({id:'comfyui.dependencies',label:'ComfyUI model / node capability',status:proof.nodeCount&&proof.hasCheckpointLoader&&proof.hasKSampler?'PASS':'WARN',detail:proof.nodeCount?`ComfyUI exposed ${proof.nodeCount} node types. Core checkpoint and sampler capabilities ${proof.hasCheckpointLoader&&proof.hasKSampler?'are present':'could not both be proven'}${proof.hasVace?'; VACE-related nodes are also present.':'.'}`:'ComfyUI is reachable, but its node inventory could not be read, so workflow dependencies are not yet proven.',evidence:{source:'weaverelay-runpod-app-relationship',nodeTypeCount:proof.nodeCount,checkpointLoaderPresent:proof.hasCheckpointLoader,kSamplerPresent:proof.hasKSampler,vaceNodePresent:proof.hasVace,nodeNamesRetained:false,modelNamesRetained:false,responseBodiesRetained:false}});
      const selected=workflowDiscovery||await discoverSelectedComfyWorkflow({workspace,fetchImpl});
      checks.push({id:'comfyui.workflow-selection',label:'GitHub → selected ComfyUI workflow',status:selected.status,detail:selected.detail,evidence:{...(selected.evidence||{}),workflowBodyRetained:false}});
      if(selected.status==='PASS'&&selected.workflow){
        const requirements=extractComfyWorkflowRequirements(selected.workflow);const comparison=compareComfyWorkflowRequirements(requirements,proof.objectInfo);
        checks.push({id:'comfyui.workflow-compatibility',label:'Selected workflow → live ComfyUI dependencies',status:comparison.status,detail:comparison.detail,evidence:{...(comparison.evidence||{}),workflowBodyRetained:false,nodeInventoryRetained:false,modelInventoryRetained:false}});
      }
    }
  }else if(matchedPods.length>1)checks.push({id:'map.app-runpod-comfyui',label:'Application → RunPod → ComfyUI',status:'WARN',detail:'The application references multiple RunPod Pods in the connected account. WeaveRelay will not guess which one is the intended ComfyUI runtime.',evidence:{source:'weaverelay-runpod-app-relationship',relationshipTargetCount:matchedPods.length,resourceIdsRetained:false}});
  return{checks};
}
