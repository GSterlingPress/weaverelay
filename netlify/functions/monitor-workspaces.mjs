import { getStore } from '@netlify/blobs';
import { Resend } from 'resend';
import { readConnection,readSecret } from './_workspace-store.mjs';
import { decryptSecret } from './_vault.mjs';
import { probeCredential,checkForProvider } from './_provider-probes.mjs';
import { diagnoseSnapshot } from './_diagnose.mjs';
import { probePublicSite,advanceMonitorState,normalizeMonitoring,buildOutageEmail,buildRecoveryEmail } from './_monitoring.mjs';

const control=()=>getStore({name:'weaverelay-control-plane',consistency:'strong'});
const users=()=>getStore({name:'weaverelay-users',consistency:'strong'});
const monitorStore=()=>getStore({name:'weaverelay-monitoring',consistency:'strong'});
const PROVIDER_IDS=['github','netlify','railway','supabase','stripe','runpod'];
const checkId={github:'github.live',netlify:'netlify.account',railway:'railway.runtime',supabase:'supabase.live',stripe:'stripe.live',runpod:'runpod.live'};

async function listMonitoredWorkspaces(limit=25){
  const {blobs=[]}=await control().list({prefix:'workspace/'});
  const result=[];
  for(const entry of blobs.slice(0,limit*4)){
    const workspace=await control().get(entry.key,{type:'json',consistency:'strong'}).catch(()=>null);
    if(workspace?.id&&normalizeMonitoring(workspace.monitoring).enabled&&workspace.siteOrigin)result.push(workspace);
    if(result.length>=limit)break;
  }
  return result;
}

async function ownerEmail(ownerId){
  if(!ownerId)return null;
  const user=await users().get(`user/${ownerId}.json`,{type:'json',consistency:'strong'}).catch(()=>null);
  return user?.email||null;
}

async function providerChecks(workspace){
  const checks=[];
  for(const provider of PROVIDER_IDS){
    const connection=await readConnection(workspace.id,provider).catch(()=>null);
    if(!connection?.id||connection.status==='revoked')continue;
    try{
      const secret=decryptSecret(await readSecret(connection.id));
      if(!secret?.accessToken)continue;
      if(provider==='github'){
        const response=await fetch('https://api.github.com/user',{headers:{authorization:`Bearer ${secret.accessToken}`,accept:'application/vnd.github+json','user-agent':'weaverelay-monitor'}});
        await response.text();
        checks.push({id:'github.live',label:'GitHub',status:response.ok?'PASS':'FAIL',detail:response.ok?'GitHub answered a live read-only account probe.':`GitHub returned HTTP ${response.status}.`,evidence:{source:'weaverelay-monitor',...(response.ok?{}:{httpStatus:response.status})}});
      }else{
        const probe=await probeCredential(provider,secret.accessToken);
        checks.push(checkForProvider(provider,probe));
      }
    }catch{
      checks.push({id:checkId[provider],label:provider[0].toUpperCase()+provider.slice(1),status:'WARN',detail:`The monitor could not complete the read-only ${provider} probe.`,evidence:{source:'weaverelay-monitor'}});
    }
  }
  return checks;
}

async function lightweightDiagnosis(workspace,observation){
  const checks=[{id:'app.public',label:'Public app',status:observation.status==='healthy'?'PASS':observation.status==='broken'?'FAIL':'WARN',detail:observation.detail,evidence:{source:'weaverelay-monitor',httpStatus:observation.httpStatus}}];
  checks.push(...await providerChecks(workspace));
  return diagnoseSnapshot({product:workspace.name,generatedAt:new Date().toISOString(),mode:'read-only',topology:workspace.stackMap||{},checks});
}

async function sendEmail(to,message){
  if(!to||!process.env.RESEND_API_KEY)return false;
  const resend=new Resend(process.env.RESEND_API_KEY);
  const {error}=await resend.emails.send({from:process.env.WEAVERELAY_FROM_EMAIL||'WeaveRelay <hello@weaverelay.com>',to,subject:message.subject,text:message.text,html:message.html});
  if(error){console.error('WeaveRelay monitor email failed',error);return false}
  return true;
}

async function processWorkspace(workspace){
  const monitoring=normalizeMonitoring(workspace.monitoring);
  const observation=await probePublicSite(workspace.siteOrigin);
  const previous=await monitorStore().get(`state/${workspace.id}.json`,{type:'json',consistency:'strong'}).catch(()=>null)||{};
  let diagnosis=null;
  if(observation.status!=='healthy')diagnosis=await lightweightDiagnosis(workspace,observation).catch(()=>null);
  let next=advanceMonitorState(previous,observation,monitoring);
  const email=await ownerEmail(workspace.ownerId);
  if(next.shouldAlertDown){
    const sent=await sendEmail(email,buildOutageEmail({workspace,observation,diagnosis,checkedAt:next.lastCheckedAt}));
    if(!sent)next={...next,alertedAt:null,shouldAlertDown:false,alertDeliveryFailedAt:new Date().toISOString()};
  }else if(next.shouldAlertRecovery){
    const sent=await sendEmail(email,buildRecoveryEmail({workspace,observation,checkedAt:next.lastCheckedAt}));
    if(!sent)next={...next,shouldAlertRecovery:false,recoveryAlertDeliveryFailedAt:new Date().toISOString()};
  }
  next={...next,workspaceId:workspace.id,lastDiagnosisHeadline:diagnosis?.headline||null,lastDiagnosisStatus:diagnosis?.status||null,automaticRepairAttempted:false,automaticRepairReason:monitoring.autoRepairMode==='preapproved-only'?'No pre-approved repair execution contract is implemented in Monitor V1.':'Automatic repair is disabled for this workspace.'};
  delete next.shouldAlertDown;delete next.shouldAlertRecovery;
  await monitorStore().setJSON(`state/${workspace.id}.json`,next);
  return{workspaceId:workspace.id,status:next.status,alerted:Boolean(next.alertedAt)};
}

export default async()=>{
  const workspaces=await listMonitoredWorkspaces(Number(process.env.WEAVERELAY_MONITOR_BATCH_SIZE)||25);
  const results=[];
  for(const workspace of workspaces){
    try{results.push(await processWorkspace(workspace))}catch(error){console.error('WeaveRelay monitor workspace failed',workspace?.id,error?.message||error)}
  }
  return new Response(JSON.stringify({ok:true,checked:results.length}),{status:200,headers:{'content-type':'application/json'}});
};

export const config={schedule:'*/5 * * * *'};
