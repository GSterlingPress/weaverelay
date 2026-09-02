import crypto from 'node:crypto';
import { normalizeOrigin, verifyHandshake, workspaceId, issueTicket } from './_relay-crypto.mjs';
import { PROVIDERS, providerRecord, connectionPlan } from './_provider-catalog.mjs';
import { readWorkspace, writeWorkspace } from './_workspace-store.mjs';
import { sanitizeSnapshot, diagnoseSnapshot } from './_diagnose.mjs';
import { json, publicBase } from './_http.mjs';
const digest=value=>crypto.createHash('sha256').update(JSON.stringify(value||{})).digest('base64url');
export default async request=>{
  if(request.method!=='POST')return json(405,{error:'Method not allowed.'});let body;try{body=await request.json()}catch{return json(400,{error:'Invalid JSON.'})}
  const clientId=String(body.clientId||'').trim();if(!/^[a-z0-9][a-z0-9_-]{2,63}$/i.test(clientId))return json(400,{error:'Invalid clientId.'});
  let siteOrigin;try{siteOrigin=normalizeOrigin(body.siteOrigin)}catch(error){return json(400,{error:error.message})}
  const providers=[...new Set(Array.isArray(body.providers)?body.providers.map(String):[])].filter(id=>PROVIDERS[id]);if(!providers.length)return json(400,{error:'At least one supported provider is required.'});
  const rawSnapshot=body.stackSnapshot&&typeof body.stackSnapshot==='object'?body.stackSnapshot:{},snapshotDigest=digest(rawSnapshot);if(String(body.snapshotDigest||'')!==snapshotDigest)return json(400,{error:'Stack snapshot digest mismatch.'});
  if(!verifyHandshake({clientId,siteOrigin,timestamp:body.timestamp,nonce:body.nonce,providers,snapshotDigest:body.snapshotDigest},request.headers.get('x-weaverelay-signature')))return json(401,{error:'Invalid or expired WeaveRelay handshake.'});
  const snapshot=sanitizeSnapshot(rawSnapshot),id=workspaceId(clientId,siteOrigin),existing=await readWorkspace(id).catch(()=>null),incoming=body.providerStatus&&typeof body.providerStatus==='object'?body.providerStatus:{},now=new Date().toISOString();
  const providerStates=providers.map(provider=>{const previous=(existing?.providers||[]).find(p=>p.id===provider);return providerRecord(provider,previous?.status==='connected'?previous:(incoming[provider]||{}));});
  const workspace={id,ownerId:existing?.ownerId||null,name:existing?.name||(clientId==='studio-one'?'Studio One':clientId),clientId,sourceClient:clientId,siteOrigin,status:'needs_action',phase:'connect-map-diagnose',providers:providerStates,plan:connectionPlan(providerStates),stackMap:{nodes:providers.map(pid=>({id:pid,label:PROVIDERS[pid].label,status:providerStates.find(p=>p.id===pid)?.status||'not_connected'})),flow:Array.isArray(snapshot.topology?.flow)?snapshot.topology.flow:[],relationships:Array.isArray(snapshot.topology?.relationships)?snapshot.topology.relationships:[]},seedSnapshot:snapshot,diagnosis:diagnoseSnapshot(snapshot),createdAt:existing?.createdAt||now,updatedAt:now,protocol:'wr3',privacy:{encryptedProviderCredentials:true,storesPasswords:false,storesFinancialRecords:false,seedEvidenceSanitized:true,liveProviderFactsPreferred:true}};
  await writeWorkspace(workspace);
  const ticket=issueTicket({workspaceId:id,clientId,siteOrigin});const base=publicBase(request);
  return json(200,{ok:true,workspaceId:id,status:workspace.status,phase:workspace.phase,ticket,connectUrl:`${base}/app.html?clientTicket=${encodeURIComponent(ticket)}`});
};
