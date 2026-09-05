import crypto from 'node:crypto';
import { scopedStore, deployContext } from './_scoped-store.mjs';
import { normalizeEmail, isValidEmail } from './_token.mjs';

const AUTH_VERSION='wra1';
const SESSION_COOKIE='wr_session';
const SESSION_TTL_MS=30*24*60*60*1000;
const PREVIEW_USER={id:'44c4557e395b57618c6c0664520ac6a4',email:'preview@weaverelay.local',sessionToken:null};

function requestHost(request){try{return new URL(request.url).hostname.toLowerCase()}catch{return ''}}
function isTestDeployRequest(request){
  const host=requestHost(request),context=deployContext();
  if(host==='staging.weaverelay.com')return true;
  if(host.endsWith('.netlify.app'))return true;
  return ['deploy-preview','branch-deploy'].includes(context);
}
function authSecret(value=process.env.WEAVERELAY_AUTH_SECRET||process.env.WAITLIST_TOKEN_SECRET){
  const raw=String(value||'');
  let key;
  try{key=Buffer.from(raw,'base64')}catch{}
  if(!key||key.length!==32) key=crypto.createHash('sha256').update(raw).digest();
  if(!raw||key.length!==32) throw new Error('WEAVERELAY_AUTH_SECRET must be configured.');
  return key;
}
function tokenKey(){return crypto.createHash('sha256').update(Buffer.concat([Buffer.from('magic:'),authSecret()])).digest()}
function safeNext(value){const text=String(value||'');return /^\/app\.html(?:\?|$)/.test(text)&&!text.startsWith('//')?text:'/app.html';}
export function createLoginToken(email,{now=Date.now(),ttlMs=30*60_000,next='/app.html'}={}){
  const normalized=normalizeEmail(email); if(!isValidEmail(normalized))throw new Error('Enter a valid email address.');
  const payload=Buffer.from(JSON.stringify({purpose:'login',email:normalized,next:safeNext(next),iat:now,exp:now+ttlMs,jti:crypto.randomBytes(18).toString('base64url')}));
  const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',tokenKey(),iv);cipher.setAAD(Buffer.from(AUTH_VERSION));
  const ciphertext=Buffer.concat([cipher.update(payload),cipher.final()]),tag=cipher.getAuthTag();
  return [AUTH_VERSION,iv.toString('base64url'),ciphertext.toString('base64url'),tag.toString('base64url')].join('.');
}
export function readLoginToken(token,{now=Date.now()}={}){
  const [version,ivText,dataText,tagText,extra]=String(token||'').split('.');if(version!==AUTH_VERSION||!ivText||!dataText||!tagText||extra)throw new Error('Invalid sign-in link.');
  try{const decipher=crypto.createDecipheriv('aes-256-gcm',tokenKey(),Buffer.from(ivText,'base64url'));decipher.setAAD(Buffer.from(AUTH_VERSION));decipher.setAuthTag(Buffer.from(tagText,'base64url'));const payload=JSON.parse(Buffer.concat([decipher.update(Buffer.from(dataText,'base64url')),decipher.final()]).toString('utf8'));if(payload.purpose!=='login'||!payload.email||!payload.jti)throw new Error();if(Number(payload.exp)<now)throw new Error('This sign-in link has expired.');return payload}catch(error){if(error.message==='This sign-in link has expired.')throw error;throw new Error('Invalid sign-in link.');}
}
const users=()=>scopedStore('weaverelay-users');
const sessions=()=>scopedStore('weaverelay-sessions');
const usedLinks=()=>scopedStore('weaverelay-auth-links');
const sha=v=>crypto.createHash('sha256').update(String(v)).digest('hex');
export async function consumeLoginToken(token){
  const claims=readLoginToken(token),usedKey=`used/${sha(claims.jti)}.json`,linkStore=usedLinks();
  const existing=await linkStore.get(usedKey,{type:'json'});if(existing)throw new Error('This sign-in link has already been used.');
  const claimId=crypto.randomBytes(18).toString('base64url'),usedAt=new Date().toISOString();
  await linkStore.setJSON(usedKey,{claimId,usedAt,expiresAt:new Date(claims.exp).toISOString()});
  const claimed=await linkStore.get(usedKey,{type:'json'});if(claimed?.claimId!==claimId)throw new Error('This sign-in link has already been used.');
  const userId=sha(claims.email).slice(0,32),now=new Date().toISOString(),userStore=users();
  const current=await userStore.get(`user/${userId}.json`,{type:'json'});const isNewUser=!current;const user={id:userId,email:claims.email,createdAt:current?.createdAt||now,lastSignedInAt:now};
  await userStore.setJSON(`user/${userId}.json`,user);
  const raw=crypto.randomBytes(32).toString('base64url'),session={userId,email:claims.email,createdAt:now,expiresAt:new Date(Date.now()+SESSION_TTL_MS).toISOString()};
  await sessions().setJSON(`session/${sha(raw)}.json`,session);return{user,sessionToken:raw,next:safeNext(claims.next),isNewUser};
}
export function sessionCookie(token){return `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS/1000)}`}
export function clearSessionCookie(){return `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`}
function parseCookies(request){const text=request.headers.get('cookie')||'';return Object.fromEntries(text.split(';').map(v=>v.trim()).filter(Boolean).map(part=>{const i=part.indexOf('=');return i<0?[part,'']:[part.slice(0,i),decodeURIComponent(part.slice(i+1))]}));}
export async function currentUser(request){
  if(isTestDeployRequest(request))return PREVIEW_USER;
  const raw=parseCookies(request)[SESSION_COOKIE];if(!raw)return null;const key=`session/${sha(raw)}.json`,sessionStore=sessions(),session=await sessionStore.get(key,{type:'json'}).catch(()=>null);if(!session)return null;if(Date.parse(session.expiresAt)<Date.now()){await sessionStore.delete(key).catch(()=>{});return null}return{id:session.userId,email:session.email,sessionToken:raw};
}
export async function requireUser(request){const user=await currentUser(request);if(!user){const error=new Error('Sign in to WeaveRelay first.');error.status=401;throw error;}return user;}
export async function destroySession(request){if(isTestDeployRequest(request))return;const raw=parseCookies(request)[SESSION_COOKIE];if(raw)await sessions().delete(`session/${sha(raw)}.json`).catch(()=>{});}
