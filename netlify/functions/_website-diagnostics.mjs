import { publicFetch } from './_public-url.mjs';

const UA='WeaveRelay-Website-Diagnostics/1.1';
const timeout=ms=>AbortSignal.timeout?AbortSignal.timeout(ms):undefined;
const clean=v=>String(v??'').trim();
const safeUrl=value=>{try{const u=new URL(clean(value));return ['https:','http:'].includes(u.protocol)?u:null}catch{return null}};
const sameOrigin=(a,b)=>{try{return new URL(a).origin===new URL(b).origin}catch{return false}};
const absolute=(base,value)=>{try{return new URL(value,base).href}catch{return null}};
const unique=a=>[...new Set(a.filter(Boolean))];
const check=(id,label,status,detail,evidence={})=>({id,label,status,detail,evidence:{source:'weaverelay-website-diagnostics',...evidence}});

async function request(url,{fetchImpl=fetch,method='GET'}={}){
  const r=await publicFetch(url,{method,headers:{'user-agent':UA,accept:'text/html,application/json,text/css,application/javascript,*/*'},signal:timeout(8000)},{fetchImpl,allowLocalDev:false});
  const contentType=r.headers?.get?.('content-type')||'';
  const text=method==='HEAD'?'':(await r.text()).slice(0,500000);
  return{ok:r.ok,status:r.status,url:r.url||String(url),contentType,text};
}

function extractAssets(html,base){
  const out=[];let m;
  const script=/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  while((m=script.exec(html))&&out.length<12){const url=absolute(base,m[1]);if(url)out.push({kind:'script',url})}
  const style=/<link\b[^>]*\brel=["'][^"']*stylesheet[^"']*["'][^>]*\bhref=["']([^"']+)["'][^>]*>|<link\b[^>]*\bhref=["']([^"']+)["'][^>]*\brel=["'][^"']*stylesheet[^"']*["'][^>]*>/gi;
  while((m=style.exec(html))&&out.length<16){const url=absolute(base,m[1]||m[2]);if(url)out.push({kind:'stylesheet',url})}
  return out.slice(0,12);
}
function extractInternalLinks(html,base){
  const baseUrl=safeUrl(base);if(!baseUrl)return[];const out=[];let m;const re=/<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi;
  while((m=re.exec(html))&&out.length<20){const raw=clean(m[1]);if(!raw||raw.startsWith('#')||/^(mailto:|tel:|javascript:)/i.test(raw))continue;const url=absolute(base,raw);if(url&&sameOrigin(url,base))out.push(url)}
  return unique(out).slice(0,8);
}
function mixedAssets(assets,pageUrl){return assets.filter(a=>safeUrl(pageUrl)?.protocol==='https:'&&safeUrl(a.url)?.protocol==='http:')}
async function probeUrls(items,{fetchImpl=fetch}={}){
  const results=[];
  for(const item of items){try{const r=await request(item.url||item,{fetchImpl});results.push({...item,url:item.url||item,status:r.status,ok:r.ok,finalUrl:r.url})}catch{results.push({...item,url:item.url||item,status:null,ok:false,finalUrl:null})}}
  return results;
}
function safeFailureUrls(results,max=5){return results.filter(r=>!r.ok).slice(0,max).map(r=>({url:r.url,status:r.status,kind:r.kind||null}))}

async function probeSelfDiagnostic(origin,{fetchImpl=fetch}={}){
  for(const path of ['/.well-known/weaverelay/health','/api/weaverelay/diagnostic']){
    const url=new URL(path,origin).href;
    try{const r=await request(url,{fetchImpl});if(r.status===404)continue;if(!r.ok)return{found:true,url,status:'FAIL',detail:`The customer-owned WeaveRelay diagnostic endpoint returned HTTP ${r.status}.`,evidence:{httpStatus:r.status}};if(!/application\/json/i.test(r.contentType))return{found:true,url,status:'WARN',detail:'The customer-owned diagnostic endpoint responded, but not with JSON.',evidence:{httpStatus:r.status,contentType:r.contentType}};const data=JSON.parse(r.text||'{}'),state=clean(data.status||data.state).toLowerCase(),failed=Array.isArray(data.checks)?data.checks.filter(x=>['fail','failed','error','broken'].includes(clean(x?.status).toLowerCase())).length:0,warned=Array.isArray(data.checks)?data.checks.filter(x=>['warn','warning','degraded'].includes(clean(x?.status).toLowerCase())).length:0;const status=failed||['fail','failed','error','broken'].includes(state)?'FAIL':warned||['warn','warning','degraded'].includes(state)?'WARN':'PASS';return{found:true,url,status,detail:status==='PASS'?'The customer-owned application diagnostic reports healthy.':status==='FAIL'?`The customer-owned application diagnostic reports ${failed||1} failing application check${failed===1?'':'s'}.`:'The customer-owned application diagnostic reports degraded application health.',evidence:{httpStatus:r.status,checkCount:Array.isArray(data.checks)?data.checks.length:0,failedCheckCount:failed,warningCheckCount:warned,payloadRetained:false}}}catch(error){if(error instanceof SyntaxError)return{found:true,url,status:'WARN',detail:'The customer-owned diagnostic endpoint returned invalid JSON.',evidence:{payloadRetained:false}}}}
  return{found:false,url:null,status:'SKIPPED',detail:'No customer-owned WeaveRelay diagnostic endpoint is installed. Public website checks still ran.',evidence:{installOptional:true,payloadRetained:false}};
}

export async function buildWebsiteDiagnosticEvidence(siteOrigin,{fetchImpl=fetch}={}){
  const checks=[];const origin=safeUrl(siteOrigin);if(!origin)return{checks:[check('website.document','Website document','WARN','A valid website URL is required before website diagnostics can run.',{})]};
  let home;try{home=await request(origin.href,{fetchImpl})}catch(error){const unsafe=/private network|public https|resolved safely/i.test(String(error?.message||''));return{checks:[check('website.document','Website document',unsafe?'WARN':'FAIL',unsafe?'The configured website failed WeaveRelay public-network safety validation.':'The customer website could not be reached by the website diagnostic probe.',{url:origin.href,httpStatus:null})]}};
  checks.push(check('website.document','Website document',home.ok?'PASS':'FAIL',`The website document returned HTTP ${home.status}.`,{url:origin.href,finalUrl:home.url,httpStatus:home.status,contentType:home.contentType}));
  const html=/text\/html|application\/xhtml\+xml/i.test(home.contentType);
  checks.push(check('website.html-response','Website HTML response',home.ok&&!html?'WARN':'PASS',html?'The production URL returned an HTML document.':'The production URL did not return an HTML content type.',{contentType:home.contentType,finalUrl:home.url}));
  if(!home.ok||!html)return{checks};
  const assets=extractAssets(home.text,home.url),mixed=mixedAssets(assets,home.url);
  checks.push(check('website.mixed-content','Website mixed content',mixed.length?'FAIL':'PASS',mixed.length?`${mixed.length} script or stylesheet asset${mixed.length===1?' is':'s are'} loaded over HTTP from an HTTPS page.`:'No HTTP script or stylesheet references were found on the HTTPS page.',{mixedAssetCount:mixed.length,firstMixedUrl:mixed[0]?.url||null}));
  const assetResults=await probeUrls(assets,{fetchImpl}),sameOriginBroken=assetResults.filter(r=>sameOrigin(r.url,home.url)&&!r.ok),externalBroken=assetResults.filter(r=>!sameOrigin(r.url,home.url)&&!r.ok);
  checks.push(check('website.assets','Website scripts and styles',sameOriginBroken.length?'FAIL':externalBroken.length?'WARN':'PASS',sameOriginBroken.length?`${sameOriginBroken.length} same-site script or stylesheet asset${sameOriginBroken.length===1?' is':'s are'} broken.`:externalBroken.length?`${externalBroken.length} external script or stylesheet asset${externalBroken.length===1?' could':'s could'} not be verified.`:`${assetResults.length} discovered script/style asset${assetResults.length===1?'':'s'} verified without a same-site failure.`,{assetCount:assetResults.length,brokenSameOriginCount:sameOriginBroken.length,brokenExternalCount:externalBroken.length,brokenUrls:safeFailureUrls(assetResults),firstBrokenUrl:sameOriginBroken[0]?.url||externalBroken[0]?.url||null}));
  const links=extractInternalLinks(home.text,home.url),linkResults=await probeUrls(links,{fetchImpl}),brokenLinks=linkResults.filter(r=>!r.ok);
  checks.push(check('website.internal-links','Website internal navigation',brokenLinks.length?'WARN':'PASS',brokenLinks.length?`${brokenLinks.length} sampled internal page link${brokenLinks.length===1?' is':'s are'} returning an error.`:`${linkResults.length} sampled internal page link${linkResults.length===1?'':'s'} verified without an HTTP error.`,{sampledLinkCount:linkResults.length,brokenLinkCount:brokenLinks.length,brokenUrls:safeFailureUrls(linkResults),firstBrokenUrl:brokenLinks[0]?.url||null}));
  const self=await probeSelfDiagnostic(home.url,{fetchImpl});checks.push(check('website.self-diagnostic','Application self-diagnostic',self.status,self.detail,{url:self.url,...self.evidence}));
  return{checks};
}

function byId(snapshot){return Object.fromEntries((snapshot.checks||[]).map(c=>[c.id,c]))}
function safeOpen(url,label){const u=safeUrl(url);return u?{label,url:u.toString(),depth:'exact-failure'}:null}
function upsertFinding(diagnosis,finding){const i=(diagnosis.findings||[]).findIndex(f=>f.id===finding.id);if(i>=0)diagnosis.findings[i]=finding;else diagnosis.findings.push(finding)}
export function augmentWebsiteDiagnosis(diagnosis={},snapshot={}){
  const c=byId(snapshot),base={supported:false,approvalRequired:true,label:'SHOW ME HOW'};
  if(c['website.document']?.status==='FAIL')upsertFinding(diagnosis,{id:'website-document-failed',severity:'critical',title:'The website itself is not loading correctly',explanation:c['website.document'].detail,evidence:['website.document'],actions:['Open the exact production URL, then inspect DNS/hosting/deploy evidence before changing application code.'],provider:null,repair:base,openProvider:safeOpen(c['website.document'].evidence?.finalUrl||c['website.document'].evidence?.url,'Open failing website')});
  if(c['website.assets']?.status==='FAIL')upsertFinding(diagnosis,{id:'website-assets-broken',severity:'critical',title:'The website loads, but one of its own scripts or styles is broken',explanation:c['website.assets'].detail,evidence:['website.assets'],actions:['Open the first broken asset and correlate its path with the connected source repository and hosting deploy. Do not edit unrelated files.'],provider:null,repair:base,openProvider:safeOpen(c['website.assets'].evidence?.firstBrokenUrl,'Open broken asset')});
  if(c['website.mixed-content']?.status==='FAIL')upsertFinding(diagnosis,{id:'website-mixed-content',severity:'high',title:'The HTTPS website is loading an insecure script or stylesheet',explanation:c['website.mixed-content'].detail,evidence:['website.mixed-content'],actions:['Replace the proven HTTP asset reference with the intended HTTPS resource, then redeploy and verify the browser-facing page.'],provider:null,repair:base,openProvider:safeOpen(c['website.mixed-content'].evidence?.firstMixedUrl,'Open insecure asset')});
  if(c['website.internal-links']?.status==='WARN')upsertFinding(diagnosis,{id:'website-broken-navigation',severity:'medium',title:'At least one sampled internal website link is broken',explanation:c['website.internal-links'].detail,evidence:['website.internal-links'],actions:['Open the first failing internal URL and verify whether the route should exist before changing routing or source code.'],provider:null,repair:base,openProvider:safeOpen(c['website.internal-links'].evidence?.firstBrokenUrl,'Open broken page')});
  if(c['website.self-diagnostic']?.status==='FAIL')upsertFinding(diagnosis,{id:'website-application-self-check-failed',severity:'critical',title:'The website is reachable, but its own application diagnostic reports a failure',explanation:c['website.self-diagnostic'].detail,evidence:['website.self-diagnostic'],actions:['Use the customer-owned diagnostic result as application-level evidence, then correlate it with the connected backend/provider boundary before making a repair.'],provider:null,repair:base,openProvider:safeOpen(c['website.self-diagnostic'].evidence?.url,'Open application diagnostic')});
  if(c['website.browser-runtime']?.status==='FAIL'){const e=c['website.browser-runtime'].evidence||{},context=[e.journey,e.step].filter(Boolean).join(' → ');upsertFinding(diagnosis,{id:'website-browser-runtime-failed',severity:'critical',title:context?`${context} is failing in the customer browser`:'The website is failing inside the customer browser',explanation:c['website.browser-runtime'].detail,evidence:['website.browser-runtime'],actions:['Open the exact failing browser URL when available, then correlate the failure with the connected source/deploy/backend evidence. Do not change form data, payment state, or unrelated code.'],provider:null,repair:base,openProvider:safeOpen(e.url,'Open exact browser failure')})}
  const rank={critical:4,high:3,medium:2,low:1};diagnosis.findings=(diagnosis.findings||[]).sort((a,b)=>(rank[b.severity]||0)-(rank[a.severity]||0));if(diagnosis.findings[0])diagnosis.headline=diagnosis.findings[0].title;if(diagnosis.findings.some(f=>['critical','high'].includes(f.severity)))diagnosis.status='broken';diagnosis.safeRepairs=(diagnosis.findings||[]).map(f=>({finding:f.id,label:f.repair?.label||'SHOW ME HOW',supported:Boolean(f.repair?.supported),approvalRequired:f.repair?.approvalRequired!==false,type:f.repair?.type||null,provider:f.repair?.provider||f.provider||null,openProvider:f.openProvider||null})).slice(0,40);return diagnosis;
}
