import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('existing workspace cards open the full workspace detail flow',()=>{
  const control=read('wr-control.js');
  assert.match(control,/workspace-link/);
  assert.match(control,/openWorkspace\(b\.dataset\.id\)/);
  assert.match(control,/api\/workspace\?id=/);
  assert.match(control,/provider-action/);
  assert.match(control,/RUN LIVE DIAGNOSIS|#diagnose/);
});

test('workspace detail tolerates optional monitoring state',()=>{
  const source=read('netlify/functions/workspace-get.mjs');
  assert.match(source,/scopedStore\('weaverelay-monitoring'\)/);
  assert.match(source,/try\{state=await monitorStore\(\)\.get/);
  assert.match(source,/catch\{\}/);
});

test('provider connection routes cover the first real Studio One services',()=>{
  const start=read('netlify/functions/provider-start.mjs');
  const key=read('netlify/functions/provider-connect-key.mjs');
  const probe=read('netlify/functions/provider-probe.mjs');
  assert.match(start,/provider==='github'/);
  assert.match(start,/provider==='railway'/);
  for(const provider of ['netlify','supabase','stripe'])assert.match(key,new RegExp(`DIRECT_CREDENTIAL_PROVIDER_IDS|${provider}`));
  assert.match(probe,/ensureRailwayOAuth/);
  assert.match(probe,/probeRailwayProject/);
});

test('not-connected provider cards are never interpreted as connected',()=>{
  const expanded=read('wr-expanded-providers.js');
  const hardening=read('wr-next-step-hardening.js');
  assert.doesNotMatch(expanded,/connected=\/connected\/i/);
  assert.match(expanded,/wxConnectedText/);
  assert.match(hardening,/\['CONNECTED','AUTO-DETECTED'\]/);
});

test('diagnosis and monitoring remain reachable after provider connection',()=>{
  const toml=read('netlify.toml');
  const monitoring=read('netlify/functions/workspace-monitoring.mjs');
  assert.match(toml,/from = "\/api\/diagnose"[\s\S]*diagnose-workspace-truth/);
  assert.match(toml,/from = "\/api\/workspace\/monitoring"[\s\S]*workspace-monitoring/);
  assert.match(monitoring,/autoRepairMode/);
  assert.match(monitoring,/monitoring\.enabled&&!workspace\.siteOrigin/);
});

test('the dashboard loads the post-workspace hardening last',()=>{
  const app=read('app.html');
  const providerWindows=app.indexOf('/wr-provider-windows.js');
  const hardening=app.indexOf('/wr-next-step-hardening.js');
  assert.ok(providerWindows>=0);
  assert.ok(hardening>providerWindows);
});
