const UA='weaverelay-env-truth';
const clean=v=>String(v??'').trim();
const uniq=a=>[...new Set(a.filter(Boolean))];
const hostOf=value=>{try{return new URL(value).hostname.toLowerCase()}catch{return''}};
const timeout=ms=>AbortSignal.timeout?AbortSignal.timeout(ms):undefined;

async function fetchJson(url,token,{fetchImpl=fetch}={}){
  const r=await fetchImpl(url,{headers:{authorization:`Bearer ${token}`,'user-agent':UA,accept:'application/json'},signal:timeout(8000)});
  const data=await r.json().catch(()=>null);
  return{ok:r.ok,status:r.status,data};
}

function relation(id,label,status,detail,evidence={}){
  return{id,label,status,detail,evidence:{source:'weaverelay-environment-deployment',...evidence}};
}

export function extractEnvironmentNames(text=''){
  const names=[];
  const patterns=[
    /\bprocess\.env\.([A-Z][A-Z0-9_]*)\b/g,
    /\bprocess\.env\[['"]([A-Z][A-Z0-9_]*)['"]\]/g,
    /\bimport\.meta\.env\.([A-Z][A-Z0-9_]*)\b/g,
    /\bDeno\.env\.get\(['"]([A-Z][A-Z0-9_]*)['"]\)/g
  ];
  for(const re of patterns){let m;while((m=re.exec(String(text)))&&names.length<300)names.push(m[1]);}
  return uniq(names).sort();
}

function safeSourceFile(path){
  const p=String(path||'').toLowerCase();
  if(/(^|\/)(\.env(?:\.|$)|secrets?|credentials?|private[-_.]|.*\.pem$|.*\.key$)/.test(p))return false;
  if(!/\.(js|mjs|cjs|ts|tsx|jsx|json|toml|yaml|yml|html)$/.test(p))return false;
  return /(^|\/)(package\.json|netlify\.toml|railway\.toml|vite\.config\.[^/]+|next\.config\.[^/]+|vercel\.json|app\.[^/]+|config\.[^/]+|api\.[^/]+|client\.[^/]+|server\.[^/]+|main\.[^/]+|index\.[^/]+|wr-control\.js)$/.test(p);
}

async function githubSourceEnvNames(token,repo,branch,{fetchImpl=fetch}={}){
  const base=`https://api.github.com/repos/${repo}`;
  const tree=await fetchJson(`${base}/git/trees/${encodeURIComponent(branch)}?recursive=1`,token,{fetchImpl});
  const entries=Array.isArray(tree.data?.tree)?tree.data.tree:[];
  const files=entries.filter(x=>x?.type==='blob'&&Number(x.size||0)<=180000&&safeSourceFile(x.path)).slice(0,30);
  const names=[];let scanned=0;
  for(const file of files){
    try{
      const r=await fetchJson(`${base}/contents/${file.path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(branch)}`,token,{fetchImpl});
      if(!r.ok||r.data?.encoding!=='base64'||!r.data?.content)continue;
      const text=Buffer.from(String(r.data.content).replace(/\s/g,''),'base64').toString('utf8');
      names.push(...extractEnvironmentNames(text));scanned++;
    }catch{}
  }
  return{names:uniq(names).sort(),filesScanned:scanned};
}

async function netlifySites(token,{fetchImpl=fetch}={}){
  const r=await fetchJson('https://api.netlify.com/api/v1/sites?per_page=100',token,{fetchImpl});
  if(!r.ok||!Array.isArray(r.data))return{ok:false,sites:[]};
  return{ok:true,sites:r.data.map(x=>({id:x.id,url:x.url,sslUrl:x.ssl_url,customDomain:x.custom_domain,repoUrl:x.build_settings?.repo_url||null,accountId:x.account_id||null,accountSlug:x.account_slug||null,publish:x.build_settings?.dir||null,base:x.build_settings?.base||null,cmd:x.build_settings?.cmd||null})).filter(x=>x.id)};
}

async function netlifyDeploy(token,siteId,{fetchImpl=fetch}={}){
  const r=await fetchJson(`https://api.netlify.com/api/v1/sites/${encodeURIComponent(siteId)}/deploys?per_page=1`,token,{fetchImpl});
  const d=Array.isArray(r.data)?r.data[0]:null;
  if(!r.ok||!d)return null;
  return{id:d.id,state:d.state||null,branch:d.branch||null,context:d.context||null,commitRef:d.commit_ref||d.commit||null,errorMessage:d.error_message||null,createdAt:d.created_at||null,publishedAt:d.published_at||null};
}

async function netlifyEnvironmentMetadata(token,site,{fetchImpl=fetch}={}){
  let account=site.accountId||site.accountSlug;
  if(!account){
    const detail=await fetchJson(`https://api.netlify.com/api/v1/sites/${encodeURIComponent(site.id)}`,token,{fetchImpl});
    account=detail.data?.account_id||detail.data?.account_slug||null;
  }
  if(!account)return{ok:false,keys:[],secretCount:0,contexts:[],scopes:[]};
  const url=`https://api.netlify.com/api/v1/accounts/${encodeURIComponent(account)}/env?site_id=${encodeURIComponent(site.id)}`;
  const r=await fetchJson(url,token,{fetchImpl});
  if(!r.ok||!Array.isArray(r.data))return{ok:false,keys:[],secretCount:0,contexts:[],scopes:[]};
  // Values are intentionally discarded immediately. Only names/scopes/contexts are retained.
  const keys=[];const contexts=[];const scopes=[];let secretCount=0;
  for(const item of r.data){
    if(item?.key)keys.push(String(item.key));
    if(item?.is_secret)secretCount++;
    for(const s of Array.isArray(item?.scopes)?item.scopes:[])scopes.push(String(s));
    for(const v of Array.isArray(item?.values)?item.values:[])if(v?.context)contexts.push(String(v.context));
  }
  return{ok:true,keys:uniq(keys).sort(),secretCount,contexts:uniq(contexts).sort(),scopes:uniq(scopes).sort()};
}

function repoFromUrl(value){
  const text=clean(value).replace(/\.git$/,'').replace(/^git@github\.com:/,'https://github.com/');
  const m=text.match(/github\.com[/:]([^/]+)\/([^/]+)$/i);return m?`${m[1]}/${m[2]}`:null;
}

export async function buildEnvironmentDeploymentEvidence({workspace,secrets={},fetchImpl=fetch}={}){
  const checks=[];
  if(!secrets.netlify)return{checks};
  const sites=await netlifySites(secrets.netlify,{fetchImpl});
  if(!sites.ok)return{checks};
  const target=hostOf(workspace?.siteOrigin);
  const site=sites.sites.find(s=>[s.url,s.sslUrl,s.customDomain].map(hostOf).includes(target));
  if(!site)return{checks};

  const deploy=await netlifyDeploy(secrets.netlify,site.id,{fetchImpl}).catch(()=>null);
  if(deploy){
    const successful=['ready','uploaded'].includes(String(deploy.state||'').toLowerCase());
    checks.push(relation('env.netlify-deploy-state','Netlify production deploy',successful?'PASS':'FAIL',successful?'The latest Netlify deploy is in a successful published state.':`The latest Netlify deploy state is ${deploy.state||'unknown'}.`,{state:deploy.state,branch:deploy.branch,context:deploy.context,commitRef:clean(deploy.commitRef).slice(0,12)||null}));
  }

  const meta=await netlifyEnvironmentMetadata(secrets.netlify,site,{fetchImpl}).catch(()=>null);
  const repo=repoFromUrl(site.repoUrl);
  let expected={names:[],filesScanned:0};
  if(repo&&secrets.github){
    const branch=deploy?.branch||'main';
    expected=await githubSourceEnvNames(secrets.github,repo,branch,{fetchImpl}).catch(()=>expected);
  }

  if(meta?.ok){
    const configured=new Set(meta.keys);
    const required=expected.names;
    const missing=required.filter(name=>!configured.has(name));
    const present=required.filter(name=>configured.has(name));
    checks.push(relation('env.netlify-config-coverage','GitHub source → Netlify environment',required.length===0?'WARN':missing.length?'WARN':'PASS',required.length===0?'WeaveRelay could not infer environment-variable names from the safe source files it scanned.':missing.length?`${present.length} of ${required.length} environment-variable names referenced by safe source files are configured in Netlify; ${missing.length} appear missing.`:`All ${required.length} environment-variable names referenced by the safe source files are configured in Netlify.`,{expectedKeyCount:required.length,configuredKeyCount:meta.keys.length,presentKeyCount:present.length,missingKeyCount:missing.length,missingKeys:missing.slice(0,20),sourceFilesScanned:expected.filesScanned,secretVariableCount:meta.secretCount,contexts:meta.contexts,scopes:meta.scopes,valuesRetained:false}));
  }else{
    checks.push(relation('env.netlify-config-coverage','GitHub source → Netlify environment','WARN','Netlify is connected, but WeaveRelay could not read environment-variable metadata for this site.',{valuesRetained:false}));
  }

  if(site.publish||site.base||site.cmd){
    checks.push(relation('env.netlify-build-settings','Netlify build settings','PASS','WeaveRelay read the active Netlify build configuration without changing it.',{hasPublishDirectory:Boolean(site.publish),hasBaseDirectory:Boolean(site.base),hasBuildCommand:Boolean(site.cmd)}));
  }
  return{checks};
}
