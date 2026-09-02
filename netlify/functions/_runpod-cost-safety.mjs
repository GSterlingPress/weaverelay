const clean=v=>String(v??'').trim();
const num=v=>{const n=Number(v);return Number.isFinite(n)&&n>=0?n:null};
export function safeRunPod(p={}){
  const status=clean(p.desiredStatus||p.status).toUpperCase(),locked=Boolean(p.locked),hasNetworkVolume=Boolean(p.networkVolumeId||p.networkVolume?.id),running=status==='RUNNING';
  const adjusted=num(p.adjustedCostPerHr),listed=num(p.costPerHr),effectiveRateCreditsPerHr=adjusted??listed;
  return{id:clean(p.id),name:clean(p.name)||'RunPod Pod',status,locked,hasNetworkVolume,running,stoppable:running&&!locked&&!hasNetworkVolume,stopBlockedReason:!running?'Pod is not running.':locked?'Pod is locked in RunPod.':hasNetworkVolume?'Pods with attached network volumes cannot be stopped; RunPod requires termination instead.':null,effectiveRateCreditsPerHr,listedRateCreditsPerHr:listed,rateSource:adjusted!==null?'savings-adjusted':listed!==null?'listed':null};
}
export function summarizeRunPodPods(raw=[]){
  const pods=(Array.isArray(raw)?raw:[]).map(safeRunPod).filter(p=>p.id),running=pods.filter(p=>p.running),stoppable=running.filter(p=>p.stoppable),blocked=running.filter(p=>!p.stoppable);
  const known=running.filter(p=>p.effectiveRateCreditsPerHr!==null),total=known.reduce((s,p)=>s+p.effectiveRateCreditsPerHr,0);
  return{pods,runningCount:running.length,stoppableCount:stoppable.length,blockedRunningCount:blocked.length,knownRunningRateCount:known.length,totalEffectiveRateCreditsPerHr:known.length?Math.round(total*10000)/10000:null,allRunningRatesKnown:running.length>0&&known.length===running.length};
}
export function planApprovedStopScope(raw=[],expectedPodIds=[]){
  const approved=[...new Set((expectedPodIds||[]).map(clean).filter(Boolean))],summary=summarizeRunPodPods(raw),byId=new Map(summary.pods.map(p=>[p.id,p]));
  const stop=[],blocked=[],missing=[];
  for(const id of approved){const p=byId.get(id);if(!p){missing.push(id);continue}if(p.stoppable)stop.push(p);else blocked.push(p)}
  return{stop,blocked,missing,approvedCount:approved.length};
}
