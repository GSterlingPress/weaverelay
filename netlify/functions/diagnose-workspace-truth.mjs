import expandedDiagnose from'./diagnose-workspace-expanded.mjs';
import{requireUser}from'./_auth.mjs';
import{requireWorkspace,writeWorkspace}from'./_workspace-store.mjs';
import{diagnoseSnapshot,sanitizeSnapshot}from'./_diagnose.mjs';
import{augmentDiagnosis}from'./_diagnosis-expansion.mjs';
import{augmentWebsiteDiagnosis}from'./_website-diagnostics.mjs';
import{augmentSyntheticDiagnosis}from'./_synthetic-diagnosis.mjs';
import{applyClosestProviderFixLinks}from'./_provider-fix-links.mjs';
import{reconcileEvidence}from'./_evidence-truth.mjs';
import{prioritizeDiagnosis}from'./_diagnosis-priority.mjs';
import{explainDiagnosis}from'./_evidence-explanation.mjs';
import{json,safeError}from'./_http.mjs';

const SYNC_SOURCES=new Set(['weaverelay-repair-verification','weaverelay-netlify-redeploy-verification','weaverelay-backend-dependency-proof','weaverelay-cross-system','weaverelay-runtime-payments','weaverelay-environment-deployment','weaverelay-live-oauth','weaverelay-live-expanded','weaverelay-live','weaverelay-website-diagnostics','weaverelay-stripe-handler-diagnosis']);
function stampCurrent(check,now){const e=check?.evidence||{};if(e.observedAt||e.checkedAt||e.generatedAt||e.timestamp||e.at)return check;if(!SYNC_SOURCES.has(String(e.source||'')))return check;return{...check,evidence:{...e,observedAt:now}}}
function addTruthFinding(diagnosis,snapshot){const summary=snapshot.truthSummary;if(!summary?.unresolvedContradictionCount)return diagnosis;const finding={id:'evidence-conflict-unresolved',severity:'high',title:'Two strong sources disagree about the current production state',explanation:'WeaveRelay found fresh evidence that conflicts closely enough that it will not choose a destructive or configuration-changing repair from either side yet.',evidence:summary.contradictions.filter(x=>!x.decisive).map(x=>x.claimKey).slice(0,8),actions:['Run diagnosis again to confirm the disagreement. If it persists, open the exact provider resources shown below and resolve the production identity before applying a repair.'],provider:null,repair:{supported:false,approvalRequired:true,label:'VERIFY CONFLICT FIRST'},openProvider:null,actionableNow:true,evidenceFresh:true};diagnosis.findings=[finding,...(diagnosis.findings||[]).filter(f=>f.id!==finding.id)];diagnosis.status='broken';diagnosis.headline=finding.title;return diagnosis}
function restoreStripeHandlerRepair(diagnosis,snapshot){const check=(snapshot.checks||[]).find(c=>c.id==='repair.stripe-handler-failure'),existing=(diagnosis.findings||[]).find(f=>f.id==='stripe-webhook-handler-failing');if(!check||!existing)return diagnosis;const classification=check.evidence?.classification||check.evidence?.handlerFailureClass;if(classification==='signature-configuration-missing'&&!check.evidence?.stale){existing.provider='railway';existing.openProvider={label:'Open Railway',url:'https://railway.com/dashboard'};existing.repair={supported:true,approvalRequired:true,type:'stripe-handler-secret',provider:'railway',label:'ADD WEBHOOK SECRET'};existing.actions=['Add only the missing Stripe webhook-signature configuration to the proven Railway service. A separate redeploy and real Stripe delivery remain required before WeaveRelay can call the chain fixed.']}return diagnosis}
async function restorePriorTruth(userId,workspaceId,before){try{const current=await requireWorkspace(userId,workspaceId);current.lastDiagnosticSnapshot=before.lastDiagnosticSnapshot||null;current.diagnosis=before.diagnosis||null;current.status=before.status||'needs_action';current.updatedAt=new Date().toISOString();await writeWorkspace(current)}catch{}}

export default async request=>{
  if(request.method!=='POST')return json(405,{error:'Method not allowed.'});
  const inspect=request.clone(),execute=request.clone();let user=null,body=null,before=null,expandedCompleted=false;
  try{
    user=await requireUser(inspect);body=await inspect.json();before=await requireWorkspace(user.id,body.workspaceId);const previousSnapshot=before.lastDiagnosticSnapshot||null;
    const response=await expandedDiagnose(execute);if(!response.ok)return response;expandedCompleted=true;
    const result=await response.json(),workspace=await requireWorkspace(user.id,body.workspaceId),now=new Date().toISOString();
    const raw=sanitizeSnapshot({product:workspace.name,generatedAt:now,topology:result.stackMap||workspace.stackMap||{},checks:(result.checks||[]).map(c=>stampCurrent(c,now))});
    const snapshot=reconcileEvidence(raw,{previousSnapshot,now:Date.now()});
    let diagnosis=augmentDiagnosis(diagnoseSnapshot(snapshot),snapshot);
    diagnosis=augmentWebsiteDiagnosis(diagnosis,snapshot);
    diagnosis=augmentSyntheticDiagnosis(diagnosis,snapshot);
    diagnosis=restoreStripeHandlerRepair(diagnosis,snapshot);
    diagnosis=applyClosestProviderFixLinks(diagnosis,snapshot);
    diagnosis=addTruthFinding(diagnosis,snapshot);
    diagnosis=prioritizeDiagnosis(diagnosis,snapshot);
    diagnosis=explainDiagnosis(diagnosis,snapshot);
    workspace.lastDiagnosticSnapshot=snapshot;workspace.diagnosis=diagnosis;workspace.status=diagnosis.status==='healthy'?'ready':'needs_action';workspace.updatedAt=now;await writeWorkspace(workspace);
    return json(200,{ok:true,workspaceId:workspace.id,diagnosis,checks:snapshot.checks,truthSummary:snapshot.truthSummary,stackMap:workspace.stackMap||snapshot.topology});
  }catch(error){if(expandedCompleted&&user&&body&&before)await restorePriorTruth(user.id,body.workspaceId,before);return safeError(error)}
};
