import test from'node:test';
import assert from'node:assert/strict';
import fs from'node:fs';

const toml=fs.readFileSync(new URL('../netlify.toml',import.meta.url),'utf8');
const required={
 '/api/workspace':'workspace-get',
 '/api/workspace/create':'workspace-create',
 '/api/workspace/monitoring':'workspace-monitoring',
 '/api/diagnose':'diagnose-workspace-expanded',
 '/api/runtime/beacon':'runtime-beacon',
 '/api/synthetic/journey':'synthetic-journey-config',
 '/api/synthetic/run':'synthetic-journey-run',
 '/api/provider/start':'provider-start',
 '/api/provider/probe':'provider-probe',
 '/api/provider/connect-key':'provider-connect-key',
 '/api/provider/disconnect':'provider-disconnect',
 '/api/repair/railway-supabase':'repair-railway-supabase',
 '/api/repair/railway-redeploy':'repair-railway-redeploy',
 '/api/repair/netlify-redeploy':'repair-netlify-redeploy',
 '/api/repair/stripe-webhook':'repair-stripe-webhook',
 '/api/repair/stripe-handler-secret':'repair-stripe-handler-secret'
};

test('every customer-critical backend action has a public Netlify route',()=>{
 for(const [route,fn] of Object.entries(required)){
  assert.match(toml,new RegExp(`from = "${route.replaceAll('/','\\/')}"[\\s\\S]{0,120}to = "\\/.netlify\\/functions\\/${fn}"`),`${route} must route to ${fn}`);
 }
});
