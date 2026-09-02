const rank={PASS:0,SKIPPED:1,WARN:2,FAIL:3};
const clean=v=>String(v??'').trim();

const PROVIDERS={
  github:{label:'GitHub',url:'https://github.com/'},
  netlify:{label:'Netlify',url:'https://app.netlify.com/'},
  railway:{label:'Railway',url:'https://railway.com/dashboard'},
  supabase:{label:'Supabase',url:'https://supabase.com/dashboard'},
  stripe:{label:'Stripe',url:'https://dashboard.stripe.com/webhooks'}
};

export function sanitizeSnapshot(input={}){
  const checks=Array.isArray(input.checks)?input.checks:[];
  return {product:clean(input.product).slice(0,80)||'Unknown app',version:clean(input.version).slice(0,80)||null,generatedAt:clean(input.generatedAt)||new Date().toISOString(),mode:'read-only',topology:input.topology&&typeof input.topology==='object'?input.topology:{},checks:checks.slice(0,100).map(c=>({id:clean(c.id).slice(0,120),label:clean(c.label).slice(0,120),status:['PASS','WARN','FAIL','SKIPPED'].includes(c.status)?c.status:'WARN',detail:clean(c.detail).slice(0,1000),evidence:safeEvidence(c.evidence)})).filter(c=>c.id)};
}
function safeEvidence(value,depth=0){if(depth>3||value==null)return null;if(typeof value==='string')return value.slice(0,500);if(typeof value==='number'||typeof value==='boolean')return value;if(Array.isArray(value))return value.slice(0,20).map(v=>safeEvidence(v,depth+1));if(typeof value==='object'){const out={};for(const [k,v] of Object.entries(value).slice(0,30)){if(/secret|token|password|key|authorization|cookie/i.test(k))continue;out[k.slice(0,80)]=safeEvidence(v,depth+1)}return out}return null}
function byId(snapshot){return Object.fromEntries(snapshot.checks.map(c=>[c.id,c]))}
function finding(id,severity,title,explanation,evidence=[],actions=[],provider=null,repair=null){const p=provider?PROVIDERS[provider]:null;return{id,severity,title,explanation,evidence,actions,provider:provider||null,repair:repair||{supported:false,approvalRequired:true,label:'Guided repair coming next'},openProvider:p?{label:`Open ${p.label}`,url:p.url}:null}}
function reconnectRepair(provider){return{supported:true,approvalRequired:true,type:'reconnect-provider',provider,label:`Reconnect ${PROVIDERS[provider]?.label||provider}`}}
function add(findings,check,id,severity,title,actions,provider=null,repair=null){if(check&&check.status!=='PASS')findings.push(finding(id,severity,title,check.detail,[check.id],actions,provider,repair))}

export function diagnoseSnapshot(input={}){
  const snapshot=sanitizeSnapshot(input);const c=byId(snapshot);const findings=[];const active=snapshot.checks.filter(x=>x.status!=='SKIPPED');
  if(c['github.live']?.status==='FAIL')findings.push(finding('github-unreachable','high','GitHub connection is failing',c['github.live'].detail,['github.live'],['Reconnect GitHub, then WeaveRelay will verify the connection again.'],'github',reconnectRepair('github')));
  if(c['supabase.live']?.status==='FAIL')findings.push(finding('supabase-unreachable','high','Supabase connection is failing',c['supabase.live'].detail,['supabase.live'],['Reconnect Supabase, then WeaveRelay will verify the credential before saving it.'],'supabase',reconnectRepair('supabase')));
  if(c['railway.runtime']?.status==='FAIL')findings.push(finding('railway-unreachable','high','Railway connection is failing',c['railway.runtime'].detail,['railway.runtime'],['Reconnect Railway, then WeaveRelay will verify the credential before saving it.'],'railway',reconnectRepair('railway')));
  if(c['netlify.account']?.status==='FAIL')findings.push(finding('netlify-unreachable','high','Netlify connection is failing',c['netlify.account'].detail,['netlify.account'],['Reconnect Netlify, then WeaveRelay will verify the credential before saving it.'],'netlify',reconnectRepair('netlify')));
  if(c['stripe.live']?.status==='FAIL')findings.push(finding('stripe-unreachable','high','Stripe connection is failing',c['stripe.live'].detail,['stripe.live'],['Reconnect Stripe with the required restricted permission; WeaveRelay will verify it before saving it.'],'stripe',reconnectRepair('stripe')));
  if(c['app.public']?.status==='FAIL')findings.push(finding('public-app-unreachable','critical','The customer app is not reachable',c['app.public'].detail,['app.public'],['Check the production URL, DNS, and latest hosting deploy first.'],'netlify'));
  add(findings,c['map.netlify-site'],'netlify-site-mismatch','high','The app does not match the connected Netlify site',['Verify that the app URL belongs to the Netlify account you connected.'],'netlify');
  add(findings,c['map.github-netlify'],'github-netlify-link','high','Netlify and GitHub do not agree on the source repository',['Check which GitHub repository the Netlify site builds from.'],'netlify');
  add(findings,c['map.github-netlify-deploy'],'github-netlify-deploy-drift','high','The deployed Netlify version is behind GitHub',['Inspect the latest deploy and redeploy the intended commit.'],'netlify',{supported:false,approvalRequired:true,label:'Redeploy intended commit'});
  if(c['map.app-supabase']?.status==='FAIL')findings.push(finding('supabase-project-mismatch','critical','The app points at a different Supabase project',c['map.app-supabase'].detail,['map.app-supabase'],['Compare the production Supabase project reference with the intended project.'],'supabase',{supported:false,approvalRequired:true,label:'Correct project reference'}));
  else add(findings,c['map.app-supabase'],'supabase-link-unproven','medium','The app-to-Supabase relationship is not fully proven',['Confirm which Supabase project production should use.'],'supabase');
  add(findings,c['map.app-railway'],'railway-link-unproven','medium','The app-to-Railway relationship is not fully proven',['Confirm the production backend endpoint and Railway project.'],'railway');
  add(findings,c['map.app-stripe'],'stripe-link-unproven','medium','The app-to-Stripe relationship is not fully proven',['Confirm the production Stripe account and webhook configuration.'],'stripe');
  add(findings,c['runtime.railway-env-coverage'],'railway-runtime-config','high','Railway runtime configuration needs attention',['Review the missing runtime configuration names before changing another provider.'],'railway',{supported:false,approvalRequired:true,label:'Repair Railway configuration'});
  add(findings,c['payments.stripe-webhooks'],'stripe-webhook-boundary','high','Stripe webhook boundary needs attention',['Review Stripe webhook access/configuration for this production app.'],'stripe',{supported:false,approvalRequired:true,label:'Repair Stripe webhook'});
  add(findings,c['map.cross-system'],'cross-system-map-incomplete','medium','The cross-system map could not be completed',['Run diagnosis again and verify each connected provider is still readable.']);
  for(const check of active){if(check.status==='WARN'&&!findings.some(f=>f.evidence.includes(check.id)))findings.push(finding(`warn-${check.id}`,'medium',`${check.label} needs attention`,check.detail,[check.id],['Verify this connection in WeaveRelay.']));if(check.status==='FAIL'&&!findings.some(f=>f.evidence.includes(check.id)))findings.push(finding(`fail-${check.id}`,'high',`${check.label} failed`,check.detail,[check.id],['Inspect this failure boundary before changing another system.']))}
  const severityRank={critical:4,high:3,medium:2,low:1};findings.sort((a,b)=>(severityRank[b.severity]||0)-(severityRank[a.severity]||0));const worst=active.reduce((m,x)=>rank[x.status]>rank[m]?x.status:m,'PASS');const passed=active.filter(x=>x.status==='PASS').length;const headline=findings[0]?.title||(worst==='PASS'?'No cross-system failure found in the current read-only snapshot':'More connection evidence is needed');
  return{mode:'read-only',status:worst==='FAIL'?'broken':findings.length?'attention':'healthy',headline,summary:`${passed} of ${active.length} active checks passed. ${findings.length} diagnostic finding${findings.length===1?'':'s'}.`,findings,safeRepairs:findings.map(f=>({finding:f.id,label:f.repair?.label||'Review issue',supported:Boolean(f.repair?.supported),approvalRequired:f.repair?.approvalRequired!==false,type:f.repair?.type||null,provider:f.repair?.provider||f.provider||null,openProvider:f.openProvider})).slice(0,20),destructiveChangesAllowed:false,diagnosedAt:new Date().toISOString()};
}
