(()=>{
  const isConnectedLabel=value=>['CONNECTED','AUTO-DETECTED'].includes(String(value||'').trim().toUpperCase());
  // wr-provider-windows.js intentionally exposes wpConnected as a global function.
  // Keep NOT CONNECTED / CONNECT / NEEDS ACTION from being misread as healthy.
  if(typeof window.wpConnected==='function'){
    window.wpConnected=provider=>{
      const chip=document.querySelector(`.provider-card[data-provider="${CSS.escape(provider)}"] .chip`);
      return isConnectedLabel(chip?.textContent);
    };
  }
})();
