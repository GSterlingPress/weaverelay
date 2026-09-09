(()=>{
  const parseCounts=()=>{const text=document.querySelector('#diagnosis')?.textContent||'';const m=text.match(/(\d+)\s+of\s+(\d+)\s+active checks passed/i);return m?{passed:Number(m[1]),active:Number(m[2])}:null};
  const connectedProviders=()=>[...document.querySelectorAll('#providers .provider-card')].filter(card=>{const chip=(card.querySelector('.chip')?.textContent||'').trim().toLowerCase(),detail=(card.querySelector('p')?.textContent||'').trim();return chip==='connected'&&/^connected:/i.test(detail)});
  const apply=()=>{
    const box=document.querySelector('#diagnosis');if(!box)return;
    const chip=box.querySelector('.diag-head .chip');if(!chip||chip.textContent.trim().toLowerCase()!=='healthy')return;
    const counts=parseCounts(),connected=connectedProviders().length;if(!counts)return;
    const minimum=connected>=2?connected+2:connected+1;
    if(counts.active>=minimum)return;
    chip.textContent='LIMITED EVIDENCE';chip.classList.remove('good','bad');chip.classList.add('warn');
    const heading=box.querySelector('.diag-head h2');if(heading)heading.textContent='More evidence is needed before this website can be called healthy';
    const summary=[...box.querySelectorAll(':scope > p')][0];if(summary)summary.textContent=`${counts.passed} of ${counts.active} active checks passed, but at least ${minimum} independent checks are required for the ${connected} currently connected service${connected===1?'':'s'}.`;
    const noFailure=[...box.querySelectorAll(':scope > p')].find(p=>/No cross-system failure was found/i.test(p.textContent||''));if(noFailure)noFailure.textContent='No failure is proven, but the current evidence is incomplete. Run a fresh live diagnosis before treating this website as healthy.';
    const guide=document.querySelector('#nextFixGuide');if(guide&&guide.classList.contains('good-guide')){guide.className='next-fix-guide attention-guide';guide.innerHTML='<strong>NEXT FIX</strong><span>Run a fresh live diagnosis. The stored snapshot does not contain enough current evidence to call this website healthy.</span>'}
  };
  const observe=()=>{apply();const roots=[document.querySelector('#diagnosis'),document.querySelector('#providers')].filter(Boolean);for(const root of roots)new MutationObserver(()=>queueMicrotask(apply)).observe(root,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['class']})};
  document.addEventListener('DOMContentLoaded',observe,{once:true});setTimeout(observe,0);
})();