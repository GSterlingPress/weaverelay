const UA='weaverelay-runtime-payments';
const clean=v=>String(v??'').trim();
const uniq=a=>[...new Set(a.filter(Boolean))];
const timeout=ms=>AbortSignal.timeout?AbortSignal.timeout(ms):undefined;
const normalizeName=v=>clean(v).toLowerCase().replace(/[^a-z0-9]+/g,'');
const hostOf=value=>{try{return new URL(value).hostname.toLowerCase()}catch{return''}};
const relation=(id,label,status,detail,evidence={})=>({id,label,status,detail,evidence:{source:'weaverelay-runtime-payments',...evidence}});

async function graphql(token,query,variables={},fetchImpl=fetch){
  const r=await fetchImpl('https://backboard.railway.com/graphql/v2',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json','user-agent':UA},body:JSON.stringify({query,variables}),signal:timeout(8000)});
  const data=await r.json().catch(()=>null);
  return{ok:r.ok&&!data?.errors,status:r.status,data:data?.data||null,errors:data?.errors||null};
}
async function stripeGet(token,path,fetchImpl=fetch){
  const r=await fetchImpl(`https://api.stripe.com${path}`,{headers:{authorization:`Bearer ${token}`,'user-agent':UA},signal:timeout(8000)});
  const data=await r.json().catch(()=>null);
  return{ok:r.ok,status:r.status,data};
}
function safeSourceFile(path){
  const p=String(path||'').toLowerCase();
  if(/(^|\/)(\.env(?:\.|$)|secrets?|credentials?|private[-_.]|.*\.pem$|.*\.key$)/.test(p))return false;
  return /\.(js|mjs|cjs|ts|tsx|jsx|json|toml|yaml|yml|html)$/.test(p)&&/(package\.json|railway\.toml|app\.|config\.|api\.|client\.|server\.|main\.|index\.)/.test(p);
}
export function extractEnvNames(text=''){
  const names=[];const patterns=[/\bprocess\.env\.([A-Z][A-Z0-9_]*)\b/g,/\bprocess\.env\[['"]([A-Z][A-Z0-9_]*)['"]\]/g,/\bimport\.meta\.env\.([A-Z][A-Z0-9_]*)\b/g,/\bDeno\.env\.get\(['"]([A-Z][A-Z0-9_]*)['"]\)/g];
  for(const re of patterns){let m;while((m=re.exec(String(text)))&&names.length<400)names.push(m[1]);}
  return uniq(names).sort();
}
async function githubExpectedEnv(token,repo,branch='main',fetchImpl=fetch){
  if(!token||!repo)return{names:[],filesScanned:0};
  const base=`https://api.github.com/repos/${repo}`;
  const tr=await fetchImpl(`${base}/git/trees/${encodeURIComponent(branch)}?recursive=1`,{headers:{authorization:`Bearer ${token}`,accept:'application/vnd.github+json','user-agent':UA},signal:timeout(8000)});
  const tree=await tr.json().catch(()=>null);if(!tr.ok)return{names:[],filesScanned:0};
  const files=(Array.isArray(tree?.tree)?tree.tree:[]).filter(x=>x?.type==='blob'&&Number(x.size||0)<=180000&&safeSourceFile(x.path)).slice(0,30);
  const names=[];let scanned=0;
  for(const file of files){try{const r=await fetchImpl(`${base}/contents/${file.path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(branch)}`,{headers:{authorization:`Bearer ${token}`,accept:'application/vnd.github+json','user-agent':UA},signal:timeout(8000)});const d=await r.json().catch(()=>null);if(r.ok&&d?.encoding==='base64'&&d?.content){names.push(...extractEnvNames(Buffer.from(String(d.content).replace(/\s/g,''),'base64').toString('utf8')));scanned++;}}catch{}}
  return{names:uniq(names).sort(),filesScanned:scanned};
}
async function githubRepoFromNetlify(netlifyToken,siteOrigin,fetchImpl=fetch){
  if(!netlifyToken||!siteOrigin)return null;let target;try{target=new URL(siteOrigin).hostname.toLowerCase()}catch{return null}
  const r=await fetchImpl('https://api.netlify.com/api/v1/sites?per_page=100',{headers:{authorization:`Bearer ${netlifyToken}`,'user-agent':UA},signal:timeout(8000)});const d=await r.json().catch(()=>null);if(!r.ok||!Array.isArray(d))return null;
  const site=d.find(s=>[s.url,s.ssl_url,s.custom_domain].map(hostOf).includes(target));const raw=site?.build_settings?.repo_url||'';const m=String(raw).replace(/\.git$/,'').match(/github\.com[/:]([^/]+)\/([^/]+)$/i);return m?{repo:`${m[1]}/${m[2]}`,branch:site?.build_settings?.repo_branch||'main'}:null;
}
async function railwayInventory(token,workspaceName,fetchImpl=fetch){
  const list=await graphql(token,'query { projects { edges { node { id name } } } }',{},fetchImpl);const projects=(list.data?.projects?.edges||[]).map(e=>e?.node).filter(Boolean);if(!list.ok)return{ok:false,projects:[],candidates:[]};
  const wanted=normalizeName(workspaceName);let candidates=projects.filter(p=>{const n=normalizeName(p.name);return wanted&&n&&(n.includes(wanted)||wanted.includes(n));});if(!candidates.length)candidates=projects.slice(0,6);else candidates=candidates.slice(0,4);
  const detailed=[];
  for(const p of candidates){const q=await graphql(token,'query project($id: String!) { project(id: $id) { id name services { edges { node { id name } } } environments { edges { node { id name } } } } }',{id:p.id},fetchImpl);if(!q.ok||!q.data?.project)continue;const pr=q.data.project;detailed.push({id:pr.id,name:pr.name,services:(pr.services?.edges||[]).map(e=>e?.node).filter(Boolean),environments:(pr.environments?.edges||[]).map(e=>e?.node).filter(Boolean)});}
  return{ok:true,projects,detailed,candidates:detailed};
}
async function railwayVariableKeys(token,projects,fetchImpl=fetch){
  const records=[];
  for(const p of projects.slice(0,4)){const envs=[...p.environments].sort((a,b)=>/^(production|prod)$/i.test(b.name)-/^(production|prod)$/i.test(a.name)).slice(0,2);for(const env of envs){for(const service of p.services.slice(0,10)){const q=await graphql(token,'query variables($projectId: String!, $environmentId: String!, $serviceId: String) { variables(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId) }',{projectId:p.id,environmentId:env.id,serviceId:service.id},fetchImpl);if(!q.ok||!q.data?.variables||typeof q.data.variables!=='object')continue;records.push({project:p.name,environment:env.name,service:service.name,keys:Object.keys(q.data.variables).sort()});}}}
  return records;
}
function stripeRelevant(names){return names.filter(n=>/STRIPE|PAYMENT|CHECKOUT|WEBHOOK/i.test(n));}
function supabaseRelevant(names){return names.filter(n=>/SUPABASE|DATABASE_URL|POSTGRES/i.test(n));}

export async function buildRuntimePaymentsEvidence({workspace,secrets={},fetchImpl=fetch}={}){
  const checks=[];let expected={names:[],filesScanned:0};
  if(secrets.github&&secrets.netlify){const source=await githubRepoFromNetlify(secrets.netlify,workspace?.siteOrigin,fetchImpl).catch(()=>null);if(source)expected=await githubExpectedEnv(secrets.github,source.repo,source.branch,fetchImpl).catch(()=>expected);}

  if(secrets.railway){
    const inv=await railwayInventory(secrets.railway,workspace?.name,fetchImpl).catch(()=>({ok:false,projects:[],candidates:[]}));
    if(inv.ok){
      const records=await railwayVariableKeys(secrets.railway,inv.candidates,fetchImpl).catch(()=>[]);const configured=uniq(records.flatMap(r=>r.keys));const expectedBackend=expected.names.filter(n=>!/^VITE_|^NEXT_PUBLIC_|^PUBLIC_/i.test(n));const present=expectedBackend.filter(n=>configured.includes(n));const missing=expectedBackend.filter(n=>!configured.includes(n));
      checks.push(relation('runtime.railway-inventory','Railway runtime inventory',inv.candidates.length?'PASS':'WARN',inv.candidates.length?`WeaveRelay inspected ${inv.candidates.length} likely Railway project${inv.candidates.length===1?'':'s'} and ${records.length} service/environment configuration set${records.length===1?'':'s'} without retaining values.`:'Railway is connected, but no likely project could be inspected.',{railwayProjectCount:inv.projects.length,candidateProjectCount:inv.candidates.length,configurationSetCount:records.length,configuredKeyCount:configured.length,valuesRetained:false}));
      if(expectedBackend.length)checks.push(relation('runtime.railway-env-coverage','GitHub source → Railway runtime environment',missing.length?'WARN':'PASS',missing.length?`${present.length} of ${expectedBackend.length} backend environment-variable names referenced by safe source files were found in the inspected Railway runtime configuration; ${missing.length} were not found.`:`All ${expectedBackend.length} backend environment-variable names referenced by safe source files were found in the inspected Railway runtime configuration.`,{expectedKeyCount:expectedBackend.length,presentKeyCount:present.length,missingKeyCount:missing.length,missingKeys:missing.slice(0,20),sourceFilesScanned:expected.filesScanned,valuesRetained:false}));
      const stripeNames=stripeRelevant(configured),supabaseNames=supabaseRelevant(configured);
      checks.push(relation('runtime.railway-backend-integrations','Railway backend integration signals',(stripeNames.length||supabaseNames.length)?'PASS':'WARN',(stripeNames.length||supabaseNames.length)?'The Railway runtime exposes configuration-name evidence for backend integrations used by the application.':'No Stripe/Supabase/database configuration names were found in the inspected Railway runtime sets.',{stripeRelatedKeyCount:stripeNames.length,supabaseOrDatabaseKeyCount:supabaseNames.length,valuesRetained:false}));
    }else checks.push(relation('runtime.railway-inventory','Railway runtime inventory','WARN','Railway answered the basic account probe, but project/runtime metadata could not be read with this authorization.',{valuesRetained:false}));
  }

  if(secrets.stripe){
    const wh=await stripeGet(secrets.stripe,'/v1/webhook_endpoints?limit=100',fetchImpl).catch(()=>({ok:false,status:null,data:null}));
    if(wh.ok&&Array.isArray(wh.data?.data)){
      const endpoints=wh.data.data;const enabled=endpoints.filter(x=>x?.status==='enabled');const expectedWebhook=stripeRelevant(expected.names).some(n=>/WEBHOOK/i.test(n));const siteHost=hostOf(workspace?.siteOrigin);const hosts=uniq(enabled.map(x=>hostOf(x?.url)).filter(Boolean));const appMatch=siteHost&&hosts.includes(siteHost);
      const status=expectedWebhook&&enabled.length===0?'WARN':enabled.length?'PASS':'WARN';
      checks.push(relation('payments.stripe-webhooks','Stripe webhook boundary',status,enabled.length?`Stripe webhook metadata is readable and ${enabled.length} enabled endpoint${enabled.length===1?' is':'s are'} configured.`:expectedWebhook?'The application source references webhook configuration, but no enabled Stripe webhook endpoint was found.':'Stripe webhook metadata is readable, but no enabled endpoint was found.',{webhookReadAuthorized:true,enabledEndpointCount:enabled.length,totalEndpointCount:endpoints.length,uniqueEndpointHostCount:hosts.length,productionSiteHostMatch:Boolean(appMatch),sourceExpectsWebhook:Boolean(expectedWebhook),endpointUrlsRetained:false,signingSecretsRetained:false}));
    }else if(wh.status===401||wh.status===403){
      checks.push(relation('payments.stripe-webhooks','Stripe webhook boundary','WARN','The Stripe connection is valid for its current read-only health check, but this key does not authorize read access to webhook endpoint metadata. Webhook truth remains unverified.',{webhookReadAuthorized:false,httpStatus:wh.status,endpointUrlsRetained:false,signingSecretsRetained:false}));
    }else checks.push(relation('payments.stripe-webhooks','Stripe webhook boundary','WARN','Stripe webhook metadata could not be read during this diagnosis, so the payment callback boundary remains unverified.',{webhookReadAuthorized:false,httpStatus:wh.status,endpointUrlsRetained:false,signingSecretsRetained:false}));
  }
  return{checks};
}
