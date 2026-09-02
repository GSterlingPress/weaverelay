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
  return{requested:true,siteName:target.siteName||null,branch:target.branch,repository:target.repository,buildId:buildId||null,deployId:deployId||null,requestedAt:new Date().toISOString(),verificationPending:true,sourceChanged:false,environmentChanged:false};
}
