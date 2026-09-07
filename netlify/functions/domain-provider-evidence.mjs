import dns from'node:dns/promises';
import{requireUser}from'./_auth.mjs';
import{requireWorkspace}from'./_workspace-store.mjs';
import{json,safeError}from'./_http.mjs';

const HOST_PATTERNS=[
  [/\.up\.railway\.app$/,'railway','provider-owned hostname'],
  [/\.netlify\.app$/,'netlify','provider-owned hostname'],
  [/\.vercel\.app$/,'vercel','provider-owned hostname'],
  [/\.onrender\.com$/,'render','provider-owned hostname'],
  [/\.pages\.dev$/,'cloudflare','Cloudflare Pages hostname'],
  [/\.supabase\.co$/,'supabase','Supabase hostname'],
  [/\.vercel-dns\.com$/,'vercel','DNS CNAME target'],
  [/\.netlify\.global$/,'netlify','DNS CNAME target']
];
const add=(map,provider,reason)=>{if(!map.has(provider))map.set(provider,new Set());map.get(provider).add(reason)};
const matchHost=(map,host,prefix='')=>{for(const [pattern,provider,reason] of HOST_PATTERNS)if(pattern.test(host))add(map,provider,prefix?`${prefix}: ${reason}`:reason)};

export default async request=>{if(request.method!=='GET')return json(405,{error:'Method not allowed.'});try{const user=await requireUser(request),url=new URL(request.url),workspace=await requireWorkspace(user.id,url.searchParams.get('id'));let host='';try{host=new URL(workspace.siteOrigin).hostname.toLowerCase()}catch{return json(200,{ok:true,providers:[],reason:'invalid-site-origin'})}const evidence=new Map();matchHost(evidence,host);try{for(const cname of await dns.resolveCname(host))matchHost(evidence,String(cname).toLowerCase(),'DNS')}catch{}try{for(const ns of await dns.resolveNs(host)){const value=String(ns).toLowerCase();if(value.includes('cloudflare.com'))add(evidence,'cloudflare','authoritative nameserver');if(value.includes('netlify.com'))add(evidence,'netlify','authoritative nameserver')} }catch{}const providers=[...evidence].map(([provider,reasons])=>({provider,status:'detected',evidence:[...reasons]}));return json(200,{ok:true,providers,checkedHost:host,checkedAt:new Date().toISOString()})}catch(error){return safeError(error)}};
