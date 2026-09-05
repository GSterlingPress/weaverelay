(()=>{
  const form=document.querySelector('#loginForm');
  if(!form)return;
  form.onsubmit=async event=>{
    event.preventDefault();
    const button=form.querySelector('button'),status=document.querySelector('#loginStatus'),email=document.querySelector('#email'),company=document.querySelector('#company');
    button.disabled=true;
    try{
      const response=await fetch('/api/auth/request',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:email.value,company:company.value,next:location.pathname+location.search})});
      const payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(payload.error||'Request failed.');
      status.textContent=payload.message||'Check your email.';
      if(payload.previewSignInUrl){
        location.assign(payload.previewSignInUrl);
        return;
      }
    }catch(error){status.textContent=error.message||'Sign-in failed.'}
    finally{button.disabled=false}
  };
})();
