import crypto from'node:crypto';
import{writeOAuthState,consumeOAuthState}from'./_workspace-store.mjs';
import{publicBase}from'./_http.mjs';

const sha=v=>crypto.createHash('sha256').update(String(v)).digest('hex');
const requestOrigin=request=>{try{return new URL(request.url).origin}catch{return publicBase(request)}};
const requestHost=request=>{try{return new URL(request.url).hostname.toLowerCase()}catch{return''}};
const encodeOrigin=origin=>Buffer.from(String(origin)).toString('base64url');
const PREVIEW_HOST=/^deploy-preview-\d+--weaverelay\.netlify\.app$/;
const BRANCH_HOST=/^[a-z0-9-]+--weaverelay\.netlify\.app$/;

export function railwayCallbackOrigin(request){
  const host=requestHost(request),origin=requestOrigin(request);
  if(PREVIEW_HOST.test(host)||BRANCH_HOST.test(host))return origin;
  return publicBase(request);
}

export async function issueOAuthState({request,userId,workspaceId,provider,metadata={},callbackOrigin=null}){
  const returnOrigin=requestOrigin(request),resolvedCallbackOrigin=String(callbackOrigin||publicBase(request)).replace(/\/$/,''),random=crypto.randomBytes(32).toString('base64url'),raw=`${encodeOrigin(returnOrigin)}.${random}`,redirectUri=`${resolvedCallbackOrigin}/api/oauth/${provider}/callback`,record={userId,workspaceId,provider,redirectUri,returnOrigin,metadata,expiresAt:new Date(Date.now()+10*60_000).toISOString(),createdAt:new Date().toISOString()};
  await writeOAuthState(sha(raw),record);
  return{state:raw,redirectUri,returnOrigin};
}

export async function takeOAuthState(raw,provider){
  const record=await consumeOAuthState(sha(raw));
  if(!record||record.provider!==provider||Date.parse(record.expiresAt)<Date.now())throw new Error('This provider authorization has expired. Start the connection again.');
  return record;
}
