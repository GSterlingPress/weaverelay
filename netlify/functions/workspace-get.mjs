import{requireUser}from'./_auth.mjs';
import{requireWorkspace,readConnection}from'./_workspace-store.mjs';
import{PROVIDERS}from'./_provider-catalog.mjs';
import{scopedStore}from'./_scoped-store.mjs';
import{json,safeError}from'./_http.mjs';

const monitorStore=()=>scopedStore('weaverelay-monitoring');
const clean=v=>String(v??'').trim();
const asArray=value=>Array.isArray(value)?value:[];

function normalizeProviderList(value){
  const raw=Array.isArray(value)?value:(value&&typeof value==='object'?Object.entries(value).map(([id,item])=>item&&typeof item==='object'?{id,...item}:id):[]);
  const seen=new Set(),out=[];
  for(const item of raw){
    const id=clean(item&&typeof item==='object'?item.id:item).toLowerCase();
    if(!id||seen.has(id)||!PROVIDERS[id])continue;
    seen.add(id);
    const record=item&&typeof item==='object'?item:{};
    out.push({id,label:clean(record.label)||PROVIDERS[id].label,category:clean(record.category)||PROVIDERS[id].category,authorization:clean(record.authorization)||PROVIDERS[id].authorization,purpose:clean(record.purpose)||PROVIDERS[id].purpose,status:clean(record.status)||'not_connected',detail:clean(record.detail),checkedAt:record.checkedAt||null});
  }
  return out;
}

function normalizeFinding(value){
  if(!value||typeof value!=='object')return null;
  const actions=Array.isArray(value.actions)?value.actions:(value.actions==null?[]:[value.actions]);
  const repair=value.repair&&typeof value.repair==='object'?value.repair:{};
  const openProvider=value.openProvider&&typeof value.openProvider==='object'?value.openProvider:null;
  return{
    ...value,
    title:clean(value.title),
    explanation:clean(value.explanation||value.detail||value.summary),
    provider:clean(value.provider).toLowerCase()||null,
    actions:actions.map(clean).filter(Boolean),
    repair,
    openProvider
  };
}

function normalizeDiagnosis(value){
  if(!value||typeof value!=='object')return null;
  const findings=asArray(value.findings).map(normalizeFinding).filter(Boolean);
  const checks=asArray(value.checks).filter(item=>item&&typeof item==='object');
  return{
    ...value,
    status:clean(value.status)||'attention',
    headline:clean(value.headline||value.title)||'Website diagnosis',
    summary:clean(value.summary||value.detail),
    findings,
    checks
  };
}

function normalizeStackMap(value){
  if(!value||typeof value!=='object')return{nodes:[],flow:[]};
  return{
    ...value,
    nodes:asArray(value.nodes).filter(Boolean),
    flow:asArray(value.flow).map(item=>clean(item&&typeof item==='object'?(item.label||item.name||item.id):item)).filter(Boolean)
  };
}

function normalizeWorkspaceForUi(workspace){
  const safeWorkspace=workspace&&typeof workspace==='object'?workspace:{};
  return{
    ...safeWorkspace,
    id:clean(safeWorkspace.id),
    name:clean(safeWorkspace.name)||'Website',
    siteOrigin:clean(safeWorkspace.siteOrigin||safeWorkspace.origin||safeWorkspace.url),
    status:clean(safeWorkspace.status)||'needs_action',
    providers:normalizeProviderList(safeWorkspace.providers),
    diagnosis:normalizeDiagnosis(safeWorkspace.diagnosis),
    stackMap:normalizeStackMap(safeWorkspace.stackMap)
  };
}

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
    const user=await requireUser(request),url=new URL(request.url),requestedId=clean(url.searchParams.get('id')),storedWorkspace=await requireWorkspace(user.id,requestedId),workspace=normalizeWorkspaceForUi(storedWorkspace);
    if(!workspace.id)workspace.id=requestedId;
    const connections={};
    for(const p of workspace.providers){
      const c=await readConnection(workspace.id,p.id).catch(()=>null);
      if(c&&typeof c==='object')connections[p.id]={status:clean(c.status)||'connected',externalAccountName:clean(c.externalAccountName)||null,scopes:Array.isArray(c.scopes)?c.scopes.map(clean).filter(Boolean):[],lastCheckedAt:c.lastCheckedAt||null,lastErrorCode:clean(c.lastErrorCode)||null};
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
    return json(200,{ok:true,workspace,connections,monitoringState,monitoringIncident,runtimeObserver,uiContractVersion:2});
  }catch(error){return safeError(error)}
};
