import dns from 'node:dns/promises';
import net from 'node:net';

const clean=v=>String(v??'').trim();
const blockedHostnames=new Set(['localhost','localhost.localdomain','metadata.google.internal','metadata','169.254.169.254','100.100.100.200']);

function privateV4(ip){
  const p=ip.split('.').map(Number);if(p.length!==4||p.some(n=>!Number.isInteger(n)||n<0||n>255))return true;
  const [a,b]=p;
  return a===0||a===10||a===127||(a===100&&b>=64&&b<=127)||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&b===0)||(a===192&&b===168)||(a===198&&(b===18||b===19))||a>=224;
}
function privateV6(ip){
  const value=ip.toLowerCase();
  if(value==='::'||value==='::1')return true;
  if(value.startsWith('fc')||value.startsWith('fd')||/^fe[89ab]/.test(value))return true;
  if(value.startsWith('2001:db8:'))return true;
  const mapped=value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);return mapped?privateV4(mapped[1]):false;
}
export function isPrivateAddress(ip){const kind=net.isIP(ip);return kind===4?privateV4(ip):kind===6?privateV6(ip):true;}
export function normalizePublicOrigin(value,{allowLocalDev=false}={}){
  const u=new URL(clean(value));
  const dev=allowLocalDev&&['localhost','127.0.0.1','::1'].includes(u.hostname);
  if((u.protocol!=='https:'&&!dev)||u.username||u.password)throw new Error('Enter a valid public HTTPS site URL.');
  const host=u.hostname.toLowerCase();
  if(!dev&&(blockedHostnames.has(host)||host.endsWith('.localhost')||host.endsWith('.local')||net.isIP(host)&&isPrivateAddress(host)))throw new Error('Enter a public HTTPS site URL, not a private or local address.');
  return u.origin;
}
export async function assertPublicUrl(value,{allowLocalDev=false}={}){
  const origin=normalizePublicOrigin(value,{allowLocalDev}),u=new URL(value,origin),host=u.hostname.toLowerCase();
  if(allowLocalDev&&['localhost','127.0.0.1','::1'].includes(host))return u;
  if(net.isIP(host)){if(isPrivateAddress(host))throw new Error('Private network destinations are not allowed.');return u;}
  let records=[];try{records=await dns.lookup(host,{all:true,verbatim:true})}catch{throw new Error('The website hostname could not be resolved safely.');}
  if(!records.length||records.some(r=>isPrivateAddress(r.address)))throw new Error('Private network destinations are not allowed.');
  return u;
}
export async function publicFetch(value,options={}, {fetchImpl=fetch,allowLocalDev=false,maxRedirects=5}={}){
  let current=await assertPublicUrl(value,{allowLocalDev});
  for(let i=0;i<=maxRedirects;i++){
    const response=await fetchImpl(current,{...options,redirect:'manual'});
    if(response.status<300||response.status>=400)return response;
    const location=response.headers?.get?.('location');if(!location)return response;
    if(i===maxRedirects)throw new Error('Too many redirects.');
    current=await assertPublicUrl(new URL(location,current).href,{allowLocalDev});
  }
  throw new Error('Too many redirects.');
}
