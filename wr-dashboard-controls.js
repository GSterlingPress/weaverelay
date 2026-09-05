(()=>{
  const modal=()=>document.querySelector('#modal');
  const openCreate=event=>{
    const trigger=event.target.closest('#newWorkspace,#emptyCreate');
    if(!trigger)return;
    const target=modal();
    if(!target)return;
    event.preventDefault();
    target.classList.remove('hidden');
    const first=target.querySelector('#newName');
    if(first)requestAnimationFrame(()=>first.focus());
  };
  const startNetlifyOAuth=async event=>{
    const trigger=event.target.closest('.provider-action[data-provider="netlify"]');
    if(!trigger||trigger.dataset.connected==='1')return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const workspaceId=new URL(location.href).searchParams.get('w');
    if(!workspaceId){alert('Open the website workspace before connecting Netlify.');return}
    trigger.disabled=true;
    const original=trigger.textContent;
    trigger.textContent='OPENING NETLIFY…';
    try{
      const response=await fetch('/api/provider/start',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({workspaceId,provider:'netlify'})}),data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||'Netlify authorization could not start.');
      if(!data.authorizationUrl)throw new Error('Netlify authorization URL was not returned.');
      location.assign(data.authorizationUrl);
    }catch(error){alert(error.message);trigger.disabled=false;trigger.textContent=original}
  };
  document.addEventListener('click',openCreate,true);
  document.addEventListener('click',startNetlifyOAuth,true);
})();
