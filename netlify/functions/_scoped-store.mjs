import crypto from 'node:crypto';
import { getStore } from '@netlify/blobs';

const clean=v=>String(v??'').trim();
const safe=v=>clean(v).toLowerCase().replace(/[^a-z0-9-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,24)||'unknown';
const digest=v=>crypto.createHash('sha256').update(clean(v)).digest('hex').slice(0,10);

export function deployContext(){return clean(process.env.CONTEXT||process.env.DEPLOY_CONTEXT||'unknown').toLowerCase();}
export function isProductionContext(){return deployContext()==='production';}
export function scopedStoreName(base){
  const name=safe(base).slice(0,42);
  if(isProductionContext())return name;
  const identity=process.env.DEPLOY_ID||process.env.BRANCH||process.env.DEPLOY_PRIME_URL||deployContext();
  return `${name}-${safe(deployContext()).slice(0,10)}-${digest(identity)}`.slice(0,64);
}
export function scopedStore(base,{consistency='strong'}={}){
  return getStore({name:scopedStoreName(base),consistency});
}
