(()=>{
  async function api(url,options={}){const r=await fetch(url,{...options,headers:{'content-type':'application/json',...(options.headers||{})}}),j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||'Request failed.');return j}
  document.addEventListener('click',async event=>{
    const button=event.target.closest?.('.finding-fix[data-repair="netlify-redeploy"]');
    if(!button)return;
    event.preventDefault();event.stopImmediatePropagation();
    const params=new URLSearchParams(location.search),workspaceId=params.get('w');
    if(!workspaceId){alert('Open the affected WeaveRelay workspace before requesting a rebuild.');return}
    const approved=confirm('WeaveRelay will re-prove exactly one production Netlify site, its GitHub source repository, and its production branch immediately before requesting a clean rebuild. It will not change source code or environment variables. Afterward it will require a new successful deploy, a GitHub branch-head match, and a healthy public app before calling the repair fixed. Approve this rebuild?');
    if(!approved)return;
    const old=button.textContent;button.disabled=true;button.textContent='REQUESTING REBUILD…';
    try{
      const result=await api('/api/repair/netlify-redeploy',{method:'POST',body:JSON.stringify({workspaceId,approved:true})});
      alert(result.message||'Netlify rebuild requested. WeaveRelay will verify it on the next diagnosis.');
      const diagnose=document.querySelector('#diagnose');if(diagnose)diagnose.click();
    }catch(error){alert(error.message)}finally{button.disabled=false;button.textContent=old}
  },true);
})();
