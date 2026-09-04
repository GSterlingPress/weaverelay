const SEVERITY={critical:40,high:30,medium:20,low:10};
const CUSTOMER_IMPACT_IDS=new Set([
  'public-app-unreachable','railway-supabase-runtime-failed','stripe-webhook-handler-failing',
  'website-browser-runtime-failed','website-synthetic-journey-failed','website-functional-failure'
]);
const REPAIR_FAILURE_IDS=new Set([
  'railway-runtime-verification-failed','railway-supabase-runtime-failed','netlify-rebuild-failed','stripe-webhook-handler-failing'
]);
const EXACT_REPAIR_WEIGHTS={
  'netlify-redeploy':960,
  'railway-supabase-url':950,
  'railway-redeploy':940,
  'stripe-handler-secret':935,
  'stripe-webhook-host':925
};
const PROVIDER_CHECK={github:'github.live',netlify:'netlify.account',railway:'railway.runtime',supabase:'supabase.live',stripe:'stripe.live'};
const DOWNSTREAM_PREFIX={
  github:['map.github-','env.netlify-','repair.netlify-'],
  netlify:['map.netlify-','map.github-netlify','env.netlify-','repair.netlify-'],
  railway:['map.app-railway','map.railway-','runtime.railway-','repair.railway-','repair.stripe-handler-'],
  supabase:['map.app-supabase','map.railway-supabase','repair.railway-supabase-'],
  stripe:['map.app-stripe','map.railway-stripe','payments.stripe-','repair.stripe-']
};
function byId(snapshot={}){return Object.fromEntries((snapshot.checks||[]).map(c=>[c.id,c]))}
function explicitStale(check){const e=check?.evidence||{};return e.stale===true||e.fresh===false||e.current===false||e.truth?.stale===true}
function evidenceIds(finding){return Array.isArray(finding?.evidence)?finding.evidence:[]}
function providerOutages(findings,checks){const out={};for(const [provider,checkId] of Object.entries(PROVIDER_CHECK)){if(checks[checkId]?.status==='FAIL'){const reconnect=findings.find(f=>f.provider===provider&&f.repair?.type==='reconnect-provider');if(reconnect)out[provider]=reconnect.id}}return out}
function blockedByProvider(finding,outages){if(finding.repair?.type==='reconnect-provider'||CUSTOMER_IMPACT_IDS.has(finding.id)||finding.id==='evidence-conflict-unresolved')return null;const ids=evidenceIds(finding);for(const [provider,blocker] of Object.entries(outages)){const prefixes=DOWNSTREAM_PREFIX[provider]||[];if(ids.some(id=>prefixes.some(prefix=>id.startsWith(prefix))))return blocker}return null}
function basePriority(finding){if(finding.id==='evidence-conflict-unresolved')return 1100;if(REPAIR_FAILURE_IDS.has(finding.id))return 1000;const repairType=finding.repair?.supported?finding.repair?.type:null;if(repairType&&EXACT_REPAIR_WEIGHTS[repairType])return EXACT_REPAIR_WEIGHTS[repairType];if(CUSTOMER_IMPACT_IDS.has(finding.id))return 910;if(finding.id==='railway-endpoint-mismatch')return 900;if(finding.id==='supabase-project-mismatch')return 890;if(finding.id==='railway-supabase-mismatch')return 880;if(repairType==='reconnect-provider')return 760;if(/verification-pending|delivery-pending|rebuild-verifying|runtime-unproven/.test(finding.id))return 700;if(/mismatch|failed|unreachable/.test(finding.id))return 650;if(/unproven|incomplete|needs-attention|config|boundary/.test(finding.id))return 400;return 500}
export function prioritizeDiagnosis(diagnosis={},snapshot={}){
  const checks=byId(snapshot),findings=(diagnosis.findings||[]).map((f,index)=>({...f,_originalIndex:index})),outages=providerOutages(findings,checks);
  for(const finding of findings){
    const blocker=blockedByProvider(finding,outages),stale=finding.id==='evidence-conflict-unresolved'?false:evidenceIds(finding).some(id=>explicitStale(checks[id]));
    finding.blockedBy=blocker||null;finding.actionableNow=!blocker&&!stale;finding.evidenceFresh=!stale;
    let score=basePriority(finding)+(SEVERITY[finding.severity]||0);
    if(blocker)score-=500;if(stale)score-=350;
    finding.priorityScore=score;
  }
  findings.sort((a,b)=>b.priorityScore-a.priorityScore||a._originalIndex-b._originalIndex);
  for(const f of findings)delete f._originalIndex;
  const primary=findings.find(f=>f.actionableNow!==false)||findings[0]||null;
  const primaryReason=primary?primary.id==='evidence-conflict-unresolved'?'Strong current evidence disagrees, so WeaveRelay is stopping configuration-changing repair recommendations until the production truth is re-proven.':primary.blockedBy?`Resolve ${primary.blockedBy} before trusting this downstream finding.`:primary.repair?.supported?'This is the highest-priority proven issue with a currently supported, verification-gated repair.':CUSTOMER_IMPACT_IDS.has(primary.id)?'This is the highest-priority independently observed customer-impacting failure.':'This is the highest-priority currently actionable evidence boundary.':null;
  return {...diagnosis,findings,headline:primary?.title||diagnosis.headline,primaryFinding:primary?{id:primary.id,title:primary.title,provider:primary.provider||null,repairType:primary.repair?.type||null,reason:primaryReason}:null,safeRepairs:findings.map(f=>({finding:f.id,label:f.repair?.label||'Review issue',supported:Boolean(f.repair?.supported)&&f.actionableNow!==false,approvalRequired:f.repair?.approvalRequired!==false,type:f.repair?.type||null,provider:f.repair?.provider||f.provider||null,openProvider:f.openProvider||null,blockedBy:f.blockedBy||null})).slice(0,30)};
}
