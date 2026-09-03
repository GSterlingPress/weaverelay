(()=>{
  if(location.hostname!=='staging.weaverelay.com')return;
  document.documentElement.dataset.environment='staging';
  const style=document.createElement('style');
  style.textContent=`.wr-staging-banner{position:sticky;top:0;z-index:9999;padding:8px 14px;text-align:center;font:800 12px/1.2 system-ui;letter-spacing:.12em;background:#f4c542;color:#171717}.wr-fresh-test{margin-top:10px;width:100%}`;
  document.head.appendChild(style);
  const banner=document.createElement('div');banner.className='wr-staging-banner';banner.textContent='PREPRODUCTION · TEST DATA ONLY';document.body.prepend(banner);
  const form=document.querySelector('#loginForm');if(!form)return;
  const normal=form.querySelector('button[type="submit"]');
  const fresh=document.createElement('button');fresh.type='button';fresh.className='secondary wr-fresh-test';fresh.textContent='TEST AS A BRAND-NEW CUSTOMER →';
  fresh.onclick=async()=>{
    const email=document.querySelector('#email')?.value||'';const company=document.querySelector('#company')?.value||'';const status=document.querySelector('#loginStatus');
    if(!email){status.textContent='Enter your usual test email first.';return}
    fresh.disabled=true;normal.disabled=true;status.textContent='Creating a fresh isolated staging customer…';
    try{const r=await fetch('/api/auth/request',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,company,next:location.pathname+location.search,freshTest:true})});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||'Request failed.');status.textContent=j.message}catch(e){status.textContent=e.message}finally{fresh.disabled=false;normal.disabled=false}
  };
  form.appendChild(fresh);
})();
