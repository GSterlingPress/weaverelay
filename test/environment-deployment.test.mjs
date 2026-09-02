import test from 'node:test';
import assert from 'node:assert/strict';
import{extractEnvironmentNames,buildEnvironmentDeploymentEvidence}from'../netlify/functions/_environment-deployment.mjs';

const response=(data,status=200)=>({ok:status>=200&&status<300,status,json:async()=>data});

test('extractEnvironmentNames finds names but never values',()=>{
  const text=`const a=process.env.PUBLIC_API_URL; const b=process.env['STRIPE_SECRET_KEY']; const c=import.meta.env.VITE_SUPABASE_URL; const d=Deno.env.get('EDGE_TOKEN');`;
  assert.deepEqual(extractEnvironmentNames(text),['EDGE_TOKEN','PUBLIC_API_URL','STRIPE_SECRET_KEY','VITE_SUPABASE_URL']);
});

test('environment diagnosis compares names only and discards Netlify values',async()=>{
  const source=`export const endpoint=process.env.PUBLIC_API_URL; export const mode=process.env.NODE_ENV;`;
  const fetchImpl=async(url)=>{
    const u=String(url);
    if(u.includes('/api/v1/sites?'))return response([{id:'site-1',ssl_url:'https://app.example.com',build_settings:{repo_url:'https://github.com/acme/app',dir:'dist',cmd:'npm run build'},account_id:'acct-1'}]);
    if(u.includes('/deploys?'))return response([{id:'deploy-1',state:'ready',branch:'main',context:'production',commit_ref:'abcdef1234567890'}]);
    if(u.includes('/accounts/acct-1/env?'))return response([
      {key:'PUBLIC_API_URL',is_secret:false,scopes:['builds'],values:[{context:'production',value:'https://private.example'}]},
      {key:'UNRELATED_SECRET',is_secret:true,scopes:['functions'],values:[{context:'all',value:'do-not-return-me'}]}
    ]);
    if(u.includes('/git/trees/main?'))return response({tree:[{type:'blob',path:'app.js',size:source.length}]});
    if(u.includes('/contents/app.js?'))return response({encoding:'base64',content:Buffer.from(source).toString('base64')});
    throw new Error(`Unexpected URL ${u}`);
  };
  const result=await buildEnvironmentDeploymentEvidence({workspace:{siteOrigin:'https://app.example.com'},secrets:{netlify:'n',github:'g'},fetchImpl});
  const env=result.checks.find(x=>x.id==='env.netlify-config-coverage');
  assert.equal(env.status,'WARN');
  assert.equal(env.evidence.expectedKeyCount,2);
  assert.equal(env.evidence.presentKeyCount,1);
  assert.deepEqual(env.evidence.missingKeys,['NODE_ENV']);
  assert.equal(env.evidence.valuesRetained,false);
  assert.equal(JSON.stringify(result).includes('do-not-return-me'),false);
  assert.equal(JSON.stringify(result).includes('https://private.example'),false);
});
