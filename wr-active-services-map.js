(()=>{
  const LABELS={github:'GitHub',netlify:'Netlify',railway:'Railway',supabase:'Supabase',stripe:'Stripe',runpod:'RunPod',comfyui:'ComfyUI',vercel:'Vercel',render:'Render',cloudflare:'Cloudflare',neon:'Neon',resend:'Resend'};
  const DESCRIPTIONS={github:'Source code & deployments',netlify:'Hosting & deploys',railway:'Backend runtime',supabase:'Database & auth',stripe:'Payments',runpod:'GPU compute',comfyui:'AI workflow runtime',vercel:'Frontend hosting',render:'App hosting',cloudflare:'DNS & edge',neon:'Database',resend:'Transactional email'};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const style=document.createElement('style');
  style.textContent=`
    #stackMap.active-service-map{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;align-items:stretch}
    #stackMap .service-status-card{position:relative;min-height:118px;border:2px solid;border-radius:16px;padding:15px;background:#0b120e;display:flex;flex-direction:column;gap:7px;box-shadow:0 10px 30px rgba(0,0,0,.14)}
    #stackMap .service-status-card.good{border-color:#25c96b;background:linear-gradient(180deg,rgba(37,201,107,.09),#0b120e 52%)}
    #stackMap .service-status-card.warn{border-color:#e7bd34;background:linear-gradient(180deg,rgba(231,189,52,.08),#0b120e 52%)}
    #stackMap .service-status-card.bad{border-color:#ef4d5a;background:linear-gradient(180deg,rgba(239,77,90,.09),#0b120e 52%)}
    #stackMap .service-name{display:flex;align-items:center;gap:9px;font-size:16px;font-weight:850;color:#f2f6f4}
    #stackMap .service-dot{width:12px;height:12px;border-radius:50%;flex:0 0 auto;box-shadow:0 0 18px currentColor}
    #stackMap .good .service-dot{background:#25d86f;color:#25d86f}#stackMap .warn .service-dot{background:#f1c93b;color:#f1c93b}#stackMap .bad .service-dot{background:#ff5260;color:#ff5260}
    #stackMap .service-state{font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.06em}
    #stackMap .good .service-state{color:#69e899}#stackMap .warn .service-state{color:#f3d56d}#stackMap .bad .service-state{color:#ff9299}
    #stackMap .service-detail{margin-top:auto;color:#84968c;font-size:11px;line-height:1.35}
    #stackMap .map-empty{grid-column:1/-1;color:#84968c}
    .map-legend{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px;color:#91a198;font-size:11px}
    .map-legend span{display:flex;align-items:center;gap:6px}.map-legend i{width:9px;height:9px;border-radius:50%;display:inline-block}.map-legend .g{background:#25d86f}.map-legend .y{background:#f1c93b}.map-legend .r{background:#ff5260}
    @media(max-width:600px){#stackMap.active-service-map{grid-template-columns:repeat(2,minmax(0,1fr))}#stackMap .service-status-card{min-height:108px;padding:13px}}
  `;
  document.head.appendChild(style);

  function classify(card){
    const chip=card.querySelector('.chip');
    const text=(chip?.textContent||'').trim().toLowerCase();
    if(card.classList.contains('needs-fix')||chip?.classList.contains('bad')||/fail|error|revoked|broken/.test(text))return{cls:'bad',label:'Problem'};
    if(chip?.classList.contains('good')||/connected|pass|healthy/.test(text))return{cls:'good',label:'Healthy'};
    return{cls:'warn',label:/not connected/.test(text)?'Needs connection':'Check needed'};
  }

  function render(){
    const providers=document.querySelector('#providers'),map=document.querySelector('#stackMap');
    if(!providers||!map)return;
    const cards=[...providers.querySelectorAll('.provider-card')].filter(card=>!card.classList.contains('coming-soon'));
    if(!cards.length)return;
    const services=cards.map(card=>{
      const id=card.dataset.provider||'';
      const name=card.querySelector('.provider-top strong')?.textContent?.trim()||LABELS[id]||id;
      const status=classify(card);
      return{id,name,status,detail:DESCRIPTIONS[id]||'Active service'};
    });
    map.className='active-service-map';
    map.innerHTML=services.map(s=>`<div class="service-status-card ${s.status.cls}" data-provider="${esc(s.id)}"><div class="service-name"><i class="service-dot"></i><span>${esc(s.name)}</span></div><div class="service-state">${esc(s.status.label)}</div><div class="service-detail">${esc(s.detail)}</div></div>`).join('');
    let legend=map.parentElement.querySelector('.map-legend');
    if(!legend){legend=document.createElement('div');legend.className='map-legend';map.after(legend)}
    legend.innerHTML='<span><i class="g"></i>Green = healthy</span><span><i class="y"></i>Yellow = needs attention</span><span><i class="r"></i>Red = broken</span>';
  }

  const providers=document.querySelector('#providers');
  if(providers)new MutationObserver(()=>queueMicrotask(render)).observe(providers,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  document.addEventListener('DOMContentLoaded',render,{once:true});
  setTimeout(render,0);
})();