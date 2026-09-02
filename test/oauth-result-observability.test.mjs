import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('OAuth callback result observer loads before workspace URL cleanup code',()=>{
  const html=fs.readFileSync('app.html','utf8');
  const observer=html.indexOf('/wr-oauth-result.js');
  const control=html.indexOf('/wr-control.js');
  assert.ok(observer>=0,'OAuth result observer must be loaded');
  assert.ok(control>observer,'OAuth result observer must load before wr-control.js');
});

test('OAuth result observer sanitizes and bounds callback text before display',()=>{
  const source=fs.readFileSync('wr-oauth-result.js','utf8');
  assert.match(source,/replace\(\/\[\\u0000-\\u001f\\u007f\]\//);
  assert.match(source,/slice\(0,240\)/);
  assert.match(source,/connection failed/);
});
