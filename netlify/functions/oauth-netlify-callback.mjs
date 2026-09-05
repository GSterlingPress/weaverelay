import crypto from'node:crypto';
import{takeOAuthState}from'./_oauth.mjs';
import{encryptSecret}from'./_vault.mjs';
import{readConnection,writeConnection,writeSecret,deleteSecret,readWorkspace,writeWorkspace}from'./_workspace-store.mjs';
import{replacementSecretId}from'./_provider-connection-hardening.mjs';
import{safeError}from'./_http.mjs';

const redirect=(location,status=302)=>new Response(null,{status,headers:{location,'cache-control':'no-store, max-age=0','referrer-policy':'no-referrer'}});
const fail=message=>redirect('/app.html?oauth=netlify&error='+encodeURIComponent(message||'authorization_failed'));

export default async request=>{
  if(request.method!=='GET')return new Response('Method not allowed.',{status:405,headers:{'cache-control':'no-store'}});
  const url=new URL(request.url),code=String(url.searchParams.get('code')||'').trim(),rawState=String(url.searchParams.get('state')||'').trim(),oauthError=String(url.searchParams.get('error_description')||url.searchParams.get('error')||'').trim();
  if(oauthError)return fail(oauthError);
  if(!code||!rawState)return fail('Netlify authorization response was incomplete. Please connect Netlify again.');
  try{
    const clientId=process.env.CONNECT_NETLIFY_CLIENT_ID,clientSecret=process.env.CONNECT_NETLIFY_CLIENT_SECRET;
    if(!clientId||!clientSecret)throw new Error('Netlify OAuth is not fully configured on WeaveRelay yet.');
    const state=await takeOAuthState(rawState,'netlify');
    const redirectUri=new URL('/api/oauth/netlify/callback',url.origin).toString();
    const tokenBody=new URLSearchParams({grant_type:'authorization_code',code,client_id:clientId,client_secret:clientSecret,redirect_uri:redirectUri});
    const tokenResponse=await fetch('https://api.netlify.com/oauth/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded','accept':'application/json','user-agent':'WeaveRelay'},body:tokenBody}),tokenData=await tokenResponse.json().catch(()=>({})),accessToken=String(tokenData.access_token||'').trim();
    if(!tokenResponse.ok||accessToken.length<20)throw new Error('Netlify authorization code exchange failed. Please authorize Netlify again.');
    const accountResponse=await fetch('https://api.netlify.com/api/v1/user',{headers:{authorization:`Bearer ${accessToken}`,'user-agent':'WeaveRelay'}}),account=await accountResponse.json().catch(()=>({}));
    if(!accountResponse.ok||!account.id)throw new Error('Netlify account verification failed. Please authorize Netlify again.');
    const previous=await readConnection(state.workspaceId,'netlify').catch(()=>null),connectionId=crypto.randomUUID(),now=new Date().toISOString(),accountName=account.full_name||account.email||'Netlify account';
    await writeSecret(connectionId,encryptSecret({accessToken,method:'netlify-oauth'}));
    await writeConnection(state.workspaceId,'netlify',{id:connectionId,workspaceId:state.workspaceId,provider:'netlify',status:'connected',externalAccountId:String(account.id),externalAccountName:accountName,scopes:['netlify-oauth'],lastCheckedAt:now,lastErrorCode:null,createdAt:previous?.createdAt||now,updatedAt:now});
    const staleSecretId=replacementSecretId(previous,connectionId);if(staleSecretId)await deleteSecret(staleSecretId);
    const workspace=await readWorkspace(state.workspaceId);if(workspace){workspace.providers=(workspace.providers||[]).map(p=>p.id==='netlify'?{...p,status:'connected',detail:`Authorized as ${accountName}.`,checkedAt:now}:p);workspace.updatedAt=now;await writeWorkspace(workspace)}
    return redirect('/app.html?w='+encodeURIComponent(state.workspaceId)+'&oauth=netlify&connected=1');
  }catch(error){console.error('Netlify OAuth callback failed:',error instanceof Error?error.message:'unknown error');const response=safeError(error);if(response instanceof Response&&response.status>=500)return fail('Netlify authorization could not be completed. Please try again.');return fail(error instanceof Error?error.message:'Netlify authorization failed.');}
};

export const config={path:'/api/oauth/netlify/callback'};
