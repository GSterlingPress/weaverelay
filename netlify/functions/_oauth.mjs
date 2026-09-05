import crypto from'node:crypto';
import{writeOAuthState,consumeOAuthState}from'./_workspace-store.mjs';
import{publicBase}from'./_http.mjs';

const sha=v=>crypto.createHash('sha256').update(String(v)).digest('hex');
const requestOrigin=request=>{try{return new URL(request.url).origin}catch{return publicBase(request)}};
const encodeOrigin=origin=>Buffer.from(String(origin)).toString('base64url');

export async function issueOAuthState({request,userId,workspaceId,provider,metadata={}}){
  const returnOrigin=requestOrigin(request),random=crypto.randomBytes(32).toString('base64url'),raw=`${encodeOrigin(returnOrigin)}.${random}`,redirectUri=`${publicBase(request)}/api/oauth/${provider}/callback`,record={userId,workspaceId,provider,redirectUri,returnOrigin,metadata,expiresAt:new Date(Date.now()+10*60_000).toISOString(),createdAt:new Date().toISOString()};
  await writeOAuthState(sha(raw),record);
  return{state:raw,redirectUri,returnOrigin};
}

export async function takeOAuthState(raw,provider){
  const record=await consumeOAuthState(sha(raw));
  if(!record||record.provider!==provider||Date.parse(record.expiresAt)<Date.now())throw new Error('This provider authorization has expired. Start the connection again.');
  return record;
}
