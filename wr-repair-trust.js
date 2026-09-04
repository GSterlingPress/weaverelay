(()=>{
const root=document.querySelector('#diagnosis');if(!root)return;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function harden(){
  root.querySelectorAll('.finding').forEach(finding=>{
    const buttons=finding.querySelector('.provider-buttons');if(!buttons)return;
    const disabled=[...buttons.querySelectorAll('button[disabled]')].find(b=>!b.classList.contains('finding-fix'));
    if(!disabled||disabled.dataset.wrGuide==='1')return;
    const steps=[...finding.querySelectorAll('.next')].map(x=>x.textContent.replace(/^Next:\s*/,'').trim()).filter(Boolean);
    const providerLink=buttons.querySelector('a[href]');
    disabled.disabled=false;disabled.dataset.wrGuide='1';disabled.classList.add('finding-guide');
    if(/VERIFYING|INSPECT|OPEN|ADD|REPAIR|GUIDED|REVIEW|CORRECT/i.test(disabled.textContent||''))disabled.title='Show the proven next steps. This does not make any change.';
    disabled.onclick=e=>{e.preventDefault();e.stopPropagation();let guide=finding.querySelector('.repair-guide-detail');if(guide){guide.remove();return}guide=document.createElement('div');guide.className='next repair-guide-detail';guide.innerHTML=`<strong>GUIDED — NO CHANGE MADE</strong><br>${steps.length?steps.map(esc).join('<br>'):'WeaveRelay does not have a proven-safe automatic repair for this finding yet.'}${providerLink?'<br>Use the provider link beside this guide to inspect the proven boundary.':''}`;buttons.before(guide)};
  });
}
new MutationObserver(harden).observe(root,{childList:true,subtree:true});harden();
})();
