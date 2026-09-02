import{requireUser}from'./_auth.mjs';
import{requireWorkspace,readConnection,readSecret,writeConnection,writeWorkspace}from'./_workspace-store.mjs';
import{decryptSecret}from'./_vault.mjs';
import{diagnoseSnapshot,sanitizeSnapshot}from'./_diagnose.mjs';
import{probeCredential,checkForProvider}from'./_provider-probes.mjs';
import{buildCrossSystemEvidence}from'./_cross-system.mjs';
import{buildEnvironmentDeploymentEvidence}from'./_environment-deployment.mjs';
import{json,safeError}from'./_http.mjs';

const upsert=(checks,live)=>{const ix=checks.findIndex(c=>c.id===live.id);if(ix>=0)checks[ix]=live;else checks.push(live)};
const providerIds={github:'github.live',netlify:'netlify.account',railway:'railway.runtime',supabase:'supabase.live',stripe:'stripe.live'};

export default async request=>{
  if(request.method!=='POST')return json(405,{error:'Method not allowed.'});
  try{
    const user=await requireUser(request);
    const body=await request.json();
    const workspace=await requireWorkspace(user.id,body.workspaceId);
    const seed=workspace.seedSnapshot||{product:workspace.name,topology:workspace.stackMap||{},checks:[]};
    const checks=[...(seed.checks||[])];
    const secrets={};
    const now=new Date().toISOString();

    for(const provider of ['github','netlify','railway','supabase','stripe']){
      const c=await readConnection(workspace.id,provider).catch(()=>null);
      if(!c?.id||c.status==='revoked')continue;
      try{
        const secret=decryptSecret(await readSecret(c.id));
        secrets[provider]=secret.accessToken;
        let live;
        if(provider==='github'){
          const r=await fetch('https://api.github.com/user',{headers:{authorization:`Bearer ${secret.accessToken}`,accept:'application/vnd.github+json','user-agent':'weaverelay'}});
          await r.text();
          live={id:'github.live',label:'GitHub',status:r.ok?'PASS':'FAIL',detail:r.ok?'GitHub answered a live read-only account probe.':`GitHub returned HTTP ${r.status}.`,evidence:{source:'weaverelay-live-oauth',...(r.ok?{}:{httpStatus:r.status})}};
        }else{
          live=checkForProvider(provider,await probeCredential(provider,secret.accessToken));
        }
        upsert(checks,live);
        c.lastCheckedAt=now;c.status=live.status==='PASS'?'connected':'error';c.updatedAt=now;
        await writeConnection(workspace.id,provider,c);
      }catch{
        upsert(checks,{id:providerIds[provider],label:provider[0].toUpperCase()+provider.slice(1),status:'WARN',detail:`Live ${provider} probe could not complete.`,evidence:{source:'weaverelay-live'}});
      }
    }

    let topology=workspace.stackMap||seed.topology||{};
    try{
      const cross=await buildCrossSystemEvidence({workspace,secrets});
      for(const check of cross.checks)upsert(checks,check);
      topology=cross.map;
      workspace.stackMap=topology;
    }catch{
      upsert(checks,{id:'map.cross-system',label:'Cross-system map',status:'WARN',detail:'Provider health checks completed, but the relationship map could not be fully evaluated in this run.',evidence:{source:'weaverelay-cross-system'}});
    }

    try{
      const environment=await buildEnvironmentDeploymentEvidence({workspace,secrets});
      for(const check of environment.checks)upsert(checks,check);
    }catch{
      upsert(checks,{id:'env.deployment-truth',label:'Environment / deployment truth',status:'WARN',detail:'The live provider checks completed, but environment/deployment metadata could not be fully evaluated.',evidence:{source:'weaverelay-environment-deployment'}});
    }

    const snapshot=sanitizeSnapshot({...seed,product:workspace.name,generatedAt:now,topology,checks});
    const diagnosis=diagnoseSnapshot(snapshot);
    workspace.diagnosis=diagnosis;
    workspace.lastDiagnosticSnapshot=snapshot;
    workspace.updatedAt=now;
    workspace.status=diagnosis.status==='healthy'?'ready':'needs_action';
    await writeWorkspace(workspace);
    return json(200,{ok:true,workspaceId:workspace.id,diagnosis,checks:snapshot.checks,stackMap:topology});
  }catch(error){return safeError(error)}
};
