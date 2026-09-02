const UA='weaverelay-netlify-redeploy';
const clean=v=>String(v??'').trim();
const hostOf=value=>{try{return new URL(value).hostname.toLowerCase()}catch{return''}};
const repoNorm=value=>clean(value).replace(/^git\+/, '').replace(/\.git$/,'').replace(/^git@github\.com:/,'https://github.com/').replace(/^ssh:\/\/git@github\.com\//,'https://github.com/').toLowerCase();
const timeout=ms=>AbortSignal.timeout?AbortSignal.timeout(ms):undefined;

async function netlifyJson(token,path,{fetchImpl=fetch,method='GET',body}={}){
  const headers={authorization:`Bearer ${token}`,'user-agent':UA,accept:'application/json'};
  if(body!==undefined)headers['content-type']='application/json';
  const response=await fetchImpl(`https://api.netlify.com/api/v1${path}`,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:timeout(10000)});
  const data=await response.json().catch(()=>null);
  return{ok:response.ok,status:response.status,data};
}
async function githubJson(token,path,{fetchImpl=fetch}={}){
  const response=await fetchImpl(`https://api.github.com${path}`,{headers:{authorization:`Bearer ${token}`,accept:'application/vnd.github+json','user-agent':UA},signal:timeout(10000)});
  const data=await response.json().catch(()=>null);return{ok:response.ok,status:response.status,data};
}

export function selectNetlifyRedeployTarget({siteOrigin,sites=[],githubRepos=[]}={}){
  const targetHost=hostOf(siteOrigin);
  const matches=(Array.isArray(sites)?sites:[]).filter(site=>[site.url,site.ssl_url,site.custom_domain].map(hostOf).includes(targetHost));
  if(matches.length!==1)return{eligible:false,reason:matches.length?'Multiple Netlify sites match the production hostname.':'No Netlify site matches the production hostname.'};
  const site=matches[0],repoUrl=site.build_settings?.repo_url||site.repo_url||'',repo=repoNorm(repoUrl);
  if(!repo)return{eligible:false,reason:'The matched Netlify site does not expose a Git-backed source repository.'};
  const repos=(Array.isArray(githubRepos)?githubRepos:[]).filter(r=>repoNorm(r.html_url)===repo);
  if(repos.length!==1)return{eligible:false,reason:repos.length?'Multiple GitHub repository matches were found.':'The Netlify source repository is not visible through the connected GitHub authorization.'};
  const branch=clean(site.build_settings?.repo_branch||repos[0].default_branch);
  if(!branch)return{eligible:false,reason:'The production branch could not be proven.'};
  return{eligible:true,siteId:clean(site.id),siteName:clean(site.name),branch,repository:clean(repos[0].full_name),reason:'Exactly one production Netlify site, one GitHub source repository, and one production branch were proven.'};
}

export async function inspectNetlifyRedeploy({workspace,netlifyToken,githubToken,fetchImpl=fetch}={}){
  if(!workspace?.siteOrigin||!netlifyToken||!githubToken)return{eligible:false,reason:'Netlify, GitHub, and a production site URL are required.'};
  const [sites,repos]=await Promise.all([
    netlifyJson(netlifyToken,'/sites?per_page=100',{fetchImpl}),
    githubJson(githubToken,'/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member',{fetchImpl})
  ]);
  if(!sites.ok||!Array.isArray(sites.data))return{eligible:false,reason:`Netlify site inventory could not be read${sites.status?` (HTTP ${sites.status})`:''}.`};
  if(!repos.ok||!Array.isArray(repos.data))return{eligible:false,reason:`GitHub repository inventory could not be read${repos.status?` (HTTP ${repos.status})`:''}.`};
  const target=selectNetlifyRedeployTarget({siteOrigin:workspace.siteOrigin,sites:sites.data,githubRepos:repos.data});
  if(!target.eligible)return target;
  const deploys=await netlifyJson(netlifyToken,`/sites/${encodeURIComponent(target.siteId)}/deploys?per_page=1`,{fetchImpl});
  const latest=Array.isArray(deploys.data)?deploys.data[0]:null;
  if(!deploys.ok||!latest)return{eligible:false,reason:'The latest Netlify deploy could not be read.'};
  return{...target,latestDeployState:clean(latest.state),latestDeployBranch:clean(latest.branch),latestCommit:clean(latest.commit_ref||latest.commit).slice(0,40),latestDeployId:clean(latest.id)};
}

export async function triggerNetlifyRedeploy({workspace,netlifyToken,githubToken,fetchImpl=fetch}={}){
  const target=await inspectNetlifyRedeploy({workspace,netlifyToken,githubToken,fetchImpl});
  if(!target.eligible)throw new Error(target.reason||'Netlify redeploy is not safely targetable.');
  const result=await netlifyJson(netlifyToken,`/sites/${encodeURIComponent(target.siteId)}/builds?branch=${encodeURIComponent(target.branch)}&title=${encodeURIComponent('WeaveRelay approved recovery build')}`,{method:'POST',fetchImpl});
  if(!result.ok)throw new Error(`Netlify rejected the approved rebuild${result.status?` (HTTP ${result.status})`:''}.`);
  const buildId=clean(result.data?.id),deployId=clean(result.data?.deploy_id);
  if(!buildId&&!deployId)throw new Error('Netlify accepted the request but did not return a build or deploy identifier, so WeaveRelay cannot verify it safely.');
  return{requested:true,siteId:target.siteId,siteName:target.siteName||null,branch:target.branch,repository:target.repository,buildId:buildId||null,deployId:deployId||null,beforeDeployId:target.latestDeployId||null,requestedAt:new Date().toISOString(),verificationPending:true,sourceChanged:false,environmentChanged:false};
}

export async function verifyNetlifyRedeploy({workspace,repair,netlifyToken,githubToken,fetchImpl=fetch}={}){
  if(!repair?.siteId||!repair?.branch||!repair?.repository||!netlifyToken||!githubToken)return{status:'WARN',detail:'The Netlify rebuild was requested, but verification metadata is incomplete.',evidence:{verificationPending:true}};
  const [deploys,head]=await Promise.all([
    netlifyJson(netlifyToken,`/sites/${encodeURIComponent(repair.siteId)}/deploys?per_page=3`,{fetchImpl}),
    githubJson(githubToken,`/repos/${repair.repository.split('/').map(encodeURIComponent).join('/')}/commits/${encodeURIComponent(repair.branch)}`,{fetchImpl})
  ]);
  if(!deploys.ok||!Array.isArray(deploys.data))return{status:'WARN',detail:'Netlify rebuild verification could not read the latest deploys.',evidence:{verificationPending:true,httpStatus:deploys.status||null}};
  const candidates=deploys.data.filter(d=>clean(d.branch)===repair.branch);
  const latest=candidates[0]||deploys.data[0];
  if(!latest)return{status:'WARN',detail:'The rebuild was requested, but no resulting Netlify deploy is visible yet.',evidence:{verificationPending:true}};
  const latestId=clean(latest.id),state=clean(latest.state).toLowerCase(),commit=clean(latest.commit_ref||latest.commit),headSha=head.ok?clean(head.data?.sha):'';
  const isNew=Boolean(latestId&&latestId!==clean(repair.beforeDeployId));
  const ready=['ready','uploaded'].includes(state);
  const sourceMatch=Boolean(commit&&headSha&&(commit.startsWith(headSha)||headSha.startsWith(commit)));
  let publicHealthy=false,httpStatus=null;
  if(ready&&workspace?.siteOrigin){try{const r=await fetchImpl(workspace.siteOrigin,{method:'GET',redirect:'follow',headers:{'user-agent':UA,'cache-control':'no-cache'},signal:timeout(8000)});httpStatus=r.status;publicHealthy=r.status>=200&&r.status<400;await r.body?.cancel?.().catch?.(()=>{})}catch{}}
  if(!isNew)return{status:'WARN',detail:'Netlify has not exposed a new production deploy for the approved rebuild yet.',evidence:{verificationPending:true,newDeployObserved:false,state:state||null}};
  if(['error','failed'].includes(state))return{status:'FAIL',detail:'The approved Netlify rebuild produced a failed deploy.',evidence:{verificationPending:false,newDeployObserved:true,state,sourceMatch,publicHealthy:false}};
  if(!ready)return{status:'WARN',detail:`A new Netlify deploy is visible and is currently ${state||'processing'}.`,evidence:{verificationPending:true,newDeployObserved:true,state,sourceMatch}};
  if(!sourceMatch)return{status:'FAIL',detail:'The new Netlify deploy completed, but it does not match the current proven GitHub branch head.',evidence:{verificationPending:false,newDeployObserved:true,state,sourceMatch:false,publicHealthy}};
  if(!publicHealthy)return{status:'FAIL',detail:'The approved Netlify rebuild completed from the correct GitHub branch, but the public application is still not healthy.',evidence:{verificationPending:false,newDeployObserved:true,state,sourceMatch:true,publicHealthy:false,httpStatus}};
  return{status:'PASS',detail:'The approved Netlify rebuild produced a new successful deploy from the current proven GitHub branch, and the public application is responding successfully.',evidence:{verificationPending:false,newDeployObserved:true,state,sourceMatch:true,publicHealthy:true,httpStatus}};
}
