import crypto from 'node:crypto';
import { scopedStore } from './_scoped-store.mjs';

const HOUR_MS=60*60*1000;
const EMAIL_LIMIT=5;
const IP_LIMIT=25;
const clean=v=>String(v??'').trim().toLowerCase();
const secret=()=>String(process.env.WEAVERELAY_AUTH_SECRET||process.env.WAITLIST_TOKEN_SECRET||'weaverelay-rate-limit');
const hash=v=>crypto.createHmac('sha256',secret()).update(clean(v)).digest('hex');
const hourBucket=now=>Math.floor(now/HOUR_MS);

function clientIp(request){
  return clean(request.headers.get('x-nf-client-connection-ip')||request.headers.get('cf-connecting-ip')||(request.headers.get('x-forwarded-for')||'').split(',')[0]||'unknown');
}
async function bump(store,key,limit,now){
  const current=await store.get(key,{type:'json'}).catch(()=>null),count=Number(current?.count||0);
  if(count>=limit){const error=new Error('Too many sign-in requests. Please wait and try again.');error.status=429;throw error;}
  await store.setJSON(key,{count:count+1,updatedAt:new Date(now).toISOString()});
}
export async function enforceAuthRequestLimit(request,email,{now=Date.now()}={}){
  const store=scopedStore('weaverelay-auth-rate'),bucket=hourBucket(now);
  await bump(store,`email/${hash(email)}/${bucket}.json`,EMAIL_LIMIT,now);
  await bump(store,`ip/${hash(clientIp(request))}/${bucket}.json`,IP_LIMIT,now);
}
