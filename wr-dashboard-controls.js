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
  document.addEventListener('click',openCreate,true);
})();
