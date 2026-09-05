import crypto from'node:crypto';
import{takeOAuthState}from'./_oauth.mjs';
import{encryptSecret}from'./_vault.mjs';
import{readConnection,writeConnection,writeSecret,deleteSecret,readWorkspace,writeWorkspace}from'./_workspace-store.mjs';
import{replacementSecretId}from'./_provider-connection-hardening.mjs';
import{json,safeError}from'./_http.mjs';

const callbackPage=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>Connecting Netlify · WeaveRelay</title></head><body style="background:#0a0e12;color:#eef7f2;font-family:system-ui,sans-serif;padding:32px"><main><h1>Connecting Netlify…</h1><p id="status">Finishing secure authorization. You will return to WeaveRelay automatically.</p></main><script>(()=>{const status=document.querySelector('#status'),params=new URLSearchParams(location.hash.slice(1)),accessToken=params.get('access_token'),state=params.get('state'),oauthError=params.get('error_description')||params.get('error');history.replaceState(null,'',location.pathname);const fail=message=>{status.textContent='Netlify authorization did not finish. Returning to WeaveRelay…';location.replace('/app.html?oauth=netlify&error='+encodeURIComponent(message||'authorization_failed'))};if(oauthError||!accessToken||!state){fail(oauthError||'missing_callback_values');return}fetch(location.pathname,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({accessToken,state})}).then(async response=>{const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'Netlify authorization failed.');location.replace('/app.html?w='+encodeURIComponent(data.workspaceId)+'&oauth=netlify&connected=1')}).catch(error=>fail(error.message))})();</script></body></html>`;

export default async request=>{
  if(request.method==='GET')return new Response(callbackPage,{status:200,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store, max-age=0','referrer-policy':'no-referrer'}});
  if(request.method!=='POST')return json(405,{error:'Method not allowed.'});
  try{
    const body=await request.json(),accessToken=String(body.accessToken||'').trim(),rawState=String(body.state||'').trim();
    if(accessToken.length<20||!rawState)return json(400,{error:'Netlify authorization response was incomplete. Please connect Netlify again.'});
    const state=await takeOAuthState(rawState,'netlify');
    const accountResponse=await fetch('https://api.netlify.com/api/v1/user',{headers:{authorization:`Bearer ${accessToken}`,'user-agent':'WeaveRelay'}}),account=await accountResponse.json().catch(()=>({}));
    if(!accountResponse.ok||!account.id)throw new Error('Netlify account verification failed. Please authorize Netlify again.');
    const previous=await readConnection(state.workspaceId,'netlify').catch(()=>null),connectionId=crypto.randomUUID(),now=new Date().toISOString(),accountName=account.full_name||account.email||'Netlify account';
    await writeSecret(connectionId,encryptSecret({accessToken,method:'netlify-oauth'}));
    await writeConnection(state.workspaceId,'netlify',{id:connectionId,workspaceId:state.workspaceId,provider:'netlify',status:'connected',externalAccountId:String(account.id),externalAccountName:accountName,scopes:['netlify-oauth'],lastCheckedAt:now,lastErrorCode:null,createdAt:previous?.createdAt||now,updatedAt:now});
    const staleSecretId=replacementSecretId(previous,connectionId);if(staleSecretId)await deleteSecret(staleSecretId);
    const workspace=await readWorkspace(state.workspaceId);if(workspace){workspace.providers=(workspace.providers||[]).map(p=>p.id==='netlify'?{...p,status:'connected',detail:`Authorized as ${accountName}.`,checkedAt:now}:p);workspace.updatedAt=now;await writeWorkspace(workspace)}
    return json(200,{ok:true,provider:'netlify',workspaceId:state.workspaceId,status:'connected'});
  }catch(error){console.error('Netlify OAuth callback failed:',error instanceof Error?error.message:'unknown error');return safeError(error)}
};

export const config={path:'/api/oauth/netlify/callback'};
