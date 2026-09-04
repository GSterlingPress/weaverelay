import{requireUser}from'./_auth.mjs';
import{requireWorkspace,readConnection}from'./_workspace-store.mjs';
import{scopedStore}from'./_scoped-store.mjs';
import{json,safeError}from'./_http.mjs';

const monitorStore=()=>scopedStore('weaverelay-monitoring');
const clean=v=>String(v??'').trim();

function safeIncident(value){
  if(!value||typeof value!=='object')return null;
  const evidence=value.evidence&&typeof value.evidence==='object'?{
    id:clean(value.evidence.id).slice(0,120)||null,
    label:clean(value.evidence.label).slice(0,160)||null,
    status:clean(value.evidence.status).slice(0,20)||null,
    detail:clean(value.evidence.detail).slice(0,500)||null
  }:null;
  return{
    active:Boolean(value.active),
    kind:clean(value.kind).slice(0,60)||null,
    title:clean(value.title).slice(0,180)||null,
    whatIsHappening:clean(value.whatIsHappening).slice(0,500)||null,
    whereItBreaks:clean(value.whereItBreaks).slice(0,180)||null,
    evidenceId:clean(value.evidenceId).slice(0,120)||null,
    evidence,
    publicSiteHealthy:Boolean(value.publicSiteHealthy),
    automaticRepairAttempted:false,
    startedAt:value.startedAt||null,
    lastObservedAt:value.lastObservedAt||null,
    recoveredAt:value.recoveredAt||null
  };
}

function legacyMonitoringIncident(monitoringState){
  if(!monitoringState)return null;
  const incident=monitoringState.incident||monitoringState.lastRecoveredIncident;
  if(!incident)return null;
  const recovered=!monitoringState.incident&&Boolean(monitoringState.lastRecoveredIncident);
  return{
    status:recovered?'recovered':monitoringState.status||'attention',
    incidentKind:monitoringState.incidentKind||incident.kind||null,
    whereItBreaks:incident.whereItBreaks||null,
    whatsHappening:incident.whatIsHappening||incident.title||null,
    detail:incident.whatIsHappening||incident.title||null,
    evidenceId:incident.evidenceId||incident.evidence?.id||null,
    evidenceLabel:incident.evidence?.label||null,
    publicSiteHealthy:Boolean(incident.publicSiteHealthy),
    startedAt:incident.startedAt||null,
    lastObservedAt:incident.lastObservedAt||monitoringState.lastCheckedAt||null,
    recoveredAt:incident.recoveredAt||monitoringState.recoveredAt||null,
    automaticRepairAttempted:false
  };
}

export default async request=>{
  try{
    const user=await requireUser(request),url=new URL(request.url),workspace=await requireWorkspace(user.id,url.searchParams.get('id'));
    const connections={};
    for(const p of workspace.providers||[]){
      if(!p||typeof p!=='object'||!p.id)continue;
      const c=await readConnection(workspace.id,p.id).catch(()=>null);
      if(c)connections[p.id]={status:c.status,externalAccountName:c.externalAccountName||null,scopes:c.scopes||[],lastCheckedAt:c.lastCheckedAt||null,lastErrorCode:c.lastErrorCode||null};
    }
    let state=null;
    try{state=await monitorStore().get(`state/${workspace.id}.json`,{type:'json',consistency:'strong'});}catch{}
    const monitoringState=state?{
      status:clean(state.status).slice(0,30)||'unknown',
      lastCheckedAt:state.lastCheckedAt||null,
      lastHttpStatus:Number.isFinite(state.lastHttpStatus)?state.lastHttpStatus:null,
      incidentKind:clean(state.incidentKind).slice(0,60)||null,
      incident:safeIncident(state.incidentSummary),
      lastRecoveredIncident:safeIncident(state.lastRecoveredIncident),
      alertedAt:state.alertedAt||null,
      recoveredAt:state.recoveredAt||null,
      automaticRepairAttempted:false
    }:null;
    const monitoringIncident=legacyMonitoringIncident(monitoringState);
    const relayOrigin=url.origin,runtimeObserver={workspaceId:workspace.id,scriptUrl:`${relayOrigin}/wr-runtime-agent.js`,beaconUrl:`${relayOrigin}/api/runtime/beacon`,privacy:{formValues:false,responseBodies:false,headers:false,cookies:false,automaticClicks:false,automaticFormSubmissions:false},journeyAttributes:['data-weaverelay-journey','data-weaverelay-step']};
    return json(200,{ok:true,workspace,connections,monitoringState,monitoringIncident,runtimeObserver});
  }catch(error){return safeError(error)}
};
