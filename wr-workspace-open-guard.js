(()=>{
  const selected=()=>new URLSearchParams(location.search).get('w')||'';
  const show=message=>{
    if(!selected())return;
    const workspace=document.querySelector('#workspace');
    if(workspace&&!workspace.classList.contains('hidden'))return;
    const empty=document.querySelector('#empty');
    if(!empty)return;
    empty.classList.remove('hidden');
    const safe=String(message||'The website workspace could not be opened.').replace(/[<>]/g,'').slice(0,240);
    empty.innerHTML=`<h2>WeaveRelay could not open this website.</h2><p>${safe}</p><p class="muted">Your saved website has not been deleted. Refresh once after the latest production publish; if this remains, WeaveRelay now exposes the exact open failure instead of silently doing nothing.</p>`;
  };
  window.addEventListener('unhandledrejection',event=>show(event.reason?.message||event.reason));
  window.addEventListener('error',event=>show(event.error?.message||event.message));
  setTimeout(()=>{
    if(selected()&&document.querySelector('#workspace')?.classList.contains('hidden'))show('The saved workspace did not finish loading.');
  },2500);
})();
