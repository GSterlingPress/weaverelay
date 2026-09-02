(()=>{
  const PROVIDERS=[
    ['github','GitHub'],['netlify','Netlify'],['vercel','Vercel'],['railway','Railway'],['render','Render'],
    ['supabase','Supabase'],['neon','Neon'],['stripe','Stripe'],['cloudflare','Cloudflare'],['resend','Resend'],['runpod','RunPod'],['comfyui','ComfyUI']
  ];
  const providerLabel=id=>PROVIDERS.find(([key])=>key===id)?.[1]||id;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const api=async(url,options={})=>{const r=await fetch(url,{...options,headers:{'content-type':'application/json',...(options.headers||{})}});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||'Request failed.');return j};
  let activeWorkspace=null,lastSignature='';

  function workspaceId(){return new URLSearchParams(location.search).get('w')||''}
  function detectedFromWorkspace(w,connections){
    const text=[w.siteOrigin,...(w.stackMap?.flow||[]),...(w.diagnosis?.findings||[]).flatMap(f=>[f.provider,f.title,f.explanation])].join(' ').toLowerCase();
    const detected=new Set();
    for(const [id,label] of PROVIDERS){if(text.includes(id)||text.includes(label.toLowerCase()))detected.add(id)}
    try{
      const host=new URL(w.siteOrigin||'').hostname.toLowerCase();
      if(host.endsWith('.netlify.app'))detected.add('netlify');
      if(host.endsWith('.vercel.app'))detected.add('vercel');
      if(host.endsWith('.onrender.com'))detected.add('render');
      if(host.endsWith('.up.railway.app'))detected.add('railway');
      if(host.endsWith('.supabase.co'))detected.add('supabase');
    }catch{}
    for(const [id,c] of Object.entries(connections||{}))if(c?.status==='connected')detected.add(id);
    return [...detected]
  }

  function connectionState(id){
    const card=document.querySelector(`.provider-card[data-provider="${CSS.escape(id)}"]`);
    if(!card)return 'unavailable';
    const button=card.querySelector('.provider-action');
    if(button?.dataset.connected==='1')return 'connected';
    return 'available'
  }

  function scrollToProvider(id){
    const card=document.querySelector(`.provider-card[data-provider="${CSS.escape(id)}"]`);
    if(!card)return;
    card.scrollIntoView({behavior:'smooth',block:'center'});
    card.classList.add('onboarding-focus');setTimeout(()=>card.classList.remove('onboarding-focus'),1400)
  }

  function render(w,connections){
    const workspace=document.querySelector('#workspace');
    if(!workspace||workspace.classList.contains('hidden'))return;
    let panel=document.querySelector('#websiteOnboarding');
    if(!panel){
      panel=document.createElement('section');panel.id='websiteOnboarding';panel.className='panel onboarding-panel';
      const firstPanel=workspace.querySelector('.panel');
      workspace.insertBefore(panel,firstPanel||workspace.firstChild)
    }
    const detected=detectedFromWorkspace(w,connections);
    const connected=detected.filter(id=>connectionState(id)==='connected');
    const needsConnection=detected.filter(id=>connectionState(id)==='available');
    const hasDiagnosis=!!w.diagnosis;
    const firstConnect=needsConnection[0]||(!connections?.github?'github':null);
    const site=w.siteOrigin||'your website';
    let headline='We found your website. Now let’s connect what powers it.';
    let detail='WeaveRelay checks the public site first, then uses connected providers to prove how the pieces fit together.';
    if(detected.length) {headline='We found your likely stack.';detail='These are services WeaveRelay can see in the current public evidence or has already connected. Connect the missing ones so we can prove the relationships.'}
    if(hasDiagnosis&&connected.length){headline='Your stack is taking shape.';detail='WeaveRelay now has enough evidence to map connected systems and tell you where a failure actually crosses between them.'}
    const chips=detected.length?detected.map(id=>`<button class="stack-chip ${connectionState(id)}" data-onboard-provider="${esc(id)}"><span>${esc(providerLabel(id))}</span><small>${connectionState(id)==='connected'?'CONNECTED':'FOUND'}</small></button>`).join(''):'<span class="scan-empty">No backend provider is proven from the public page yet. That’s normal—GitHub is usually the best first connection.</span>';
    panel.innerHTML=`
      <div class="eyebrow2">WEBSITE → STACK → CONNECT → DIAGNOSE</div>
      <div class="onboarding-head"><div><h2>${esc(headline)}</h2><p>${esc(detail)}</p></div><span class="site-pill">${esc(site)}</span></div>
      <div class="onboarding-steps">
        <div class="onboarding-step done"><b>1</b><div><strong>Website added</strong><span>We know which public app to watch.</span></div></div>
        <div class="onboarding-step ${detected.length?'done':'active'}"><b>2</b><div><strong>Find the stack</strong><span>${detected.length?`${detected.length} likely service${detected.length===1?'':'s'} found.`:'We’ll combine public evidence with your first provider connection.'}</span></div></div>
        <div class="onboarding-step ${connected.length?'done':'active'}"><b>3</b><div><strong>Connect services</strong><span>${connected.length?`${connected.length} connected.`:'Authorize only the services this app actually uses.'}</span></div></div>
        <div class="onboarding-step ${hasDiagnosis?'done':connected.length?'active':''}"><b>4</b><div><strong>Run diagnosis</strong><span>${hasDiagnosis?'Live evidence is available below.':'We’ll map the relationships and give you one operational answer.'}</span></div></div>
      </div>
      <div class="detected-stack"><div class="detected-title">${detected.length?'LIKELY SERVICES':'STACK DISCOVERY'}</div><div class="detected-chips">${chips}</div></div>
      <div class="onboarding-next"><div><span>BEST NEXT STEP</span><strong>${firstConnect?`Connect ${providerLabel(firstConnect)}`:hasDiagnosis?'Review your diagnosis':'Run live diagnosis'}</strong><p>${firstConnect?'We’ll use that connection to discover and verify more of the stack.':hasDiagnosis?'Start with the first finding below.':'We have enough connected evidence to check the app now.'}</p></div><button class="primary" id="onboardingNext">${firstConnect?`CONNECT ${providerLabel(firstConnect).toUpperCase()}`:hasDiagnosis?'VIEW DIAGNOSIS':'RUN DIAGNOSIS'}</button></div>`;
    panel.querySelectorAll('[data-onboard-provider]').forEach(b=>b.onclick=()=>scrollToProvider(b.dataset.onboardProvider));
    panel.querySelector('#onboardingNext').onclick=()=>{
      if(firstConnect){scrollToProvider(firstConnect);const btn=document.querySelector(`.provider-card[data-provider="${CSS.escape(firstConnect)}"] .provider-action`);if(btn)setTimeout(()=>btn.click(),350);return}
      if(hasDiagnosis){document.querySelector('#diagnosis')?.scrollIntoView({behavior:'smooth',block:'start'});return}
      document.querySelector('#diagnose')?.click()
    }
  }

  async function refresh(){
    const id=workspaceId();if(!id||id===activeWorkspace&&document.querySelector('#workspace')?.classList.contains('hidden'))return;
    try{
      const j=await api(`/api/workspace?id=${encodeURIComponent(id)}`),w=j.workspace||{},connections=j.connections||{};
      const signature=JSON.stringify([id,w.updatedAt,w.diagnosis?.status,w.diagnosis?.headline,Object.entries(connections).map(([k,v])=>[k,v?.status])]);
      if(signature===lastSignature&&document.querySelector('#websiteOnboarding'))return;
      activeWorkspace=id;lastSignature=signature;render(w,connections)
    }catch{}
  }
  const observer=new MutationObserver(()=>{clearTimeout(observer._t);observer._t=setTimeout(refresh,80)});
  observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
  window.addEventListener('popstate',refresh);window.addEventListener('focus',refresh);
  setInterval(refresh,2500);setTimeout(refresh,200);
})();
