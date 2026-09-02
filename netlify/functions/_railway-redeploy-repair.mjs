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

function repairContext(workspace={}){
  const root=workspace?.lastRepair||{};
  if(root.type==='railway-supabase-url'&&root.configurationVerified===true)return{kind:'railway-supabase-url',root,state:root};
  if(root.type==='stripe-webhook-host'&&root.handlerRepair?.type==='stripe-handler-secret'&&root.handlerRepair?.configurationVerified===true)return{kind:'stripe-handler-secret',root,state:root.handlerRepair};
  return null;
}
function targetFromContext(ctx){
  const root=ctx?.root||{},state=ctx?.state||{};
  const target={projectId:clean(state.projectId||root.projectId),environmentId:clean(state.environmentId||root.environmentId),serviceId:clean(state.serviceId||root.serviceId),publicDomain:clean(state.publicDomain||root.publicDomain||root.targetHost).toLowerCase()};
  return target.projectId&&target.environmentId&&target.serviceId?target:null;
}

export function inspectRailwayRedeployNeed(workspace={}){
  const ctx=repairContext(workspace);if(!ctx)return{eligible:false,reason:'no-verified-configuration-repair'};
  const target=targetFromContext(ctx);if(!target)return{eligible:false,reason:'repair-target-unavailable'};
  if(ctx.state.runtimeVerified===true)return{eligible:false,reason:'runtime-already-verified',runtimeVerified:true,target,kind:ctx.kind};
  if(ctx.state.redeployRequestedAt)return{eligible:false,reason:'redeploy-already-requested',redeployPending:true,target,kind:ctx.kind};
  return{eligible:true,reason:'configuration-change-requires-runtime-refresh',target,kind:ctx.kind};
}

export async function triggerRailwayRedeploy({workspace,railwayToken,fetchImpl=fetch}={}){
  const proposal=inspectRailwayRedeployNeed(workspace);
  if(!proposal.eligible)throw new Error(`WeaveRelay cannot safely redeploy this Railway service: ${proposal.reason}.`);
  const before=await recentDeployments(railwayToken,proposal.target,fetchImpl),previousDeploymentId=before[0]?.id||null;
  const redeploy=await graphql(railwayToken,'mutation serviceInstanceRedeploy($environmentId: String!, $serviceId: String!) { serviceInstanceRedeploy(environmentId: $environmentId, serviceId: $serviceId) }',{environmentId:proposal.target.environmentId,serviceId:proposal.target.serviceId},fetchImpl);
  if(!redeploy.ok||redeploy.data?.serviceInstanceRedeploy!==true)throw new Error('Railway did not accept the approved redeploy request.');
  const after=await recentDeployments(railwayToken,proposal.target,fetchImpl).catch(()=>[]),newDeployment=after.find(d=>d.id!==previousDeploymentId)||null;
  return{triggered:true,kind:proposal.kind,target:proposal.target,previousDeploymentId,newDeploymentId:newDeployment?.id||null,newDeploymentStatus:newDeployment?.status||null};
}

async function endpointReachable(domain,fetchImpl=fetch){
  if(!domain)return{reachable:false,httpStatus:null};
  try{const r=await fetchImpl(`https://${domain}/`,{method:'GET',headers:{'user-agent':UA,accept:'*/*'},redirect:'manual',signal:timeout(8000)});return{reachable:true,httpStatus:r.status}}catch{return{reachable:false,httpStatus:null}}
}

export async function verifyRailwayRepairRuntime({workspace,railwayToken,fetchImpl=fetch}={}){
  const ctx=repairContext(workspace);if(!ctx)return null;const state=ctx.state,target=targetFromContext(ctx);
  if(!target)return{status:'WARN',detail:'The configuration repair is verified, but its Railway service target is unavailable for runtime verification.',evidence:{repairKind:ctx.kind,redeployRequired:false,runtimeVerified:false}};
  if(state.runtimeVerified===true)return{status:'PASS',detail:'The repaired Railway runtime was previously verified after redeploy.',evidence:{repairKind:ctx.kind,redeployRequired:false,runtimeVerified:true}};
  if(!state.redeployRequestedAt)return{status:'WARN',detail:'The Railway configuration change is saved and verified, but the running service has not been refreshed yet. A redeploy is required before WeaveRelay can verify the live backend.',evidence:{repairKind:ctx.kind,redeployRequired:true,runtimeVerified:false,serviceName:state.serviceName||ctx.root.serviceName||null,environmentName:state.environmentName||ctx.root.environmentName||null}};
  const deployments=await recentDeployments(railwayToken,target,fetchImpl),deployment=state.redeploymentId?deployments.find(d=>d.id===state.redeploymentId):deployments.find(d=>d.id!==state.previousDeploymentId)||deployments[0];
  if(!deployment)return{status:'WARN',detail:'Railway accepted the redeploy request, but the new deployment is not visible yet.',evidence:{repairKind:ctx.kind,redeployRequired:false,redeployPending:true,runtimeVerified:false}};
  const pending=new Set(['BUILDING','DEPLOYING','WAITING','QUEUED']);
  if(pending.has(deployment.status))return{status:'WARN',detail:`Railway redeploy is ${deployment.status.toLowerCase()}. WeaveRelay will verify the live backend after it finishes.`,evidence:{repairKind:ctx.kind,redeployRequired:false,redeployPending:true,deploymentStatus:deployment.status,runtimeVerified:false}};
  if(['FAILED','CRASHED','REMOVED','SKIPPED'].includes(deployment.status))return{status:'FAIL',detail:`The Railway redeploy ended in ${deployment.status.toLowerCase()}, so the repaired backend is not verified.`,evidence:{repairKind:ctx.kind,redeployRequired:false,redeployPending:false,deploymentStatus:deployment.status,runtimeVerified:false}};
  if(deployment.status!=='SUCCESS')return{status:'WARN',detail:`Railway reports deployment status ${deployment.status||'unknown'}; runtime verification is not complete.`,evidence:{repairKind:ctx.kind,redeployRequired:false,deploymentStatus:deployment.status||null,runtimeVerified:false}};
  const live=await endpointReachable(target.publicDomain,fetchImpl);
  if(!live.reachable)return{status:'FAIL',detail:'Railway reports the repaired deployment as successful, but its proven public backend domain did not answer a live request.',evidence:{repairKind:ctx.kind,redeployRequired:false,deploymentStatus:'SUCCESS',endpointReachable:false,runtimeVerified:false}};
  return{status:'PASS',detail:`The repaired Railway deployment is running successfully and its proven backend domain answered HTTP ${live.httpStatus}.`,evidence:{repairKind:ctx.kind,redeployRequired:false,deploymentStatus:'SUCCESS',endpointReachable:true,httpStatus:live.httpStatus,runtimeVerified:true}};
}
