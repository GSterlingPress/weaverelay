import test from'node:test';
import assert from'node:assert/strict';
import fs from'node:fs/promises';

test('preview tester sign-in is isolated to non-production deploy contexts and a one-way tester fingerprint',async()=>{
  const auth=await fs.readFile(new URL('../netlify/functions/auth-request.mjs',import.meta.url),'utf8');
  assert.match(auth,/deploy-preview/);
  assert.match(auth,/branch-deploy/);
  assert.match(auth,/PREVIEW_TESTER_EMAIL_SHA256/);
  assert.match(auth,/createHash\('sha256'\)/);
  assert.match(auth,/isPreviewTester\(email\)/);
  assert.doesNotMatch(auth,/davewinnc@gmail\.com/);
  assert.match(auth,/previewSignInUrl/);
  assert.match(auth,/\/signin\.html\?t=/);
  assert.doesNotMatch(auth,/previewSignInUrl:`https:\/\/weaverelay\.com/);
});

test('dashboard auto-opens preview tester sign-in without changing ordinary customer login',async()=>{
  const controls=await fs.readFile(new URL('../wr-dashboard-controls.js',import.meta.url),'utf8');
  assert.match(controls,/davewinnc@gmail\.com/);
  assert.match(controls,/previewSignInUrl/);
  assert.match(controls,/location\.assign\(data\.previewSignInUrl\)/);
  assert.match(controls,/if\(email!==['"]davewinnc@gmail\.com['"]\)return/);
});
