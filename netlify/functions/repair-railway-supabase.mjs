import{requireUser}from'./_auth.mjs';
import{requireWorkspace,readConnection,readSecret,writeWorkspace}from'./_workspace-store.mjs';
import{decryptSecret}from'./_vault.mjs';
import{applyRailwaySupabaseRepair}from'./_railway-supabase-repair.mjs';
import{json,safeError}from'./_http.mjs';

async function accessToken(workspaceId,provider){
  const connection=await readConnection(workspaceId,provider);
  if(!connection?.id||connection.status==='revoked')throw new Error(`${provider} is not connected.`);
  const secret=decryptSecret(await readSecret(connection.id));
  if(!secret?.accessToken)throw new Error(`${provider} authorization is unavailable.`);
  return secret.accessToken;
}

export default async request=>{
  if(request.method!=='POST')return json(405,{error:'Method not allowed.'});
  try{
    const user=await requireUser(request);
    const body=await request.json();
    if(body?.approved!==true)return json(400,{error:'Explicit approval is required immediately before this repair.'});
    const workspace=await requireWorkspace(user.id,body.workspaceId);
    const [railwayToken,supabaseToken]=await Promise.all([accessToken(workspace.id,'railway'),accessToken(workspace.id,'supabase')]);
    const result=await applyRailwaySupabaseRepair({workspace,railwayToken,supabaseToken});
    const now=new Date().toISOString();
    workspace.lastRepair={type:'railway-supabase-url',provider:'railway',changed:Boolean(result.changed),configurationVerified:Boolean(result.verified),runtimeVerified:false,redeployRequired:Boolean(result.redeployRequired),projectRef:result.desiredRef||null,projectId:result.target?.projectId||null,serviceId:result.target?.serviceId||null,environmentId:result.target?.environmentId||null,publicDomain:result.target?.publicDomain||null,serviceName:result.target?.serviceName||null,environmentName:result.target?.environmentName||null,approvedBy:user.id,approvedAt:now,redeployRequestedAt:null,previousDeploymentId:null,redeploymentId:null};
    workspace.updatedAt=now;
    await writeWorkspace(workspace);
    return json(200,{ok:true,repair:{type:'railway-supabase-url',changed:Boolean(result.changed),configurationVerified:Boolean(result.verified),runtimeVerified:false,redeployRequired:Boolean(result.redeployRequired),projectRef:result.desiredRef||null,serviceName:result.target?.serviceName||null,environmentName:result.target?.environmentName||null},message:result.changed?'Railway configuration was corrected and the saved Supabase reference was verified. The running Railway service now needs a separate approved redeploy before runtime verification.':'Railway already had the intended Supabase reference. Run diagnosis again to verify the live application boundary.'});
  }catch(error){return safeError(error)}
};
