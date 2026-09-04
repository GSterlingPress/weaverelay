import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('workspace detail normalizes legacy provider and diagnosis shapes before rendering',()=>{
  const source=read('netlify/functions/workspace-get.mjs');
  assert.match(source,/normalizeProviderList/);
  assert.match(source,/normalizeWorkspaceForUi/);
  assert.match(source,/normalizeFinding/);
  assert.match(source,/Array\.isArray\(value\.actions\)/);
  assert.match(source,/workspace\.stackMap\.flow/);
});

test('workspace open failures are no longer silent',()=>{
  const guard=read('wr-workspace-open-guard.js');
  const app=read('app.html');
  assert.match(guard,/unhandledrejection/);
  assert.match(guard,/WeaveRelay could not open this website/);
  assert.ok(app.indexOf('/wr-workspace-open-guard.js')<app.indexOf('/wr-control.js'));
});

test('hard workspace navigation remains enabled',()=>{
  const app=read('app.html');
  const nav=read('wr-workspace-navigation.js');
  assert.match(app,/wr-workspace-navigation\.js/);
  assert.match(nav,/location\.assign\(workspaceHref/);
});

test('both connect website controls keep a resilient modal-opening path',()=>{
  const app=read('app.html');
  const controls=read('wr-dashboard-controls.js');
  assert.match(app,/wr-dashboard-controls\.js/);
  assert.match(controls,/newWorkspace/);
  assert.match(controls,/emptyCreate/);
});
