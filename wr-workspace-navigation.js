(()=>{
  const workspaceHref=id=>`/app.html?w=${encodeURIComponent(id)}`;
  const activate=card=>{
    const id=card?.dataset?.id;
    if(!id)return;
    card.setAttribute('aria-label',`Open ${card.querySelector('strong')?.textContent||'website'}`);
    card.title='Open website dashboard';
    card.dataset.href=workspaceHref(id);
  };
  const decorate=()=>document.querySelectorAll('#workspaceList .workspace-link').forEach(activate);
  const host=document.querySelector('#workspaceList');
  if(host){
    new MutationObserver(decorate).observe(host,{childList:true,subtree:true});
  }
  decorate();
})();
