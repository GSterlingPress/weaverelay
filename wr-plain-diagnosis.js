(()=>{
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const LABEL={github:'GitHub',netlify:'Netlify',vercel:'Vercel',railway:'Railway',render:'Render',supabase:'Supabase',neon:'Neon',stripe:'Stripe',cloudflare:'Cloudflare',resend:'Resend',runpod:'RunPod',comfyui:'ComfyUI'};
  const api=async url=>{const r=await fetch(url,{headers:{'content-type':'application/json'}}),j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||'Request failed.');return j};
  let signature='';
  const workspaceId=()=>new URLSearchParams(location.search).get('w')||'';
  function outcome(first){
    if(!first)return {kind:'clear',label:'NO ACTION NEEDED',text:'WeaveRelay did not find a proven cross-system break in the evidence it has right now.'};
    if(first.repair?.supported)return {kind:'fix',label:'FIX IT',text:'WeaveRelay has a narrowly supported repair for this problem. You will see exactly what it will change before anything is written.'};
    if(first.openProvider?.url||(first.actions||[]).length)return {kind:'guide',label:'SHOW ME HOW',text:'WeaveRelay can identify the next action, but it does not have enough safe proof or permission to make this change for you.'};
    return {kind:'evidence',label:'NOT ENOUGH EVIDENCE',text:'WeaveRelay will not guess. Connect or verify the missing service evidence before treating this as safely repairable.'};
  }
  function where(first){if(!first)return 'No proven break found';const p=first.provider&&LABEL[first.provider];return p?`${p}${first.title?` — ${first.title}`:''}`:(first.title||'A cross-system boundary needs attention')}
  function happening(d,first){
    if(!first&&d.status==='healthy')return 'Your connected systems look healthy right now.';
    if(!first)return d.headline||'No proven break was found in the current evidence.';
    return d.headline||first.title||'WeaveRelay found a problem that needs attention.'
  }
  function render(d){
    const host=document.querySelector('#diagnosis');if(!host||!d)return;
    let card=document.querySelector('#plainDiagnosis');if(!card){card=document.createElement('section');card.id='plainDiagnosis';card.className='plain-diagnosis';host.parentNode.insertBefore(card,host)}
    const first=(d.findings||[])[0],o=outcome(first),evidence=first?.explanation||d.summary||'WeaveRelay is using the live evidence currently available for this app.';
    card.className=`plain-diagnosis plain-${o.kind}`;
    card.innerHTML=`<div class="plain-kicker">ONE ANSWER</div><div class="plain-answer"><div><span>WHAT’S HAPPENING</span><strong>${esc(happening(d,first))}</strong></div><div><span>WHERE IT BREAKS</span><strong>${esc(where(first))}</strong></div><div><span>WHAT WE KNOW</span><p>${esc(evidence)}</p></div></div><div class="plain-action"><div><span>WHAT TO DO</span><strong>${esc(o.label)}</strong><p>${esc(o.text)}</p></div>${first?'<button id="plainNext" class="primary">'+esc(o.label)+' →</button>':''}</div>`;
    const b=card.querySelector('#plainNext');if(b)b.onclick=()=>{const finding=host.querySelector('.finding');if(!finding)return;finding.scrollIntoView({behavior:'smooth',block:'center'});finding.classList.add('focus-fix');setTimeout(()=>finding.classList.remove('focus-fix'),1600);if(o.kind==='fix'){const fix=finding.querySelector('.finding-fix');if(fix)setTimeout(()=>fix.focus(),450)}}
  }
  async function refresh(){const id=workspaceId();if(!id)return;try{const j=await api(`/api/workspace?id=${encodeURIComponent(id)}`),d=j.workspace?.diagnosis;if(!d)return;const s=JSON.stringify([id,d.status,d.headline,d.summary,(d.findings||[]).map(f=>[f.id,f.title,f.severity,f.provider,f.repair?.type,f.repair?.supported])]);if(s===signature&&document.querySelector('#plainDiagnosis'))return;signature=s;render(d)}catch{}}
  const observer=new MutationObserver(()=>{clearTimeout(observer._t);observer._t=setTimeout(refresh,100)});observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});window.addEventListener('popstate',refresh);setInterval(refresh,2500);setTimeout(refresh,250)
})();
