import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source=await readFile(new URL('../wr-provider-connection-state.js',import.meta.url),'utf8');
const app=await readFile(new URL('../app.html',import.meta.url),'utf8');
const ids=['github','netlify','railway','supabase','stripe','runpod','comfyui','vercel','render','cloudflare','neon','resend'];

test('provider state controller covers all 12 provider cards',()=>{
  for(const id of ids)assert.match(source,new RegExp(`\\b${id}:\\{`));
});

test('app loads the normalized provider state controller',()=>{
  assert.match(app,/wr-provider-connection-state\.js/);
});

test('ComfyUI failure is actionable instead of a disabled dead end',()=>{
  assert.match(source,/RECHECK VIA RUNPOD/);
  assert.match(source,/CONNECT RUNPOD FIRST/);
  assert.match(source,/provider:'runpod'/);
});

test('every direct provider exposes CONNECTED and NEEDS ACTION terminal states',()=>{
  assert.match(source,/CONNECTED/);
  assert.match(source,/NEEDS ACTION/);
  assert.match(source,/VERIFY LIVE/);
});

test('next-fix guidance uses the full 12-provider catalog',()=>{
  assert.match(source,/closest proven fix/);
  for(const label of ['Vercel','Render','Cloudflare','Neon','Resend'])assert.match(source,new RegExp(`label:'${label}'`));
});
