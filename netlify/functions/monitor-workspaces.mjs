import { getStore } from '@netlify/blobs';
import { Resend } from 'resend';
import { readConnection,readSecret } from './_workspace-store.mjs';
import { decryptSecret } from './_vault.mjs';
import { LIVE_PROVIDER_IDS,probeCredential,checkForProvider } from './_provider-probes.mjs';
import { diagnoseSnapshot,sanitizeSnapshot } from './_diagnose.mjs';
import { augmentDiagnosis } from './_diagnosis-expansion.mjs';
import { buildCrossSystemEvidence } from './_cross-system.mjs';
import { buildEnvironmentDeploymentEvidence } from './_environment-deployment.mjs';
import { buildRuntimePaymentsEvidence } from './_runtime-payments.mjs';
import { buildRunPodComfyUIEvidence } from './_runpod-comfyui-proof.mjs';
import { buildRunPodAppRelationshipEvidence } from './_runpod-app-relationship.mjs';
import { probePublicSite,advanceMonitorState,normalizeMonitoring,isMonitorDue,buildOutageEmail,buildRecoveryEmail } from './_monitoring.mjs';

const control=()=>getStore({name:'weaverelay-control-plane',consistency:'strong'});
const users=()=>getStore({name:'weaverelay-users',consistency:'strong'});
const monitorStore=()=>getStore({name:'weaverelay-monitoring',consistency:'strong'});
const checkId={github:'github.live',netlify:'netlify.account',vercel:'vercel.live',render:'render.live',cloudflare:'cloudflare.live',railway:'railway.runtime',supabase:'supabase.live',neon:'neon.live',stripe:'stripe.live',resend:'resend.live',runpod:'runpod.live'};
const upsert=(checks,check)=>{if(!check?.id)return;const i=checks.findIndex(x=>x.id===check.id);if(i>=0)checks[i]=check;else checks.push(check)};

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

async function providerContext(workspace){
  const checks=[],secrets={};
  for(const provider of LIVE_PROVIDER_IDS){
    const connection=await readConnection(workspace.id,provider).catch(()=>null);
    if(!connection?.id||connection.status==='revoked')continue;
    try{
      const secret=decryptSecret(await readSecret(connection.id));
      if(!secret?.accessToken)continue;
      secrets[provider]=secret.accessToken;
      if(provider==='github'){
        const response=await fetch('https://api.github.com/user',{headers:{authorization:`Bearer ${secret.accessToken}`,accept:'application/vnd.github+json','user-agent':'weaverelay-monitor'}});
        await response.text();
        checks.push({id:'github.live',label:'GitHub',status:response.ok?'PASS':'FAIL',detail:response.ok?'GitHub answered a live read-only account probe.':`GitHub returned HTTP ${response.status}.`,evidence:{source:'weaverelay-monitor',...(response.ok?{}:{httpStatus:response.status})}});
      }else checks.push(checkForProvider(provider,await probeCredential(provider,secret.accessToken)));
    }catch{
      checks.push({id:checkId[provider]||`${provider}.live`,label:provider[0].toUpperCase()+provider.slice(1),status:'WARN',detail:`The monitor could not complete the read-only ${provider} probe.`,evidence:{source:'weaverelay-monitor'}});
    }
  }
  return{checks,secrets};
}

async function deepDiagnosis(workspace,observation){
  const checks=[{id:'app.public',label:'Public app',status:observation.status==='healthy'?'PASS':observation.status==='broken'?'FAIL':'WARN',detail:observation.detail,evidence:{source:'weaverelay-monitor',httpStatus:observation.httpStatus}}];
  const context=await providerContext(workspace);
  for(const check of context.checks)upsert(checks,check);
  let topology=workspace.stackMap||{};
  try{const cross=await buildCrossSystemEvidence({workspace,secrets:context.secrets});for(const check of cross.checks||[])upsert(checks,check);if(cross.map)topology=cross.map}catch{upsert(checks,{id:'map.cross-system',label:'Cross-system map',status:'WARN',detail:'The outage monitor could not complete the full cross-system map during this incident.',evidence:{source:'weaverelay-monitor-deep'}})}
  try{const env=await buildEnvironmentDeploymentEvidence({workspace,secrets:context.secrets});for(const check of env.checks||[])upsert(checks,check)}catch{upsert(checks,{id:'env.deployment-truth',label:'Environment / deployment truth',status:'WARN',detail:'The outage monitor could not complete environment/deployment evidence for this incident.',evidence:{source:'weaverelay-monitor-deep'}})}
  try{const runtime=await buildRuntimePaymentsEvidence({workspace,secrets:context.secrets});for(const check of runtime.checks||[])upsert(checks,check)}catch{upsert(checks,{id:'runtime.payments-truth',label:'Runtime / payment boundary',status:'WARN',detail:'The outage monitor could not complete runtime/payment evidence for this incident.',evidence:{source:'weaverelay-monitor-deep'}})}
  if(context.secrets.runpod){
    try{const runpod=await buildRunPodComfyUIEvidence({runpodToken:context.secrets.runpod});for(const check of runpod.checks||[])upsert(checks,check);const relationship=await buildRunPodAppRelationshipEvidence({workspace,runpodInventory:runpod.inventory});for(const check of relationship.checks||[])upsert(checks,check)}catch{upsert(checks,{id:'map.runpod-comfyui',label:'RunPod → ComfyUI',status:'WARN',detail:'RunPod is connected, but the monitor could not complete the read-only runtime relationship checks.',evidence:{source:'weaverelay-monitor-deep',computeStartedForTest:false}})}
  }
  const snapshot=sanitizeSnapshot({product:workspace.name,generatedAt:new Date().toISOString(),mode:'read-only',topology,checks});
  return augmentDiagnosis(diagnoseSnapshot(snapshot),snapshot);
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
  const previous=await monitorStore().get(`state/${workspace.id}.json`,{type:'json',consistency:'strong'}).catch(()=>null)||{};
  if(!isMonitorDue(previous,monitoring))return{workspaceId:workspace.id,status:previous.status||'unknown',skipped:'interval'};
  const observation=await probePublicSite(workspace.siteOrigin);
  let diagnosis=null;
  if(observation.status!=='healthy')diagnosis=await deepDiagnosis(workspace,observation).catch(()=>null);
  let next=advanceMonitorState(previous,observation,monitoring);
  const email=await ownerEmail(workspace.ownerId);
  if(next.shouldAlertDown){
    const sent=await sendEmail(email,buildOutageEmail({workspace,observation,diagnosis,checkedAt:next.lastCheckedAt}));
    if(!sent)next={...next,alertedAt:null,shouldAlertDown:false,alertDeliveryFailedAt:new Date().toISOString()};
  }else if(next.shouldAlertRecovery){
    const sent=await sendEmail(email,buildRecoveryEmail({workspace,observation,checkedAt:next.lastCheckedAt}));
    if(!sent)next={...next,status:'broken',incidentId:previous.incidentId||next.incidentId,alertedAt:previous.alertedAt||null,recoveredAt:null,shouldAlertRecovery:false,recoveryAlertDeliveryFailedAt:new Date().toISOString()};
  }
  next={...next,workspaceId:workspace.id,lastDiagnosisHeadline:diagnosis?.headline||null,lastDiagnosisStatus:diagnosis?.status||null,lastFindingId:diagnosis?.findings?.[0]?.id||null,lastFindingSeverity:diagnosis?.findings?.[0]?.severity||null,diagnosticFindingCount:diagnosis?.findings?.length||0,automaticRepairAttempted:false,automaticRepairReason:monitoring.autoRepairMode==='preapproved-only'?'Pre-approved repair execution is still gated until the repair-policy contract passes end-to-end validation.':'Automatic repair is disabled for this workspace.'};
  delete next.shouldAlertDown;delete next.shouldAlertRecovery;
  await monitorStore().setJSON(`state/${workspace.id}.json`,next);
  return{workspaceId:workspace.id,status:next.status,alerted:Boolean(next.alertedAt),diagnosis:next.lastDiagnosisHeadline||null};
}

export default async()=>{
  const workspaces=await listMonitoredWorkspaces(Number(process.env.WEAVERELAY_MONITOR_BATCH_SIZE)||25);
  const results=[];
  for(const workspace of workspaces){
    try{results.push(await processWorkspace(workspace))}catch(error){console.error('WeaveRelay monitor workspace failed',workspace?.id,error?.message||error)}
  }
  return new Response(JSON.stringify({ok:true,checked:results.filter(x=>!x.skipped).length,skipped:results.filter(x=>x.skipped).length}),{status:200,headers:{'content-type':'application/json'}});
};

export const config={schedule:'*/5 * * * *'};
