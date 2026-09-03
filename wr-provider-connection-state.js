(()=>{
const C={
 github:{label:'GitHub',method:'oauth',connect:'AUTHORIZE GITHUB'},
 netlify:{label:'Netlify',method:'credential',connect:'CONNECT NETLIFY'},
 railway:{label:'Railway',method:'oauth',connect:'SELECT PROJECT → AUTHORIZE READ-ONLY'},
 supabase:{label:'Supabase',method:'credential',connect:'CONNECT SUPABASE'},
 stripe:{label:'Stripe',method:'credential',connect:'CONNECT STRIPE'},
 runpod:{label:'RunPod',method:'credential',connect:'CONNECT RUNPOD'},
 comfyui:{label:'ComfyUI',method:'auto-detect',connect:'AUTO-DETECT FROM RUNTIME'},
 vercel:{label:'Vercel',method:'credential',connect:'CONNECT VERCEL'},
 render:{label:'Render',method:'credential',connect:'CONNECT RENDER'},
 cloudflare:{label:'Cloudflare',method:'credential',connect:'CONNECT CLOUDFLARE'},
 neon:{label:'Neon',method:'credential',connect:'CONNECT NEON'},
 resend:{label:'Resend',method:'credential',connect:'CONNECT RESEND'}
};
const id=()=>new URLSearchParams(location.search).get('w')||'';
const api=async(url,options={})=>{const r=await fetch(url,{...options,headers:{'content-type':'application/json',...(options.headers||{})}}),j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||'Request failed.');return j};
let timer=null,lastSignature='';
function chip(card,text,kind){const c=card?.querySelector('.chip');if(!c)return;c.textContent=text;c.classList.remove('good','warn','bad');c.classList.add(kind)}
function button(card){return card?.querySelector('.provider-action,.expanded-provider-connect')||null}
function stateOf(provider,connection){return String(connection?.status||provider?.status||'not_connected')}
function renderNextFix(diagnosis){const box=document.querySelector('#nextFixGuide'),first=diagnosis?.findings?.[0];if(!box||!first)return;const contract=C[first.provider];if(!contract)return;box.className='next-fix-guide attention-guide';box.innerHTML=`<strong>NEXT FIX</strong><span>WeaveRelay found the next problem at ${contract.label}. Open the ${contract.label} card or the diagnosis below to continue with the closest proven fix.</span>`}
async function recheckComfy(buttonEl,runpodConnected){
 if(!runpodConnected){document.querySelector('.provider-card[data-provider="runpod"]')?.scrollIntoView({behavior:'smooth',block:'center'});return}
 const workspaceId=id();if(!workspaceId)return;const old=buttonEl.textContent;buttonEl.disabled=true;buttonEl.textContent='RECHECKING…';
 try{await api('/api/provider/probe',{method:'POST',body:JSON.stringify({workspaceId,provider:'runpod'})});location.reload()}catch(error){alert(error.message);buttonEl.disabled=false;buttonEl.textContent=old}
}
async function normalize(){
 const workspaceId=id(),host=document.querySelector('#providers');if(!workspaceId||!host)return;
 let j;try{j=await api(`/api/workspace?id=${encodeURIComponent(workspaceId)}`)}catch{return}
 const providers=Object.fromEntries((j.workspace?.providers||[]).map(p=>[p.id,p])),connections=j.connections||{};
 const signature=Object.keys(C).map(k=>`${k}:${stateOf(providers[k],connections[k])}`).join('|');
 if(signature===lastSignature&&host.dataset.wrConnectionNormalized==='1')return;lastSignature=signature;host.dataset.wrConnectionNormalized='1';
 for(const [providerId,contract] of Object.entries(C)){
   const card=host.querySelector(`.provider-card[data-provider="${providerId}"]`);if(!card)continue;
   const provider=providers[providerId],connection=connections[providerId],status=stateOf(provider,connection),b=button(card);
   if(providerId==='comfyui'){
     const runpodConnected=stateOf(providers.runpod,connections.runpod)==='connected';
     if(status==='connected'){chip(card,'AUTO-DETECTED','good');if(b){b.disabled=false;b.textContent='RECHECK VIA RUNPOD';b.onclick=e=>{e.preventDefault();e.stopPropagation();recheckComfy(b,runpodConnected)}}}
     else if(status==='error'||status==='needs_action'){chip(card,'NEEDS ACTION','bad');if(b){b.disabled=false;b.textContent=runpodConnected?'RECHECK VIA RUNPOD':'CONNECT RUNPOD FIRST';b.onclick=e=>{e.preventDefault();e.stopPropagation();recheckComfy(b,runpodConnected)}}}
     else{chip(card,'AUTO-DETECT','warn');if(b){b.disabled=false;b.textContent=runpodConnected?'CHECK VIA RUNPOD':'CONNECT RUNPOD FIRST';b.onclick=e=>{e.preventDefault();e.stopPropagation();recheckComfy(b,runpodConnected)}}}
     continue;
   }
   if(status==='connected'){chip(card,'CONNECTED','good');if(b)b.textContent='VERIFY LIVE'}
   else if(status==='error'||status==='revoked'||status==='needs_action'){chip(card,'NEEDS ACTION','bad');if(b)b.textContent=`RECONNECT ${contract.label.toUpperCase()}`}
   else{chip(card,'CONNECT','warn');if(b)b.textContent=contract.connect}
 }
 renderNextFix(j.workspace?.diagnosis);
}
function schedule(){clearTimeout(timer);timer=setTimeout(normalize,180)}
const host=document.querySelector('#providers');if(host)new MutationObserver(schedule).observe(host,{childList:true,subtree:true});
document.addEventListener('DOMContentLoaded',schedule);window.addEventListener('popstate',()=>{lastSignature='';schedule()});schedule();
})();
