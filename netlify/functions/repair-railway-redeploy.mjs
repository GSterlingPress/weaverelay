import{requireUser}from'./_auth.mjs';
import{requireWorkspace,readConnection,readSecret,writeWorkspace}from'./_workspace-store.mjs';
import{decryptSecret}from'./_vault.mjs';
import{triggerRailwayRedeploy}from'./_railway-redeploy-repair.mjs';
import{json,safeError}from'./_http.mjs';

async function railwayToken(workspaceId){
  const connection=await readConnection(workspaceId,'railway');
  if(!connection?.id||connection.status==='revoked')throw new Error('Railway is not connected.');
  const secret=decryptSecret(await readSecret(connection.id));
  if(!secret?.accessToken)throw new Error('Railway authorization is unavailable.');
  return secret.accessToken;
}

export default async request=>{
  if(request.method!=='POST')return json(405,{error:'Method not allowed.'});
  try{
    const user=await requireUser(request),body=await request.json();
    if(body?.approved!==true)return json(400,{error:'Explicit approval is required immediately before this redeploy.'});
    const workspace=await requireWorkspace(user.id,body.workspaceId),token=await railwayToken(workspace.id),result=await triggerRailwayRedeploy({workspace,railwayToken:token}),now=new Date().toISOString();
    if(result.kind==='stripe-handler-secret'){
      workspace.lastRepair={...(workspace.lastRepair||{}),runtimeVerified:false,deliveryVerified:false,fullChainVerified:false,handlerRepair:{...(workspace.lastRepair?.handlerRepair||{}),redeployRequired:false,redeployRequestedAt:now,previousDeploymentId:result.previousDeploymentId||null,redeploymentId:result.newDeploymentId||null,runtimeVerified:false,redeployApprovedBy:user.id}};
    }else{
      workspace.lastRepair={...(workspace.lastRepair||{}),redeployRequired:false,redeployRequestedAt:now,previousDeploymentId:result.previousDeploymentId||null,redeploymentId:result.newDeploymentId||null,runtimeVerified:false,redeployApprovedBy:user.id};
    }
    workspace.updatedAt=now;await writeWorkspace(workspace);
    return json(200,{ok:true,repair:{type:'railway-redeploy',repairKind:result.kind,triggered:true,runtimeVerified:false,deploymentStatus:result.newDeploymentStatus||null},message:result.newDeploymentStatus?`Railway redeploy started with status ${result.newDeploymentStatus.toLowerCase()}. WeaveRelay will verify the running backend in diagnosis.`:'Railway accepted the redeploy. WeaveRelay will verify the running backend in diagnosis.'});
  }catch(error){return safeError(error)}
};
