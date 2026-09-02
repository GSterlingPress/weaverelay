import{requireUser}from'./_auth.mjs';
import{requireWorkspace,readConnection,readSecret,writeWorkspace}from'./_workspace-store.mjs';
import{decryptSecret}from'./_vault.mjs';
import{triggerNetlifyRedeploy}from'./_netlify-redeploy-repair.mjs';
import{json,safeError}from'./_http.mjs';

export default async request=>{
  if(request.method!=='POST')return json(405,{error:'Method not allowed.'});
  try{
    const user=await requireUser(request),body=await request.json();
    if(body.approved!==true)return json(409,{error:'Explicit approval is required immediately before a Netlify rebuild.'});
    const workspace=await requireWorkspace(user.id,String(body.workspaceId||''));
    const netlifyConnection=await readConnection(workspace.id,'netlify').catch(()=>null),githubConnection=await readConnection(workspace.id,'github').catch(()=>null);
    if(!netlifyConnection?.id||!githubConnection?.id)return json(409,{error:'GitHub and Netlify must both be connected before WeaveRelay can target a rebuild safely.'});
    const netlifySecret=decryptSecret(await readSecret(netlifyConnection.id)),githubSecret=decryptSecret(await readSecret(githubConnection.id));
    const repair=await triggerNetlifyRedeploy({workspace,netlifyToken:netlifySecret?.accessToken,githubToken:githubSecret?.accessToken});
    const now=new Date().toISOString();
    workspace.lastRepair={type:'netlify-redeploy',approved:true,requestedAt:now,siteName:repair.siteName,branch:repair.branch,repository:repair.repository,buildId:repair.buildId,deployId:repair.deployId,configurationChanged:false,sourceChanged:false,verificationPending:true};
    workspace.updatedAt=now;
    await writeWorkspace(workspace);
    return json(200,{ok:true,message:'Netlify rebuild requested for the proven production site and branch. WeaveRelay will not call it fixed until a later diagnosis sees a successful published deploy and a healthy public app.',repair:{type:'netlify-redeploy',siteName:repair.siteName,branch:repair.branch,verificationPending:true}});
  }catch(error){return safeError(error)}
};
