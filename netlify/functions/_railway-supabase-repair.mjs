import{scanPublicApp}from'./_cross-system.mjs';

const UA='weaverelay-railway-supabase-repair';
const clean=v=>String(v??'').trim();
const uniq=a=>[...new Set(a.filter(Boolean))];
const timeout=ms=>AbortSignal.timeout?AbortSignal.timeout(ms):undefined;
const hostOf=value=>{try{return new URL(value).hostname.toLowerCase()}catch{return''}};

async function graphql(token,query,variables={},fetchImpl=fetch){
  const r=await fetchImpl('https://backboard.railway.com/graphql/v2',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json','user-agent':UA},body:JSON.stringify({query,variables}),signal:timeout(10000)});
  const body=await r.json().catch(()=>null);
  return{ok:r.ok&&!body?.errors,status:r.status,data:body?.data||null,errors:body?.errors||null};
}
async function supabaseProjects(token,fetchImpl=fetch){
  const r=await fetchImpl('https://api.supabase.com/v1/projects',{headers:{authorization:`Bearer ${token}`,'user-agent':UA,accept:'application/json'},signal:timeout(10000)});
  const body=await r.json().catch(()=>null);
  if(!r.ok||!Array.isArray(body))return[];
  return body.map(p=>({ref:clean(p.id||p.ref).toLowerCase(),name:clean(p.name)||null})).filter(p=>p.ref);
}
function railwayHost(value){return clean(value).toLowerCase().replace(/^https?:\/\//,'').split('/')[0]||null}

async function railwayRecords(token,appHosts,fetchImpl=fetch){
  const list=await graphql(token,'query { projects { edges { node { id name } } } }',{},fetchImpl);
  if(!list.ok)return[];
  const projects=(list.data?.projects?.edges||[]).map(e=>e?.node).filter(Boolean).slice(0,12);
  const matches=[];
  for(const p of projects){
    const q=await graphql(token,'query project($id: String!) { project(id: $id) { id name services { edges { node { id name } } } environments { edges { node { id name } } } } }',{id:p.id},fetchImpl);
    if(!q.ok||!q.data?.project)continue;
    const pr=q.data.project;
    const envs=(pr.environments?.edges||[]).map(e=>e?.node).filter(Boolean).sort((a,b)=>/^(production|prod)$/i.test(b.name)-/^(production|prod)$/i.test(a.name)).slice(0,3);
    const services=(pr.services?.edges||[]).map(e=>e?.node).filter(Boolean).slice(0,12);
    for(const env of envs){
      for(const service of services){
        const vars=await graphql(token,'query variables($projectId: String!, $environmentId: String!, $serviceId: String) { variables(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId) }',{projectId:pr.id,environmentId:env.id,serviceId:service.id},fetchImpl);
        if(!vars.ok||!vars.data?.variables||typeof vars.data.variables!=='object')continue;
        const values=vars.data.variables;
        const domain=railwayHost(values.RAILWAY_PUBLIC_DOMAIN);
        if(domain&&appHosts.includes(domain))matches.push({projectId:pr.id,projectName:pr.name,environmentId:env.id,environmentName:env.name,serviceId:service.id,serviceName:service.name,publicDomain:domain,currentSupabaseUrl:clean(values.SUPABASE_URL)||null});
      }
    }
  }
  return matches;
}

export async function inspectRailwaySupabaseRepair({workspace,railwayToken,supabaseToken,fetchImpl=fetch}={}){
  if(!workspace?.siteOrigin||!railwayToken||!supabaseToken)return{eligible:false,reason:'missing-required-connection'};
  const scan=await scanPublicApp(workspace.siteOrigin,{fetchImpl});
  if(!scan.reachable)return{eligible:false,reason:'app-unreachable'};
  const appRailwayHosts=uniq((scan.hosts||[]).filter(h=>h.endsWith('.up.railway.app')||h.endsWith('.railway.app')));
  const appSupabaseHosts=uniq((scan.hosts||[]).filter(h=>h.endsWith('.supabase.co')));
  if(appRailwayHosts.length!==1)return{eligible:false,reason:'railway-endpoint-not-unique',appRailwayHostCount:appRailwayHosts.length};
  if(appSupabaseHosts.length!==1)return{eligible:false,reason:'supabase-project-not-unique',appSupabaseHostCount:appSupabaseHosts.length};
  const projects=await supabaseProjects(supabaseToken,fetchImpl);
  const desiredHost=appSupabaseHosts[0];
  const desiredRef=desiredHost.split('.')[0].toLowerCase();
  if(!projects.some(p=>p.ref===desiredRef))return{eligible:false,reason:'supabase-project-not-owned'};
  const records=await railwayRecords(railwayToken,appRailwayHosts,fetchImpl);
  if(records.length!==1)return{eligible:false,reason:'railway-service-not-unique',matchedServiceCount:records.length};
  const target=records[0];
  const desiredUrl=`https://${desiredHost}`;
  const currentHost=hostOf(target.currentSupabaseUrl);
  const alreadyCorrect=currentHost===desiredHost;
  return{eligible:!alreadyCorrect,alreadyCorrect,reason:alreadyCorrect?'already-correct':'safe-public-reference-mismatch',desiredRef,target:{projectId:target.projectId,projectName:target.projectName,environmentId:target.environmentId,environmentName:target.environmentName,serviceId:target.serviceId,serviceName:target.serviceName,publicDomain:target.publicDomain},internal:{desiredUrl,currentSupabaseUrl:target.currentSupabaseUrl}};
}

export async function applyRailwaySupabaseRepair({workspace,railwayToken,supabaseToken,fetchImpl=fetch}={}){
  const proposal=await inspectRailwaySupabaseRepair({workspace,railwayToken,supabaseToken,fetchImpl});
  if(proposal.alreadyCorrect)return{changed:false,verified:true,desiredRef:proposal.desiredRef,target:proposal.target,runtimeVerified:false,redeployRequired:false};
  if(!proposal.eligible)throw new Error(`WeaveRelay cannot safely apply this repair: ${proposal.reason}.`);
  const input={projectId:proposal.target.projectId,environmentId:proposal.target.environmentId,serviceId:proposal.target.serviceId,variables:{SUPABASE_URL:proposal.internal.desiredUrl}};
  const write=await graphql(railwayToken,'mutation variableCollectionUpsert($input: VariableCollectionUpsertInput!) { variableCollectionUpsert(input: $input) }',{input},fetchImpl);
  if(!write.ok)throw new Error('Railway did not accept the approved configuration repair.');
  const verify=await graphql(railwayToken,'query variables($projectId: String!, $environmentId: String!, $serviceId: String) { variables(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId) }',{projectId:proposal.target.projectId,environmentId:proposal.target.environmentId,serviceId:proposal.target.serviceId},fetchImpl);
  const verified=Boolean(verify.ok&&hostOf(verify.data?.variables?.SUPABASE_URL)===`${proposal.desiredRef}.supabase.co`);
  if(!verified)throw new Error('Railway accepted the change, but WeaveRelay could not verify the new Supabase reference.');
  return{changed:true,verified:true,desiredRef:proposal.desiredRef,target:proposal.target,runtimeVerified:false,redeployRequired:true};
}
