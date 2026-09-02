import{requireUser}from'./_auth.mjs';
import{requireWorkspace,readConnection,readSecret,writeConnection,writeWorkspace}from'./_workspace-store.mjs';
import{decryptSecret}from'./_vault.mjs';
import{diagnoseSnapshot,sanitizeSnapshot}from'./_diagnose.mjs';
import{probeCredential,checkForProvider}from'./_provider-probes.mjs';
import{buildCrossSystemEvidence}from'./_cross-system.mjs';
import{buildEnvironmentDeploymentEvidence}from'./_environment-deployment.mjs';
import{buildRuntimePaymentsEvidence}from'./_runtime-payments.mjs';
import{verifyRailwayRepairRuntime}from'./_railway-redeploy-repair.mjs';
import{verifyBackendSupabaseDependency}from'./_backend-dependency-proof.mjs';
import{inspectStripeWebhookRepair}from'./_stripe-webhook-repair.mjs';
import{verifyStripeWebhookDelivery}from'./_stripe-delivery-proof.mjs';
import{json,safeError}from'./_http.mjs';

const upsert=(checks,live)=>{const ix=checks.findIndex(c=>c.id===live.id);if(ix>=0)checks[ix]=live;else checks.push(live)};
const providerIds={github:'github.live',netlify:'netlify.account',railway:'railway.runtime',supabase:'supabase.live',stripe:'stripe.live'};
const checkById=(checks,id)=>checks.find(c=>c.id===id);

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
        }else live=checkForProvider(provider,await probeCredential(provider,secret.accessToken));
        upsert(checks,live);
        c.lastCheckedAt=now;c.status=live.status==='PASS'?'connected':'error';c.updatedAt=now;
        await writeConnection(workspace.id,provider,c);
      }catch{upsert(checks,{id:providerIds[provider],label:provider[0].toUpperCase()+provider.slice(1),status:'WARN',detail:`Live ${provider} probe could not complete.`,evidence:{source:'weaverelay-live'}})}
    }

    let topology=workspace.stackMap||seed.topology||{};
    try{const cross=await buildCrossSystemEvidence({workspace,secrets});for(const check of cross.checks)upsert(checks,check);topology=cross.map;workspace.stackMap=topology}catch{upsert(checks,{id:'map.cross-system',label:'Cross-system map',status:'WARN',detail:'Provider health checks completed, but the relationship map could not be fully evaluated in this run.',evidence:{source:'weaverelay-cross-system'}})}
    try{const environment=await buildEnvironmentDeploymentEvidence({workspace,secrets});for(const check of environment.checks)upsert(checks,check)}catch{upsert(checks,{id:'env.deployment-truth',label:'Environment / deployment truth',status:'WARN',detail:'The live provider checks completed, but environment/deployment metadata could not be fully evaluated.',evidence:{source:'weaverelay-environment-deployment'}})}
    try{const runtimePayments=await buildRuntimePaymentsEvidence({workspace,secrets});for(const check of runtimePayments.checks)upsert(checks,check)}catch{upsert(checks,{id:'runtime.payments-truth',label:'Runtime / payment boundary',status:'WARN',detail:'The live provider checks completed, but Railway runtime or Stripe webhook metadata could not be fully evaluated.',evidence:{source:'weaverelay-runtime-payments'}})}

    if(workspace.lastRepair?.type==='railway-supabase-url'&&workspace.lastRepair?.configurationVerified===true){
      try{const runtime=await verifyRailwayRepairRuntime({workspace,railwayToken:secrets.railway});if(runtime){upsert(checks,{id:'repair.railway-runtime',label:'Repaired Railway runtime',status:runtime.status,detail:runtime.detail,evidence:{source:'weaverelay-repair-verification',...(runtime.evidence||{})}});if(runtime.evidence?.runtimeVerified===true)workspace.lastRepair={...workspace.lastRepair,runtimeVerified:true,runtimeVerifiedAt:now}}}catch{upsert(checks,{id:'repair.railway-runtime',label:'Repaired Railway runtime',status:'WARN',detail:'The configuration repair is saved, but runtime verification could not complete in this diagnosis.',evidence:{source:'weaverelay-repair-verification',runtimeVerified:false}})}
      try{const dependency=await verifyBackendSupabaseDependency({workspace});if(dependency){upsert(checks,{id:'repair.railway-supabase-dependency',label:'Repaired backend → Supabase',status:dependency.status,detail:dependency.detail,evidence:{source:'weaverelay-backend-dependency-proof',...(dependency.evidence||{})}});if(dependency.evidence?.dependencyVerified===true)workspace.lastRepair={...workspace.lastRepair,dependencyVerified:true,fullChainVerified:true,verifiedAt:now}}}catch{upsert(checks,{id:'repair.railway-supabase-dependency',label:'Repaired backend → Supabase',status:'WARN',detail:'The Railway backend is running, but application-level Supabase verification could not complete in this diagnosis.',evidence:{source:'weaverelay-backend-dependency-proof',dependencyVerified:false}})}
    }

    if(workspace.lastRepair?.type==='stripe-webhook-host'&&workspace.lastRepair?.configurationVerified===true){
      const boundary=checkById(checks,'map.railway-stripe-webhook');const boundaryVerified=boundary?.status==='PASS';
      upsert(checks,{id:'repair.stripe-webhook',label:'Repaired Stripe → Railway webhook',status:boundaryVerified?'PASS':'WARN',detail:boundaryVerified?'The saved Stripe webhook points to the Railway service proven to belong to this application. Delivery still requires separate post-repair evidence.':'The Stripe webhook configuration was saved, but the live Stripe → Railway destination relationship is not yet proven by the current diagnosis.',evidence:{source:'weaverelay-stripe-webhook-repair',configurationVerified:true,boundaryVerified,deliveryVerified:false,endpointUrlsRetained:false,signingSecretsRetained:false}});
      try{const delivery=await verifyStripeWebhookDelivery({workspace,stripeToken:secrets.stripe});if(delivery){upsert(checks,{id:'repair.stripe-webhook-delivery',label:'Stripe webhook delivery → Railway handler',status:delivery.status,detail:delivery.detail,evidence:{source:'weaverelay-stripe-delivery-proof',...(delivery.evidence||{})}});if(delivery.evidence?.deliveryVerified===true)workspace.lastRepair={...workspace.lastRepair,runtimeVerified:true,deliveryVerified:true,fullChainVerified:true,verifiedAt:now};else workspace.lastRepair={...workspace.lastRepair,deliveryVerified:false,fullChainVerified:false}}}catch{upsert(checks,{id:'repair.stripe-webhook-delivery',label:'Stripe webhook delivery → Railway handler',status:'WARN',detail:'The Stripe webhook URL is correct, but delivery verification could not complete in this diagnosis.',evidence:{source:'weaverelay-stripe-delivery-proof',deliveryVerified:false,eventPayloadsRetained:false,endpointUrlsRetained:false}})}
    }

    const snapshot=sanitizeSnapshot({...seed,product:workspace.name,generatedAt:now,topology,checks});
    const diagnosis=diagnoseSnapshot(snapshot);
    const stripeBoundary=checkById(snapshot.checks,'map.railway-stripe-webhook');
    if(stripeBoundary?.status==='WARN'&&secrets.railway&&secrets.stripe){
      try{const proposal=await inspectStripeWebhookRepair({workspace,railwayToken:secrets.railway,stripeToken:secrets.stripe});if(proposal.eligible){const f=diagnosis.findings?.find(x=>x.id==='railway-stripe-webhook-unproven');if(f){f.explanation='Stripe has one enabled webhook with a webhook-like route, and WeaveRelay proved one different Railway production host for this app. A host-only repair is available; the existing path and query string will be preserved.';f.actions=['Approve a host-only Stripe webhook destination correction. WeaveRelay will re-read the endpoint immediately before writing and verify the saved host afterward.'];f.repair={supported:true,approvalRequired:true,type:'stripe-webhook-host',provider:'stripe',label:'FIX STRIPE WEBHOOK'}}}}catch{}
    }
    workspace.diagnosis=diagnosis;workspace.lastDiagnosticSnapshot=snapshot;workspace.updatedAt=now;workspace.status=diagnosis.status==='healthy'?'ready':'needs_action';
    await writeWorkspace(workspace);
    return json(200,{ok:true,workspaceId:workspace.id,diagnosis,checks:snapshot.checks,stackMap:topology});
  }catch(error){return safeError(error)}
};
