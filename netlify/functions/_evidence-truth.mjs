const STATUS_RANK={PASS:1,WARN:2,FAIL:3,SKIPPED:0};
const SOURCE_STRENGTH={
  'weaverelay-repair-verification':100,
  'weaverelay-netlify-redeploy-verification':100,
  'weaverelay-backend-dependency-proof':98,
  'weaverelay-stripe-delivery-proof':98,
  'weaverelay-synthetic-browser':95,
  'weaverelay-browser-runtime':92,
  'weaverelay-website-diagnostics':88,
  'weaverelay-cross-system':86,
  'weaverelay-runtime-payments':86,
  'weaverelay-environment-deployment':84,
  'weaverelay-live-oauth':80,
  'weaverelay-live-expanded':80,
  'weaverelay-live':78,
  'client-snapshot':45
};
const MAX_AGE_MS={critical:15*60e3,relationship:60*60e3,provider:30*60e3,default:6*60*60e3};
const clean=v=>String(v??'').trim();
const parseTime=v=>{const n=Date.parse(clean(v));return Number.isFinite(n)?n:null};
function evidenceTime(check){const e=check?.evidence||{};return parseTime(e.observedAt||e.checkedAt||e.generatedAt||e.timestamp||e.at)}
function freshnessClass(id=''){if(/^repair\./.test(id)||/^website\.(browser-runtime|synthetic-journey|functional)/.test(id))return'critical';if(/^map\./.test(id)||/^runtime\./.test(id)||/^payments\./.test(id))return'relationship';if(/\.(live|account|runtime)$/.test(id))return'provider';return'default'}
function sourceStrength(check){return SOURCE_STRENGTH[clean(check?.evidence?.source)]||55}
function explicitStale(check){const e=check?.evidence||{};return e.stale===true||e.fresh===false||e.current===false||e.truth?.stale===true}
function independenceKey(check){const e=check?.evidence||{},source=clean(e.source)||'unknown';if(e.independentSource)return clean(e.independentSource);if(source.includes('stripe'))return'stripe';if(source.includes('railway'))return'railway';if(source.includes('netlify'))return'netlify';if(source.includes('github'))return'github';if(source.includes('browser'))return'browser';if(source.includes('website'))return'website';if(source.includes('supabase'))return'supabase';return source}
function claimKey(check){const e=check?.evidence||{};return clean(e.claimKey||e.truthKey||e.relationshipKey)||null}
function claimValue(check){const e=check?.evidence||{};const explicit=e.claimValue??e.truthValue??e.relationshipValue;if(explicit!==undefined&&explicit!==null)return clean(explicit);return null}
function withTruth(check,{now}){const observed=evidenceTime(check),ageMs=observed==null?null:Math.max(0,now-observed),limit=MAX_AGE_MS[freshnessClass(check.id)]||MAX_AGE_MS.default,stale=explicitStale(check)||(ageMs!=null&&ageMs>limit),ageUnknown=observed==null,strength=sourceStrength(check),freshnessScore=stale?0:(ageUnknown?0.55:Math.max(.2,1-(ageMs/limit)*.65)),confidence=Math.round(strength*freshnessScore);return{...check,evidence:{...(check.evidence||{}),stale,truth:{...(check.evidence?.truth||{}),observedAt:observed?new Date(observed).toISOString():null,ageMs,stale,ageUnknown,sourceStrength:strength,confidence,independenceKey:independenceKey(check)}}}}
function priorConflict(current,previous,now){if(!previous||current.status===previous.status||current.status==='WARN'||previous.status==='WARN'||current.status==='SKIPPED'||previous.status==='SKIPPED')return null;const currentTruth=current.evidence?.truth||{},previousTruth=withTruth(previous,{now}).evidence.truth,previousStrength=previousTruth.sourceStrength,previousObserved=evidenceTime(previous),currentObserved=evidenceTime(current),independent=independenceKey(current)!==independenceKey(previous),currentClearlyNewer=currentObserved!=null&&(previousObserved==null||currentObserved>previousObserved),strengthGap=currentTruth.sourceStrength-previousStrength;let decisive=false,winner='unresolved';if(previousTruth.stale&&!currentTruth.stale){decisive=true;winner='current'}else if(currentClearlyNewer&&strengthGap>=-15){decisive=true;winner='current'}else if(!previousTruth.stale&&previousStrength-currentTruth.sourceStrength>=20){decisive=true;winner='previous'}return{decisive,winner,independent,previousStatus:previous.status,previousStrength,previousObservedAt:previousObserved?new Date(previousObserved).toISOString():null,previousStale:previousTruth.stale}}
export function reconcileEvidence(snapshot={},options={}){
  const now=Number.isFinite(options.now)?options.now:Date.now(),previousById=new Map((options.previousSnapshot?.checks||[]).map(c=>[c.id,c])),checks=(snapshot.checks||[]).map(c=>withTruth(c,{now})),contradictions=[];
  for(const check of checks){const conflict=priorConflict(check,previousById.get(check.id),now);if(!conflict)continue;check.evidence.truth={...check.evidence.truth,contradicted:true,historicalConflict:true,...conflict};contradictions.push({claimKey:`check:${check.id}`,values:[conflict.previousStatus,check.status],sources:[independenceKey(previousById.get(check.id)),independenceKey(check)],decisive:conflict.decisive,winnerCheckId:conflict.winner==='current'?check.id:null,winner:conflict.winner});}
  const groups=new Map();
  for(const check of checks){const key=claimKey(check),value=claimValue(check);if(!key||!value)continue;if(!groups.has(key))groups.set(key,[]);groups.get(key).push({check,value});}
  for(const [key,items] of groups){const live=items.filter(x=>!x.check.evidence.truth.stale),values=[...new Set(live.map(x=>x.value))];if(values.length<2)continue;const sources=[...new Set(live.map(x=>x.check.evidence.truth.independenceKey))],strongest=[...live].sort((a,b)=>b.check.evidence.truth.confidence-a.check.evidence.truth.confidence||STATUS_RANK[b.check.status]-STATUS_RANK[a.check.status]),winner=strongest[0],runner=strongest[1],decisive=Boolean(winner&&runner&&(winner.check.evidence.truth.confidence-runner.check.evidence.truth.confidence>=25));contradictions.push({claimKey:key,values,sources,decisive,winnerCheckId:decisive?winner.check.id:null,winner:decisive?'current':'unresolved'});for(const item of live){const isWinner=decisive&&item.check.id===winner.check.id;item.check.evidence.truth={...item.check.evidence.truth,contradicted:true,contradictionDecisive:decisive,contradictionWinner:isWinner,contradictionClaim:key};}}
  const annotated=checks.map(check=>{const truth=check.evidence?.truth||{};if(truth.historicalConflict&&truth.winner==='previous'){return{...check,status:'WARN',detail:`Fresh probe conflicts with stronger prior proof: ${check.detail}`,evidence:{...check.evidence,stale:true,truth:{...truth,statusDemotedForConflict:true}}}}if(truth.historicalConflict&&!truth.decisive){return{...check,status:'WARN',detail:`Fresh and prior evidence disagree: ${check.detail}`,evidence:{...check.evidence,stale:true,truth:{...truth,statusDemotedForConflict:true}}}}if(truth.stale&&check.status==='FAIL')return{...check,status:'WARN',detail:`Stale evidence: ${check.detail}`,evidence:{...check.evidence,stale:true,truth:{...truth,statusDemotedFrom:'FAIL'}}};if(truth.contradicted&&!truth.contradictionDecisive&&check.status!=='SKIPPED')return{...check,status:'WARN',detail:`Conflicting independent evidence: ${check.detail}`,evidence:{...check.evidence,stale:true,truth:{...truth,statusDemotedForConflict:true}}};if(truth.contradicted&&truth.contradictionDecisive&&!truth.contradictionWinner&&check.status==='FAIL')return{...check,status:'WARN',detail:`Older or weaker contradictory evidence: ${check.detail}`,evidence:{...check.evidence,stale:true,truth:{...truth,statusDemotedForConflict:true}}};return check});
  return{...snapshot,checks:annotated,truthSummary:{contradictionCount:contradictions.length,unresolvedContradictionCount:contradictions.filter(x=>!x.decisive).length,staleCount:annotated.filter(c=>c.evidence?.truth?.stale).length,contradictions}};
}
