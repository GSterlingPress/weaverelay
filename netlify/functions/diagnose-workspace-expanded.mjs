import baseDiagnose from'./diagnose-workspace.mjs';
import{requireUser}from'./_auth.mjs';
import{requireWorkspace,readConnection,readSecret,writeConnection,writeWorkspace}from'./_workspace-store.mjs';
import{decryptSecret}from'./_vault.mjs';
import{probeCredential,checkForProvider}from'./_provider-probes.mjs';
import{diagnoseSnapshot,sanitizeSnapshot}from'./_diagnose.mjs';
import{augmentDiagnosis}from'./_diagnosis-expansion.mjs';
import{buildWebsiteDiagnosticEvidence,augmentWebsiteDiagnosis}from'./_website-diagnostics.mjs';
import{applyClosestProviderFixLinks}from'./_provider-fix-links.mjs';
import{verifyNetlifyRedeploy}from'./_netlify-redeploy-repair.mjs';

const EXPANDED=['vercel','render','cloudflare','neon','resend'];
const upsert=(checks,live)=>{const i=checks.findIndex(x=>x.id===live.id);if(i>=0)checks[i]=live;else checks.push(live)};
async function tokenFor(workspaceId,provider){const c=await readConnection(workspaceId,provider).catch(()=>null);if(!c?.id||c.status==='revoked')return null;try{return decryptSecret(await readSecret(c.id))?.accessToken||null}catch{return null}}

export default async request=>{
  const copy=request.clone();
  const base=await baseDiagnose(request);
  if(!base.ok)return base;
  try{
    const body=await copy.json(),user=await requireUser(copy),workspace=await requireWorkspace(user.id,body.workspaceId),checks=[...(workspace.lastDiagnosticSnapshot?.checks||[])],now=new Date().toISOString();
    for(const provider of EXPANDED){
      const connection=await readConnection(workspace.id,provider).catch(()=>null);if(!connection?.id||connection.status==='revoked')continue;
      try{
        const secret=decryptSecret(await readSecret(connection.id)),probe=await probeCredential(provider,secret?.accessToken),live=checkForProvider(provider,probe);upsert(checks,live);connection.lastCheckedAt=now;connection.status=live.status==='PASS'?'connected':'error';connection.updatedAt=now;connection.lastErrorCode=live.status==='PASS'?null:'probe_failed';await writeConnection(workspace.id,provider,connection);workspace.providers=(workspace.providers||[]).map(p=>p.id===provider?{...p,status:connection.status,detail:live.detail,checkedAt:now}:p);
      }catch{
        upsert(checks,{id:`${provider}.live`,label:provider[0].toUpperCase()+provider.slice(1),status:'WARN',detail:`Live ${provider} probe could not complete.`,evidence:{source:'weaverelay-live-expanded',resourceBodiesRetained:false}});
      }
    }
    if(workspace.siteOrigin)try{const website=await buildWebsiteDiagnosticEvidence(workspace.siteOrigin);for(const websiteCheck of website.checks)upsert(checks,websiteCheck)}catch{upsert(checks,{id:'website.diagnostics','Website diagnostics',status:'WARN',detail:'The website diagnostic layer could not complete in this run.',evidence:{source:'weaverelay-website-diagnostics',customerDataRetained:false}})}
    if(workspace.lastRepair?.type==='netlify-redeploy'&&workspace.lastRepair?.verificationPending===true){
      const [netlifyToken,githubToken]=await Promise.all([tokenFor(workspace.id,'netlify'),tokenFor(workspace.id,'github')]);
      try{
        const verified=await verifyNetlifyRedeploy({workspace,repair:workspace.lastRepair,netlifyToken,githubToken});
        upsert(checks,{id:'repair.netlify-redeploy',label:'Netlify rebuild verification',status:verified.status,detail:verified.detail,evidence:{source:'weaverelay-netlify-redeploy-verification',...(verified.evidence||{})}});
        if(verified.status==='PASS')workspace.lastRepair={...workspace.lastRepair,verificationPending:false,verified:true,verifiedAt:now};
        else if(verified.status==='FAIL')workspace.lastRepair={...workspace.lastRepair,verificationPending:false,verified:false,verificationFailedAt:now};
      }catch{upsert(checks,{id:'repair.netlify-redeploy',label:'Netlify rebuild verification',status:'WARN',detail:'The approved rebuild is recorded, but WeaveRelay could not complete its post-deploy verification in this run.',evidence:{source:'weaverelay-netlify-redeploy-verification',verificationPending:true}})}
    }
    const seed=workspace.lastDiagnosticSnapshot||workspace.seedSnapshot||{product:workspace.name,topology:workspace.stackMap||{}};
    const snapshot=sanitizeSnapshot({...seed,product:workspace.name,generatedAt:now,checks});
    let diagnosis=augmentDiagnosis(diagnoseSnapshot(snapshot),snapshot);
    diagnosis=augmentWebsiteDiagnosis(diagnosis,snapshot);
    diagnosis=applyClosestProviderFixLinks(diagnosis,snapshot);
    workspace.lastDiagnosticSnapshot=snapshot;workspace.diagnosis=diagnosis;workspace.status=diagnosis.status==='healthy'?'ready':'needs_action';workspace.updatedAt=now;await writeWorkspace(workspace);
    return new Response(JSON.stringify({ok:true,workspaceId:workspace.id,diagnosis,checks:snapshot.checks,stackMap:workspace.stackMap||snapshot.topology}),{status:200,headers:{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'}});
  }catch{return base}
};
