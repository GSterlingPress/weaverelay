import{requireUser}from'./_auth.mjs';
import{requireWorkspace,readConnection,readSecret,writeWorkspace}from'./_workspace-store.mjs';
import{decryptSecret}from'./_vault.mjs';
import{applyStripeWebhookRepair}from'./_stripe-webhook-repair.mjs';
import{json,safeError}from'./_http.mjs';

async function accessToken(workspaceId,provider){const connection=await readConnection(workspaceId,provider);if(!connection?.id||connection.status==='revoked')throw new Error(`${provider} is not connected.`);const secret=decryptSecret(await readSecret(connection.id));if(!secret?.accessToken)throw new Error(`${provider} authorization is unavailable.`);return secret.accessToken}

export default async request=>{
  if(request.method!=='POST')return json(405,{error:'Method not allowed.'});
  try{
    const user=await requireUser(request);const body=await request.json();
    if(body?.approved!==true)return json(400,{error:'Explicit approval is required immediately before this repair.'});
    const workspace=await requireWorkspace(user.id,body.workspaceId);
    const [railwayToken,stripeToken]=await Promise.all([accessToken(workspace.id,'railway'),accessToken(workspace.id,'stripe')]);
    const result=await applyStripeWebhookRepair({workspace,railwayToken,stripeToken});const now=new Date().toISOString(),target=result.target||{};
    workspace.lastRepair={type:'stripe-webhook-host',provider:'stripe',changed:Boolean(result.changed),configurationVerified:Boolean(result.verified),runtimeVerified:false,deliveryVerified:false,targetHost:result.targetHost||null,endpointId:result.endpointId||null,pathPreserved:Boolean(result.pathPreserved),projectId:target.projectId||null,projectName:target.projectName||null,environmentId:target.environmentId||null,environmentName:target.environmentName||null,serviceId:target.serviceId||null,serviceName:target.serviceName||null,publicDomain:target.domain||result.targetHost||null,endpointUrlsRetained:false,signingSecretsRetained:false,approvedBy:user.id,approvedAt:now};
    workspace.updatedAt=now;await writeWorkspace(workspace);
    return json(200,{ok:true,repair:{type:'stripe-webhook-host',changed:Boolean(result.changed),configurationVerified:Boolean(result.verified),runtimeVerified:false,deliveryVerified:false,targetHost:result.targetHost||null,pathPreserved:Boolean(result.pathPreserved),serviceName:target.serviceName||null,environmentName:target.environmentName||null,endpointUrlsRetained:false,signingSecretsRetained:false},message:'Stripe webhook destination was corrected with a host-only change and the saved endpoint was verified. Run diagnosis again to verify real post-repair Stripe delivery to Railway.'});
  }catch(error){return safeError(error)}
};
