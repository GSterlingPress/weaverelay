export const LIVE_PROVIDER_IDS=['github','netlify','railway','supabase','stripe','runpod'];

const clean=v=>String(v??'').trim();
const result=(ok,detail,meta={})=>({ok,detail,meta});

async function runpodList(token,path,fetchImpl=fetch){
  const r=await fetchImpl(`https://rest.runpod.io/v1/${path}`,{headers:{authorization:`Bearer ${token}`,'user-agent':'weaverelay-runpod-readonly',accept:'application/json'}});
  const d=await r.json().catch(()=>null);
  return{ok:r.ok,status:r.status,data:d};
}

export async function probeCredential(provider,credential,{fetchImpl=fetch}={}){
  const token=clean(credential);
  if(!token)throw new Error('Connection credential is required.');
  if(provider==='netlify'){
    const r=await fetchImpl('https://api.netlify.com/api/v1/user',{headers:{authorization:`Bearer ${token}`,'user-agent':'weaverelay'}});
    const d=await r.json().catch(()=>({}));
    return r.ok?result(true,'Netlify answered a read-only account probe.',{accountName:d.full_name||d.email||'Netlify account'}):result(false,`Netlify returned HTTP ${r.status}.`,{httpStatus:r.status});
  }
  if(provider==='railway'){
    const r=await fetchImpl('https://backboard.railway.com/graphql/v2',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json','user-agent':'weaverelay'},body:JSON.stringify({query:'query { me { name email } }'})});
    const d=await r.json().catch(()=>({}));
    const ok=r.ok&&!d.errors&&d.data?.me;
    return ok?result(true,'Railway answered a read-only account probe.',{accountName:d.data.me.name||d.data.me.email||'Railway account'}):result(false,`Railway returned ${r.ok?'a GraphQL authorization error':`HTTP ${r.status}`}.`,{httpStatus:r.status});
  }
  if(provider==='supabase'){
    const r=await fetchImpl('https://api.supabase.com/v1/projects',{headers:{authorization:`Bearer ${token}`,'user-agent':'weaverelay'}});
    const d=await r.json().catch(()=>null);
    return r.ok?result(true,'Supabase answered a read-only Management API probe.',{accountName:'Supabase account',projectCount:Array.isArray(d)?d.length:null}):result(false,`Supabase returned HTTP ${r.status}.`,{httpStatus:r.status});
  }
  if(provider==='stripe'){
    const r=await fetchImpl('https://api.stripe.com/v1/balance',{headers:{authorization:`Bearer ${token}`,'user-agent':'weaverelay'}});
    await r.text();
    return r.ok?result(true,'Stripe answered the restricted read-only Balance probe.',{accountName:'Stripe account'}):result(false,`Stripe returned HTTP ${r.status}.`,{httpStatus:r.status});
  }
  if(provider==='runpod'){
    const [pods,endpoints]=await Promise.all([runpodList(token,'pods',fetchImpl),runpodList(token,'endpoints',fetchImpl)]);
    if(!pods.ok&&!endpoints.ok){const status=pods.status||endpoints.status;return result(false,`RunPod rejected the read-only resource probe${status?` (HTTP ${status})`:''}.`,{httpStatus:status||null});}
    const podCount=Array.isArray(pods.data)?pods.data.length:null,endpointCount=Array.isArray(endpoints.data)?endpoints.data.length:null;
    return result(true,'RunPod answered read-only Pod/Serverless inventory probes.',{accountName:'RunPod account',podCount,endpointCount,resourceBodiesRetained:false,environmentValuesRetained:false});
  }
  throw new Error('This provider does not use a direct Early Access credential.');
}

export function checkForProvider(provider,probe){
  const ids={netlify:'netlify.account',railway:'railway.runtime',supabase:'supabase.live',stripe:'stripe.live',runpod:'runpod.live'};
  const labels={netlify:'Netlify',railway:'Railway',supabase:'Supabase',stripe:'Stripe',runpod:'RunPod'};
  return {id:ids[provider],label:labels[provider],status:probe.ok?'PASS':'FAIL',detail:probe.detail,evidence:{source:'weaverelay-live-encrypted-credential',...(probe.meta?.httpStatus?{httpStatus:probe.meta.httpStatus}:{}),...(provider==='runpod'?{podCount:probe.meta?.podCount??null,endpointCount:probe.meta?.endpointCount??null,resourceBodiesRetained:false,environmentValuesRetained:false}:{})}};
}
