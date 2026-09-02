const UA='weaverelay-railway-redeploy-repair';
const clean=v=>String(v??'').trim();
const timeout=ms=>AbortSignal.timeout?AbortSignal.timeout(ms):undefined;

async function graphql(token,query,variables={},fetchImpl=fetch){
  const r=await fetchImpl('https://backboard.railway.com/graphql/v2',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json','user-agent':UA},body:JSON.stringify({query,variables}),signal:timeout(10000)});
  const body=await r.json().catch(()=>null);
  return{ok:r.ok&&!body?.errors,status:r.status,data:body?.data||null,errors:body?.errors||null};
}

async function recentDeployments(token,target,fetchImpl=fetch){
  const input={projectId:target.projectId,serviceId:target.serviceId,environmentId:target.environmentId};
  const q=await graphql(token,'query deployments($input: DeploymentListInput!) { deployments(input: $input, first: 5) { edges { node { id status createdAt } } } }',{input},fetchImpl);
  if(!q.ok)return[];
  return(q.data?.deployments?.edges||[]).map(e=>e?.node).filter(Boolean).map(d=>({id:clean(d.id),status:clean(d.status).toUpperCase(),createdAt:clean(d.createdAt)})).filter(d=>d.id);
}

function targetFromRepair(repair={}){
  const target={projectId:clean(repair.projectId),environmentId:clean(repair.environmentId),serviceId:clean(repair.serviceId),publicDomain:clean(repair.publicDomain).toLowerCase()};
  return target.projectId&&target.environmentId&&target.serviceId?target:null;
}

export function inspectRailwayRedeployNeed(workspace={}){
  const repair=workspace?.lastRepair||{};
  if(repair.type!=='railway-supabase-url'||repair.configurationVerified!==true)return{eligible:false,reason:'no-verified-configuration-repair'};
  const target=targetFromRepair(repair);if(!target)return{eligible:false,reason:'repair-target-unavailable'};
  if(repair.runtimeVerified===true)return{eligible:false,reason:'runtime-already-verified',runtimeVerified:true,target};
  if(repair.redeployRequestedAt)return{eligible:false,reason:'redeploy-already-requested',redeployPending:true,target};
  return{eligible:true,reason:'configuration-change-requires-runtime-refresh',target};
}

export async function triggerRailwayRedeploy({workspace,railwayToken,fetchImpl=fetch}={}){
  const proposal=inspectRailwayRedeployNeed(workspace);
  if(!proposal.eligible)throw new Error(`WeaveRelay cannot safely redeploy this Railway service: ${proposal.reason}.`);
  const before=await recentDeployments(railwayToken,proposal.target,fetchImpl);
  const previousDeploymentId=before[0]?.id||null;
  const redeploy=await graphql(railwayToken,'mutation serviceInstanceRedeploy($environmentId: String!, $serviceId: String!) { serviceInstanceRedeploy(environmentId: $environmentId, serviceId: $serviceId) }',{environmentId:proposal.target.environmentId,serviceId:proposal.target.serviceId},fetchImpl);
  if(!redeploy.ok||redeploy.data?.serviceInstanceRedeploy!==true)throw new Error('Railway did not accept the approved redeploy request.');
  const after=await recentDeployments(railwayToken,proposal.target,fetchImpl).catch(()=>[]);
  const newDeployment=after.find(d=>d.id!==previousDeploymentId)||null;
  return{triggered:true,target:proposal.target,previousDeploymentId,newDeploymentId:newDeployment?.id||null,newDeploymentStatus:newDeployment?.status||null};
}

async function endpointReachable(domain,fetchImpl=fetch){
  if(!domain)return{reachable:false,httpStatus:null};
  try{
    const r=await fetchImpl(`https://${domain}/`,{method:'GET',headers:{'user-agent':UA,accept:'*/*'},redirect:'manual',signal:timeout(8000)});
    return{reachable:true,httpStatus:r.status};
  }catch{return{reachable:false,httpStatus:null}}
}

export async function verifyRailwayRepairRuntime({workspace,railwayToken,fetchImpl=fetch}={}){
  const repair=workspace?.lastRepair||{};
  if(repair.type!=='railway-supabase-url'||repair.configurationVerified!==true)return null;
  const target=targetFromRepair(repair);if(!target)return{status:'WARN',detail:'The configuration repair is verified, but its Railway service target is unavailable for runtime verification.',evidence:{redeployRequired:false,runtimeVerified:false}};
  if(repair.runtimeVerified===true)return{status:'PASS',detail:'The repaired Railway runtime was previously verified after redeploy.',evidence:{redeployRequired:false,runtimeVerified:true}};
  if(!repair.redeployRequestedAt)return{status:'WARN',detail:'The Railway configuration change is saved and verified, but the running service has not been refreshed yet. A redeploy is required before WeaveRelay can verify the live backend.',evidence:{redeployRequired:true,runtimeVerified:false,serviceName:repair.serviceName||null,environmentName:repair.environmentName||null}};

  const deployments=await recentDeployments(railwayToken,target,fetchImpl);
  const deployment=repair.redeploymentId?deployments.find(d=>d.id===repair.redeploymentId):deployments.find(d=>d.id!==repair.previousDeploymentId)||deployments[0];
  if(!deployment)return{status:'WARN',detail:'Railway accepted the redeploy request, but the new deployment is not visible yet.',evidence:{redeployRequired:false,redeployPending:true,runtimeVerified:false}};
  const pending=new Set(['BUILDING','DEPLOYING','WAITING','QUEUED']);
  if(pending.has(deployment.status))return{status:'WARN',detail:`Railway redeploy is ${deployment.status.toLowerCase()}. WeaveRelay will verify the live backend after it finishes.`,evidence:{redeployRequired:false,redeployPending:true,deploymentStatus:deployment.status,runtimeVerified:false}};
  if(['FAILED','CRASHED','REMOVED','SKIPPED'].includes(deployment.status))return{status:'FAIL',detail:`The Railway redeploy ended in ${deployment.status.toLowerCase()}, so the repaired backend is not verified.`,evidence:{redeployRequired:false,redeployPending:false,deploymentStatus:deployment.status,runtimeVerified:false}};
  if(deployment.status!=='SUCCESS')return{status:'WARN',detail:`Railway reports deployment status ${deployment.status||'unknown'}; runtime verification is not complete.`,evidence:{redeployRequired:false,deploymentStatus:deployment.status||null,runtimeVerified:false}};
  const live=await endpointReachable(target.publicDomain,fetchImpl);
  if(!live.reachable)return{status:'FAIL',detail:'Railway reports the repaired deployment as successful, but its proven public backend domain did not answer a live request.',evidence:{redeployRequired:false,deploymentStatus:'SUCCESS',endpointReachable:false,runtimeVerified:false}};
  return{status:'PASS',detail:`The repaired Railway deployment is running successfully and its proven backend domain answered HTTP ${live.httpStatus}.`,evidence:{redeployRequired:false,deploymentStatus:'SUCCESS',endpointReachable:true,httpStatus:live.httpStatus,runtimeVerified:true}};
}
