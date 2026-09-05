import crypto from 'node:crypto';
import { getStore } from '@netlify/blobs';

const clean=v=>String(v??'').trim();
const safe=v=>clean(v).toLowerCase().replace(/[^a-z0-9-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,24)||'unknown';
const digest=v=>crypto.createHash('sha256').update(clean(v)).digest('hex').slice(0,10);
const runtimeEnv=key=>{try{return globalThis.Netlify?.env?.get?.(key)||''}catch{return ''}};

export function deployContext(){return clean(runtimeEnv('CONTEXT')||runtimeEnv('DEPLOY_CONTEXT')||'unknown').toLowerCase();}
export function isProductionContext(){return deployContext()==='production';}
export function scopedStoreName(base){
  const name=safe(base).slice(0,42);
  if(isProductionContext())return name;
  // Branch is stable across repeated Deploy Preview builds; DEPLOY_ID is not.
  // Prefer stable identities so a new commit does not wipe the preview workspace/OAuth state.
  const identity=runtimeEnv('BRANCH')||runtimeEnv('DEPLOY_PRIME_URL')||runtimeEnv('DEPLOY_ID')||deployContext();
  return `${name}-${safe(deployContext()).slice(0,10)}-${digest(identity)}`.slice(0,64);
}
export function scopedStore(base,{consistency='strong'}={}){
  return getStore({name:scopedStoreName(base),consistency});
}
