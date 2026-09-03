const clean=v=>String(v??'').trim();
export const railwayScopes=value=>clean(value).split(/\s+/).filter(Boolean);
export const hasRailwayProjectViewer=value=>railwayScopes(value).includes('project:viewer');
export function railwayTokenNeedsRefresh(secret,{now=Date.now(),skewMs=60000}={}){
  const expires=Date.parse(secret?.expiresAt||'');
  return Number.isFinite(expires)&&expires<=now+skewMs;
}
const authHeaders=(token)=>({authorization:`Bearer ${token}`,'content-type':'application/json','user-agent':'weaverelay'});
export async function refreshRailwayOAuth(secret,{fetchImpl=fetch,clientId=process.env.CONNECT_RAILWAY_CLIENT_ID,clientSecret=process.env.CONNECT_RAILWAY_CLIENT_SECRET,now=Date.now()}={}){
  if(!secret?.refreshToken)throw Object.assign(new Error('railway_refresh_unavailable'),{code:'railway_refresh_unavailable'});
  if(!clientId||!clientSecret)throw Object.assign(new Error('railway_oauth_not_configured'),{code:'railway_oauth_not_configured'});
  const basic=Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const body=new URLSearchParams({grant_type:'refresh_token',refresh_token:secret.refreshToken});
  const response=await fetchImpl('https://backboard.railway.com/oauth/token',{method:'POST',headers:{authorization:`Basic ${basic}`,'content-type':'application/x-www-form-urlencoded','user-agent':'weaverelay'},body});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!data.access_token){
    const code=String(data.error||'').toLowerCase()==='invalid_grant'?'railway_refresh_revoked':'railway_refresh_failed';
    throw Object.assign(new Error(code),{code,httpStatus:response.status});
  }
  const scope=clean(data.scope)||clean(secret.scope);
  if(!hasRailwayProjectViewer(scope))throw Object.assign(new Error('railway_project_viewer_missing'),{code:'railway_project_viewer_missing'});
  return {...secret,accessToken:data.access_token,refreshToken:data.refresh_token||secret.refreshToken,tokenType:data.token_type||secret.tokenType||'Bearer',scope,expiresAt:new Date(now+Math.max(60,Number(data.expires_in)||3600)*1000).toISOString(),method:'railway-oauth-project-viewer'};
}
export async function ensureRailwayOAuth(secret,options={}){
  if(!secret?.accessToken)throw Object.assign(new Error('railway_access_token_missing'),{code:'railway_access_token_missing'});
  if(!hasRailwayProjectViewer(secret.scope))throw Object.assign(new Error('railway_project_viewer_missing'),{code:'railway_project_viewer_missing'});
  if(!railwayTokenNeedsRefresh(secret,options))return{secret,refreshed:false};
  return{secret:await refreshRailwayOAuth(secret,options),refreshed:true};
}
export async function probeRailwayProject(accessToken,projectId,{fetchImpl=fetch}={}){
  const wanted=clean(projectId);
  if(!wanted)throw Object.assign(new Error('railway_project_missing'),{code:'railway_project_missing'});
  const response=await fetchImpl('https://backboard.railway.com/graphql/v2',{method:'POST',headers:authHeaders(accessToken),body:JSON.stringify({query:'query { externalWorkspaces { id name projects { id name } } }'})});
  const data=await response.json().catch(()=>({}));
  if(response.status===401||response.status===403)return{ok:false,revoked:true,httpStatus:response.status,errorCode:'railway_oauth_revoked'};
  if(!response.ok)return{ok:false,revoked:false,httpStatus:response.status,errorCode:'railway_project_probe_failed'};
  if(Array.isArray(data.errors)&&data.errors.length)return{ok:false,revoked:false,httpStatus:response.status,errorCode:'railway_graphql_error'};
  const matches=(data.data?.externalWorkspaces||[]).flatMap(w=>(w.projects||[]).map(p=>({id:clean(p.id),name:clean(p.name)||'Railway project',workspaceName:clean(w.name)||null}))).filter(p=>p.id===wanted);
  if(matches.length!==1)return{ok:false,revoked:false,httpStatus:response.status,errorCode:'railway_selected_project_unavailable'};
  return{ok:true,project:matches[0],httpStatus:response.status,errorCode:null};
}
