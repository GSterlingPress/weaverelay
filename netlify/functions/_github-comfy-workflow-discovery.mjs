import{readConnection,readSecret}from'./_workspace-store.mjs';
import{decryptSecret}from'./_vault.mjs';

const UA='weaverelay-comfy-workflow-discovery';
const clean=v=>String(v??'').trim();
const uniq=a=>[...new Set((a||[]).filter(Boolean))];
const timeout=ms=>AbortSignal.timeout?AbortSignal.timeout(ms):undefined;

async function secretFor(workspaceId,provider){
  if(!workspaceId)return null;
  const c=await readConnection(workspaceId,provider).catch(()=>null);if(!c?.id||c.status==='revoked')return null;
  const encrypted=await readSecret(c.id).catch(()=>null);if(!encrypted)return null;
  try{return decryptSecret(encrypted)?.accessToken||null}catch{return null}
}
async function api(url,token,fetchImpl=fetch){
  const r=await fetchImpl(url,{headers:{authorization:`Bearer ${token}`,'user-agent':UA,accept:'application/vnd.github+json,application/json'},signal:timeout(9000)});
  const data=await r.json().catch(()=>null);return{ok:r.ok,status:r.status,data};
}
function hostOf(v){try{return new URL(v).hostname.toLowerCase()}catch{return''}}
function repoSlug(v){
  const s=clean(v).replace(/^git\+/, '').replace(/\.git$/,'').replace(/^git@github\.com:/,'https://github.com/').replace(/^ssh:\/\/git@github\.com\//,'https://github.com/');
  const m=s.match(/github\.com[/:]([^/]+)\/([^/#]+)$/i);return m?`${m[1]}/${m[2]}`:null;
}
async function resolveRepo({workspace,githubToken,netlifyToken,fetchImpl}){
  if(!workspace?.siteOrigin||!netlifyToken)return{ok:false,reason:'netlify-context-unavailable'};
  const r=await fetchImpl('https://api.netlify.com/api/v1/sites?per_page=100',{headers:{authorization:`Bearer ${netlifyToken}`,'user-agent':UA,accept:'application/json'},signal:timeout(9000)});
  const sites=await r.json().catch(()=>null);if(!r.ok||!Array.isArray(sites))return{ok:false,reason:'netlify-sites-unreadable'};
  const wanted=hostOf(workspace.siteOrigin),matches=sites.filter(s=>[s.url,s.ssl_url,s.custom_domain].map(hostOf).includes(wanted));
  if(matches.length!==1)return{ok:false,reason:matches.length?'netlify-site-ambiguous':'netlify-site-unmatched'};
  const repo=repoSlug(matches[0]?.build_settings?.repo_url||matches[0]?.repo_url);if(!repo)return{ok:false,reason:'repo-unreported'};
  const meta=await api(`https://api.github.com/repos/${repo}`,githubToken,fetchImpl);if(!meta.ok)return{ok:false,reason:'github-repo-unreadable'};
  const branch=clean(matches[0]?.build_settings?.repo_branch)||clean(meta.data?.default_branch)||'main';
  return{ok:true,repo,branch};
}
function workflowCandidate(e={}){const p=String(e.path||'');return e.type==='blob'&&Number(e.size||0)>0&&Number(e.size||0)<=220000&&/\.json$/i.test(p)&&/(comfy|workflow|vace|wan)/i.test(p)}
function sourceCandidate(e={}){const p=String(e.path||'');return e.type==='blob'&&Number(e.size||0)>0&&Number(e.size||0)<=180000&&/\.(?:js|mjs|cjs|ts|tsx|jsx|json|toml|ya?ml)$/i.test(p)&&/(comfy|runpod|workflow|engine|worker|server|app|config|video)/i.test(p)&&!workflowCandidate(e)}
async function content(repo,path,branch,token,fetchImpl){
  const r=await api(`https://api.github.com/repos/${repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(branch)}`,token,fetchImpl);
  if(!r.ok||r.data?.encoding!=='base64'||!r.data?.content)return null;
  try{return Buffer.from(String(r.data.content).replace(/\s/g,''),'base64').toString('utf8')}catch{return null}
}
function isWorkflow(o){if(!o||typeof o!=='object'||Array.isArray(o))return false;return Object.entries(o).filter(([k,v])=>!String(k).startsWith('_')&&v&&typeof v==='object'&&typeof v.class_type==='string').length>=2}

export async function discoverSelectedComfyWorkflow({workspace,githubToken=null,netlifyToken=null,fetchImpl=fetch}={}){
  githubToken=githubToken||await secretFor(workspace?.id,'github');netlifyToken=netlifyToken||await secretFor(workspace?.id,'netlify');
  if(!githubToken||!netlifyToken)return{status:'WARN',classification:'provider-context-unavailable',detail:'GitHub workflow discovery needs both the connected GitHub and Netlify contexts for this app.',evidence:{source:'weaverelay-github-comfy-workflow',workflowSelected:false,repositoryNamesRetained:false,sourceBodiesRetained:false,workflowBodiesRetained:false}};
  const rr=await resolveRepo({workspace,githubToken,netlifyToken,fetchImpl});if(!rr.ok)return{status:'WARN',classification:rr.reason,detail:'WeaveRelay could not prove one GitHub repository for this deployed app, so it will not guess which ComfyUI workflow is selected.',evidence:{source:'weaverelay-github-comfy-workflow',workflowSelected:false,repositoryNamesRetained:false,sourceBodiesRetained:false,workflowBodiesRetained:false}};
  const tree=await api(`https://api.github.com/repos/${rr.repo}/git/trees/${encodeURIComponent(rr.branch)}?recursive=1`,githubToken,fetchImpl);const entries=Array.isArray(tree.data?.tree)?tree.data.tree:[];
  if(!tree.ok||!entries.length)return{status:'WARN',classification:'github-tree-unreadable',detail:'The application repository was identified, but its workflow tree could not be inspected.',evidence:{source:'weaverelay-github-comfy-workflow',workflowSelected:false,repositoryNamesRetained:false}};
  const candidates=[];
  for(const e of entries.filter(workflowCandidate).slice(0,16)){
    const txt=await content(rr.repo,e.path,rr.branch,githubToken,fetchImpl);if(!txt)continue;
    try{const workflow=JSON.parse(txt);if(isWorkflow(workflow))candidates.push({path:e.path,workflow})}catch{}
  }
  if(!candidates.length)return{status:'WARN',classification:'no-runnable-workflow',detail:'No runnable ComfyUI API-format workflow JSON was found in the proven application repository.',evidence:{source:'weaverelay-github-comfy-workflow',workflowCandidateCount:0,workflowSelected:false,repositoryNamesRetained:false,workflowBodiesRetained:false}};
  const source=[];for(const e of entries.filter(sourceCandidate).slice(0,36)){const txt=await content(rr.repo,e.path,rr.branch,githubToken,fetchImpl);if(txt)source.push(txt)}const corpus=source.join('\n');
  const referenced=candidates.filter(c=>corpus.includes(c.path)||corpus.includes(c.path.split('/').pop()));
  let selected=null,selectionProof=null;
  if(referenced.length===1){selected=referenced[0];selectionProof='source-reference'}
  else if(referenced.length===0&&candidates.length===1){selected=candidates[0];selectionProof='sole-runnable-candidate'}
  if(!selected){return{status:'WARN',classification:referenced.length>1?'multiple-referenced-workflows':'multiple-runnable-workflows',detail:'Multiple runnable ComfyUI workflows exist and the connected source does not prove exactly one selected workflow. WeaveRelay will not guess.',evidence:{source:'weaverelay-github-comfy-workflow',workflowCandidateCount:candidates.length,sourceReferencedWorkflowCount:referenced.length,workflowSelected:false,repositoryNamesRetained:false,sourceBodiesRetained:false,workflowBodiesRetained:false}}}
  return{status:'PASS',classification:'selected',detail:selectionProof==='source-reference'?'GitHub source references exactly one runnable ComfyUI workflow, so WeaveRelay can compare that selected workflow with the live runtime.':'The proven repository contains exactly one runnable ComfyUI workflow, so it is the only safe workflow candidate to compare with the live runtime.',workflow:selected.workflow,evidence:{source:'weaverelay-github-comfy-workflow',workflowCandidateCount:candidates.length,sourceReferencedWorkflowCount:referenced.length,workflowSelected:true,selectionProof,workflowPath:selected.path,repositoryNamesRetained:false,sourceBodiesRetained:false,workflowBodiesRetained:false}};
}
