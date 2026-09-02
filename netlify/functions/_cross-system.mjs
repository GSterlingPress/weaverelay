const UA='weaverelay-cross-system';
const clean=v=>String(v??'').trim();
const uniq=a=>[...new Set(a.filter(Boolean))];
const shortSha=v=>clean(v).slice(0,12)||null;
const hostOf=value=>{try{return new URL(value).hostname.toLowerCase()}catch{return''}};
const normalizeRepo=value=>clean(value).replace(/^git\+/, '').replace(/\.git$/,'').replace(/^git@github\.com:/,'https://github.com/').replace(/^ssh:\/\/git@github\.com\//,'https://github.com/').toLowerCase();
const timeout=ms=>AbortSignal.timeout?AbortSignal.timeout(ms):undefined;

async function fetchText(url,{fetchImpl=fetch,maxBytes=350000}={}){
  const r=await fetchImpl(url,{headers:{'user-agent':UA,accept:'text/html,application/javascript,text/javascript,*/*'},redirect:'follow',signal:timeout(8000)});
  const text=(await r.text()).slice(0,maxBytes);
  return{ok:r.ok,status:r.status,url:r.url||url,text,contentType:r.headers?.get?.('content-type')||''};
}
async function fetchJson(url,token,{fetchImpl=fetch,method='GET',body=null}={}){
  const headers={authorization:`Bearer ${token}`,'user-agent':UA,accept:'application/json'};
  if(body!=null)headers['content-type']='application/json';
  const r=await fetchImpl(url,{method,headers,body:body==null?undefined:JSON.stringify(body),signal:timeout(8000)});
  const data=await r.json().catch(()=>null);
  return{ok:r.ok,status:r.status,data};
}

function absoluteUrl(base,value){try{return new URL(value,base).href}catch{return null}}
function extractScriptUrls(html,base){
  const out=[];const re=/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;let m;
  while((m=re.exec(html))&&out.length<6){const u=absoluteUrl(base,m[1]);if(u&&/^https?:/i.test(u))out.push(u)}
  return uniq(out);
}
function extractHosts(text){
  const hosts=[];const urlRe=/https?:\/\/([a-z0-9.-]+)(?::\d+)?(?:[\/?#]|\b)/gi;let m;
  while((m=urlRe.exec(text))&&hosts.length<500)hosts.push(m[1].toLowerCase());
  const directRe=/\b([a-z0-9-]+\.supabase\.co|[a-z0-9-]+\.up\.railway\.app|[a-z0-9-]+\.railway\.app|[a-z0-9-]+\.netlify\.app)\b/gi;
  while((m=directRe.exec(text))&&hosts.length<600)hosts.push(m[1].toLowerCase());
  return uniq(hosts);
}
function refsFromHosts(hosts,suffix){return uniq(hosts.filter(h=>h.endsWith(suffix)).map(h=>h.slice(0,-suffix.length).split('.').pop()).filter(Boolean));}

export async function scanPublicApp(siteOrigin,{fetchImpl=fetch}={}){
  if(!siteOrigin)return{reachable:false,status:null,finalOrigin:null,hosts:[],signals:{stripe:false},scriptsScanned:0};
  try{
    const home=await fetchText(siteOrigin,{fetchImpl});
    const chunks=[home.text];let scanned=0;
    for(const url of extractScriptUrls(home.text,home.url).slice(0,5)){
      try{const r=await fetchText(url,{fetchImpl,maxBytes:450000});if(r.ok){chunks.push(r.text);scanned++}}catch{}
    }
    const corpus=chunks.join('\n');
    return{reachable:home.ok,status:home.status,finalOrigin:(()=>{try{return new URL(home.url).origin}catch{return siteOrigin}})(),hosts:extractHosts(corpus),signals:{stripe:/js\.stripe\.com|stripe\.com\/v3|\bStripe\s*\(/i.test(corpus)},scriptsScanned:scanned};
  }catch{return{reachable:false,status:null,finalOrigin:null,hosts:[],signals:{stripe:false},scriptsScanned:0}}
}

export async function discoverGithub(token,{fetchImpl=fetch}={}){
  const r=await fetchJson('https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member',token,{fetchImpl});
  if(!r.ok||!Array.isArray(r.data))return{ok:false,status:r.status,repos:[]};
  return{ok:true,status:r.status,repos:r.data.map(x=>({fullName:x.full_name,htmlUrl:x.html_url,defaultBranch:x.default_branch,private:Boolean(x.private)})).filter(x=>x.fullName)};
}
export async function discoverNetlify(token,{fetchImpl=fetch}={}){
  const r=await fetchJson('https://api.netlify.com/api/v1/sites?per_page=100',token,{fetchImpl});
  if(!r.ok||!Array.isArray(r.data))return{ok:false,status:r.status,sites:[]};
  return{ok:true,status:r.status,sites:r.data.map(x=>({id:x.id,name:x.name,url:x.url,sslUrl:x.ssl_url,customDomain:x.custom_domain,repoUrl:x.build_settings?.repo_url||x.repo_url||null,publishedDeployId:x.published_deploy?.id||null})).filter(x=>x.id)};
}
export async function discoverSupabase(token,{fetchImpl=fetch}={}){
  const r=await fetchJson('https://api.supabase.com/v1/projects',token,{fetchImpl});
  if(!r.ok||!Array.isArray(r.data))return{ok:false,status:r.status,projects:[]};
  return{ok:true,status:r.status,projects:r.data.map(x=>({id:x.id||x.ref,name:x.name||null})).filter(x=>x.id)};
}
export async function discoverRailway(token,{fetchImpl=fetch}={}){
  const r=await fetchJson('https://backboard.railway.com/graphql/v2',token,{fetchImpl,method:'POST',body:{query:'query { projects { edges { node { id name } } } }'}});
  const edges=r.data?.data?.projects?.edges;
  if(!r.ok||r.data?.errors||!Array.isArray(edges))return{ok:false,status:r.status,projects:[]};
  return{ok:true,status:r.status,projects:edges.map(e=>e?.node).filter(Boolean).map(x=>({id:x.id,name:x.name}))};
}
async function githubBranchHead(token,repo,branch,{fetchImpl=fetch}={}){
  const r=await fetchJson(`https://api.github.com/repos/${encodeURIComponent(repo).replace('%2F','/')}/commits/${encodeURIComponent(branch)}`,token,{fetchImpl});
  return r.ok?clean(r.data?.sha):null;
}
async function netlifyLatestDeploy(token,siteId,{fetchImpl=fetch}={}){
  const r=await fetchJson(`https://api.netlify.com/api/v1/sites/${encodeURIComponent(siteId)}/deploys?per_page=1`,token,{fetchImpl});
  const d=Array.isArray(r.data)?r.data[0]:null;
  return r.ok&&d?{id:d.id,state:d.state,branch:d.branch||null,commitRef:d.commit_ref||d.commit||null,deployUrl:d.deploy_ssl_url||d.ssl_url||d.url||null}:null;
}

const safeSourceFile=path=>{
  const p=String(path||'').toLowerCase();
  if(/(^|\/)(\.env|secrets?|credentials?|private[-_.]|.*\.pem$|.*\.key$)/.test(p))return false;
  if(!/\.(js|mjs|cjs|ts|tsx|jsx|json|toml|yaml|yml|html)$/.test(p))return false;
  return /(^|\/)(package\.json|netlify\.toml|railway\.toml|vite\.config\.[^/]+|next\.config\.[^/]+|vercel\.json|app\.[^/]+|config\.[^/]+|supabase\.[^/]+|stripe\.[^/]+|api\.[^/]+|client\.[^/]+|server\.[^/]+|main\.[^/]+|index\.[^/]+)$/.test(p);
};
async function discoverGithubSourceSignals(token,repo,branch,{fetchImpl=fetch}={}){
  const base=`https://api.github.com/repos/${encodeURIComponent(repo).replace('%2F','/')}`;
  const tree=await fetchJson(`${base}/git/trees/${encodeURIComponent(branch)}?recursive=1`,token,{fetchImpl});
  const entries=Array.isArray(tree.data?.tree)?tree.data.tree:[];
  const files=entries.filter(x=>x?.type==='blob'&&Number(x.size||0)<=180000&&safeSourceFile(x.path)).slice(0,24);
  const chunks=[];
  for(const file of files){
    try{
      const r=await fetchJson(`${base}/contents/${file.path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(branch)}`,token,{fetchImpl});
      if(r.ok&&r.data?.encoding==='base64'&&r.data?.content)chunks.push(Buffer.from(String(r.data.content).replace(/\s/g,''),'base64').toString('utf8'));
    }catch{}
  }
  const corpus=chunks.join('\n');
  return{filesScanned:chunks.length,hosts:extractHosts(corpus),signals:{stripe:/js\.stripe\.com|stripe\.com\/v3|\bStripe\s*\(|stripe/i.test(corpus)}};
}
async function probeHost(host,{fetchImpl=fetch}={}){
  try{const r=await fetchImpl(`https://${host}/`,{method:'GET',headers:{'user-agent':UA,accept:'*/*'},redirect:'manual',signal:timeout(6000)});return{reachable:true,status:r.status}}catch{return{reachable:false,status:null}}
}
const relation=(id,label,status,detail,evidence={})=>({id,label,status,detail,evidence:{source:'weaverelay-cross-system',...evidence}});

export async function buildCrossSystemEvidence({workspace,secrets={},fetchImpl=fetch}={}){
  const checks=[];const map={nodes:workspace?.stackMap?.nodes||[],flow:workspace?.stackMap?.flow||[],edges:[]};
  const publicScan=await scanPublicApp(workspace?.siteOrigin,{fetchImpl});
  if(workspace?.siteOrigin)checks.push(relation('app.public','Public app',publicScan.reachable?'PASS':'FAIL',publicScan.reachable?`The customer app answered HTTP ${publicScan.status}.`:'The customer app URL did not answer a successful read-only request.',{httpStatus:publicScan.status,finalOrigin:publicScan.finalOrigin,scriptsScanned:publicScan.scriptsScanned}));

  const [gh,nf,sb,rw]=await Promise.all([
    secrets.github?discoverGithub(secrets.github,{fetchImpl}):Promise.resolve(null),
    secrets.netlify?discoverNetlify(secrets.netlify,{fetchImpl}):Promise.resolve(null),
    secrets.supabase?discoverSupabase(secrets.supabase,{fetchImpl}):Promise.resolve(null),
    secrets.railway?discoverRailway(secrets.railway,{fetchImpl}):Promise.resolve(null)
  ]);

  let matchedSite=null;const targetHost=hostOf(publicScan.finalOrigin||workspace?.siteOrigin);
  if(nf?.ok&&targetHost){matchedSite=nf.sites.find(s=>[s.url,s.sslUrl,s.customDomain].map(hostOf).includes(targetHost))||null;
    checks.push(relation('map.netlify-site','App → Netlify',matchedSite?'PASS':'WARN',matchedSite?'The public app hostname matches a site in the connected Netlify account.':'The app is reachable, but WeaveRelay could not match its hostname to a site in the connected Netlify account.',{matched:!!matchedSite,siteName:matchedSite?.name||null}));
    if(matchedSite)map.edges.push({from:'netlify',to:'app',status:'PASS',reason:'hostname-match'});
  }

  let matchedRepo=null;
  if(matchedSite?.repoUrl&&gh?.ok){const wanted=normalizeRepo(matchedSite.repoUrl);matchedRepo=gh.repos.find(r=>normalizeRepo(r.htmlUrl)===wanted)||null;
    checks.push(relation('map.github-netlify','GitHub → Netlify',matchedRepo?'PASS':'WARN',matchedRepo?'Netlify build metadata points to a repository available through the connected GitHub authorization.':'Netlify reports a source repository, but that repository was not visible through the connected GitHub authorization.',{matched:!!matchedRepo,repository:matchedRepo?.fullName||null}));
    if(matchedRepo)map.edges.push({from:'github',to:'netlify',status:'PASS',reason:'repository-match'});
  }

  let deploy=null;let sourceSignals=null;
  if(matchedSite&&matchedRepo&&secrets.github&&secrets.netlify){
    deploy=await netlifyLatestDeploy(secrets.netlify,matchedSite.id,{fetchImpl}).catch(()=>null);
    if(deploy?.commitRef){const branch=deploy.branch||matchedRepo.defaultBranch;const head=await githubBranchHead(secrets.github,matchedRepo.fullName,branch,{fetchImpl}).catch(()=>null);if(head){const same=head.startsWith(deploy.commitRef)||deploy.commitRef.startsWith(head);checks.push(relation('map.github-netlify-deploy','GitHub → deployed Netlify commit',same?'PASS':'WARN',same?`Netlify's latest deploy matches the current ${branch} branch head.`:`Netlify's latest deploy does not match the current ${branch} branch head.`,{branch,githubHead:shortSha(head),netlifyCommit:shortSha(deploy.commitRef),deployState:deploy.state}));}}
    const branch=deploy?.branch||matchedRepo.defaultBranch;sourceSignals=await discoverGithubSourceSignals(secrets.github,matchedRepo.fullName,branch,{fetchImpl}).catch(()=>null);
  }

  const supabaseHosts=publicScan.hosts.filter(h=>h.endsWith('.supabase.co'));const refs=uniq(supabaseHosts.map(h=>h.split('.')[0]));
  if(sb?.ok&&refs.length){const owned=new Set(sb.projects.map(p=>String(p.id).toLowerCase()));const matches=refs.filter(r=>owned.has(r.toLowerCase()));const mismatch=refs.length>0&&matches.length===0;checks.push(relation('map.app-supabase','App → Supabase',matches.length?'PASS':mismatch?'FAIL':'WARN',matches.length?'A Supabase project referenced by the public app exists in the connected Supabase account.':'The public app references Supabase, but the referenced project was not found in the connected Supabase account.',{detectedProjectCount:refs.length,matchedProjectCount:matches.length}));if(matches.length)map.edges.push({from:'app',to:'supabase',status:'PASS',reason:'public-project-ref-match'});}
  else if(sb?.ok)checks.push(relation('map.app-supabase','App → Supabase','WARN','Supabase is connected, but the public app did not expose enough read-only evidence to prove which project it uses.',{detectedProjectCount:0}));

  const sourceSupabase=sourceSignals?.hosts?.filter(h=>h.endsWith('.supabase.co'))||[];
  if(sourceSupabase.length&&supabaseHosts.length){const src=new Set(sourceSupabase),pub=new Set(supabaseHosts),overlap=[...src].filter(h=>pub.has(h));checks.push(relation('map.source-deploy-supabase','GitHub source → deployed Supabase config',overlap.length?'PASS':'FAIL',overlap.length?'The Supabase hostname in the source configuration is also present in the deployed app.':'GitHub source and the deployed app expose different Supabase hostnames.',{sourceHostCount:src.size,deployedHostCount:pub.size,matchedHostCount:overlap.length,sourceFilesScanned:sourceSignals?.filesScanned||0}));}

  const railwayHosts=publicScan.hosts.filter(h=>h.endsWith('.up.railway.app')||h.endsWith('.railway.app'));
  if(rw?.ok){checks.push(relation('map.app-railway','App → Railway',railwayHosts.length?'PASS':'WARN',railwayHosts.length?`The public app references ${railwayHosts.length} Railway-hosted endpoint${railwayHosts.length===1?'':'s'}, and the connected Railway account is readable.`:'Railway is connected, but the public app did not expose a Railway endpoint that WeaveRelay can match yet.',{detectedRailwayHostCount:railwayHosts.length,railwayProjectCount:rw.projects.length}));if(railwayHosts.length)map.edges.push({from:'app',to:'railway',status:'PASS',reason:'public-runtime-host'});}
  if(railwayHosts.length){const probes=await Promise.all(railwayHosts.slice(0,3).map(h=>probeHost(h,{fetchImpl})));const live=probes.filter(p=>p.reachable).length;checks.push(relation('map.railway-endpoint-health','Deployed app → Railway endpoint health',live?'PASS':'FAIL',live?`${live} of ${probes.length} detected Railway endpoint${probes.length===1?'':'s'} answered an HTTPS request.`:'The Railway hostname exposed by the deployed app did not answer an HTTPS request.',{probed:probes.length,reachable:live,httpStatuses:probes.map(p=>p.status).filter(x=>x!=null)}));}
  const sourceRailway=sourceSignals?.hosts?.filter(h=>h.endsWith('.up.railway.app')||h.endsWith('.railway.app'))||[];
  if(sourceRailway.length&&railwayHosts.length){const src=new Set(sourceRailway),pub=new Set(railwayHosts),overlap=[...src].filter(h=>pub.has(h));checks.push(relation('map.source-deploy-railway','GitHub source → deployed Railway config',overlap.length?'PASS':'WARN',overlap.length?'A Railway hostname in source configuration is present in the deployed app.':'The Railway hostname visible in source configuration was not found in the deployed app bundle.',{sourceHostCount:src.size,deployedHostCount:pub.size,matchedHostCount:overlap.length,sourceFilesScanned:sourceSignals?.filesScanned||0}));}

  if(secrets.stripe){const sourceStripe=Boolean(sourceSignals?.signals?.stripe);checks.push(relation('map.app-stripe','App → Stripe','WARN',publicScan.signals.stripe?'Stripe client code is visible in the public app and the Stripe credential is connected, but the account-specific relationship is not yet provable from read-only public evidence.':'Stripe is connected, but WeaveRelay cannot yet prove which app configuration points to this Stripe account.',{stripeClientDetected:publicScan.signals.stripe,sourceStripeDetected:sourceStripe}));if(sourceStripe&&!publicScan.signals.stripe)checks.push(relation('map.source-deploy-stripe','GitHub source → deployed Stripe client','WARN','Stripe usage is visible in source files, but was not detected in the deployed public app. This can be legitimate for server-only Stripe use, so WeaveRelay will not call it a failure.',{sourceFilesScanned:sourceSignals?.filesScanned||0}));}

  return{checks,map,publicScan:{reachable:publicScan.reachable,status:publicScan.status,finalOrigin:publicScan.finalOrigin}};
}
