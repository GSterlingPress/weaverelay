(()=>{
  const workspaceHref=id=>`/app.html?w=${encodeURIComponent(id)}`;
  const activate=card=>{
    const id=card?.dataset?.id;
    if(!id)return;
    const href=workspaceHref(id);
    card.setAttribute('aria-label',`Open ${card.querySelector('strong')?.textContent||'website'}`);
    card.title='Open website dashboard';
    card.dataset.href=href;
  };
  const decorate=()=>document.querySelectorAll('#workspaceList .workspace-link').forEach(activate);
  const host=document.querySelector('#workspaceList');
  if(host){
    new MutationObserver(decorate).observe(host,{childList:true,subtree:true});
    host.addEventListener('click',event=>{
      const card=event.target.closest('.workspace-link');
      if(!card||!card.dataset.id)return;
      event.preventDefault();
      event.stopImmediatePropagation();
      location.assign(workspaceHref(card.dataset.id));
    },true);
    host.addEventListener('keydown',event=>{
      if(event.key!=='Enter'&&event.key!==' ')return;
      const card=event.target.closest('.workspace-link');
      if(!card||!card.dataset.id)return;
      event.preventDefault();
      event.stopImmediatePropagation();
      location.assign(workspaceHref(card.dataset.id));
    },true);
  }
  decorate();
})();
