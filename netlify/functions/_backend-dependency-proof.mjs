const UA='weaverelay-backend-dependency-proof';
const clean=v=>String(v??'').trim();
const timeout=ms=>AbortSignal.timeout?AbortSignal.timeout(ms):undefined;

function targetFromRepair(repair={}){
  const publicDomain=clean(repair.publicDomain).toLowerCase();
  const projectRef=clean(repair.projectRef).toLowerCase();
  return publicDomain&&projectRef?{publicDomain,projectRef}:null;
}

function safeEvidence(evidence={}){
  const out={};
  for(const [k,v] of Object.entries(evidence||{}).slice(0,20)){
    if(/secret|token|password|key|authorization|cookie|url|domain|host/i.test(k))continue;
    if(typeof v==='boolean'||typeof v==='number')out[k]=v;
    else if(typeof v==='string'&&v.length<=120)out[k]=v;
  }
  return out;
}

function strongReadEvidence(evidence={}){
  for(const [k,v] of Object.entries(evidence||{})){
    if(v===true&&/(found|query|read|reachable|connected|verified|exists|available|success)/i.test(k))return true;
    if(typeof v==='number'&&v>0&&/(count|rows|records|results)/i.test(k))return true;
  }
  return false;
}

function findSupabaseCheck(body={}){
  const candidates=[];
  if(Array.isArray(body?.checks))candidates.push(...body.checks);
  if(Array.isArray(body?.diagnosis?.checks))candidates.push(...body.diagnosis.checks);
  return candidates.find(item=>/supabase/i.test(`${item?.id||''} ${item?.label||''}`))||null;
}

async function probeDiagnostic(domain,path,fetchImpl=fetch){
  try{
    const r=await fetchImpl(`https://${domain}${path}`,{method:'GET',headers:{'user-agent':UA,accept:'application/json'},redirect:'manual',signal:timeout(8000)});
    const contentType=String(r.headers?.get?.('content-type')||'').toLowerCase();
    if(!r.ok||!contentType.includes('json'))return{usable:false,httpStatus:r.status};
    const body=await r.json().catch(()=>null);
    if(!body||typeof body!=='object')return{usable:false,httpStatus:r.status};
    return{usable:true,httpStatus:r.status,body};
  }catch{return{usable:false,httpStatus:null}}
}

export async function verifyBackendSupabaseDependency({workspace,fetchImpl=fetch}={}){
  const repair=workspace?.lastRepair||{};
  if(repair.type!=='railway-supabase-url'||repair.configurationVerified!==true)return null;
  const target=targetFromRepair(repair);
  if(!target)return{status:'WARN',detail:'The repaired backend is running, but WeaveRelay does not have enough retained non-secret target evidence to prove its Supabase dependency.',evidence:{dependencyVerified:false,proofAvailable:false}};
  if(repair.runtimeVerified!==true)return{status:'WARN',detail:'The Supabase dependency will be verified after the repaired Railway deployment itself is confirmed running.',evidence:{dependencyVerified:false,proofAvailable:false,runtimeVerified:false}};
  if(repair.dependencyVerified===true)return{status:'PASS',detail:'The repaired backend previously proved a live read-only Supabase operation after redeploy.',evidence:{dependencyVerified:true,proofAvailable:true,proofType:'application-self-diagnostic'}};

  const paths=['/api/connect/diagnostic','/api/health','/health'];
  for(const path of paths){
    const result=await probeDiagnostic(target.publicDomain,path,fetchImpl);
    if(!result.usable)continue;
    const check=findSupabaseCheck(result.body);
    if(!check)continue;
    const status=clean(check.status).toUpperCase();
    const evidence=safeEvidence(check.evidence||{});
    if(status==='FAIL')return{status:'FAIL',detail:'The repaired Railway backend is running, but its own live diagnostic reports that the Supabase dependency is failing.',evidence:{dependencyVerified:false,proofAvailable:true,proofType:'application-self-diagnostic',diagnosticPath:path,httpStatus:result.httpStatus}};
    if(status==='PASS'&&strongReadEvidence(check.evidence||{}))return{status:'PASS',detail:'The repaired Railway backend is running and its own live read-only diagnostic successfully exercised Supabase after redeploy.',evidence:{dependencyVerified:true,proofAvailable:true,proofType:'application-self-diagnostic',diagnosticPath:path,httpStatus:result.httpStatus,...evidence}};
    if(status==='PASS')return{status:'WARN',detail:'The backend reports Supabase healthy, but the diagnostic did not include enough non-secret evidence to prove that a real read operation succeeded.',evidence:{dependencyVerified:false,proofAvailable:true,proofType:'application-self-diagnostic',diagnosticPath:path,httpStatus:result.httpStatus}};
  }

  return{status:'WARN',detail:'The repaired Railway backend is running, but this application does not expose a safe structured health/diagnostic response that lets WeaveRelay prove a live Supabase operation yet.',evidence:{dependencyVerified:false,proofAvailable:false,proofType:'application-self-diagnostic'}};
}
