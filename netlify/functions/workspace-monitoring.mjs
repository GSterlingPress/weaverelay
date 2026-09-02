import { requireUser } from './_auth.mjs';
import { requireWorkspace,writeWorkspace } from './_workspace-store.mjs';
import { normalizeMonitoring } from './_monitoring.mjs';
import { json,safeError } from './_http.mjs';

export default async request=>{
  if(request.method!=='POST')return json(405,{ok:false,error:'Method not allowed.'});
  try{
    const user=await requireUser(request);
    const body=await request.json();
    const workspace=await requireWorkspace(user.id,String(body.workspaceId||''));
    const monitoring=normalizeMonitoring({
      ...(workspace.monitoring||{}),
      ...(body.monitoring&&typeof body.monitoring==='object'?body.monitoring:{})
    });
    workspace.monitoring={...monitoring,alertTarget:'verified-owner-email',updatedAt:new Date().toISOString()};
    workspace.updatedAt=new Date().toISOString();
    await writeWorkspace(workspace);
    return json(200,{ok:true,workspaceId:workspace.id,monitoring:workspace.monitoring});
  }catch(error){return safeError(error)}
};
