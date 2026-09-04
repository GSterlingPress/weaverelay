import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = path => fs.readFileSync(path, 'utf8');

test('marketing site exposes real WeaveRelay login entry', () => {
  const script = read('script.js');
  assert.match(script, /headerEntry\.href = '\/app\.html'/);
  assert.match(script, /headerEntry\.textContent = 'Log in'/);
  assert.match(script, /Log in \/ Connect a Website/);
});

test('dashboard presents Connect Website as the primary first-use action', () => {
  const app = read('app.html');
  assert.match(app, /Sign in to connect and diagnose a website\./);
  assert.match(app, /\+ CONNECT WEBSITE/);
  assert.match(app, /Connect your first website\./);
  assert.match(app, /CONNECT A WEBSITE →/);
  assert.match(app, /<h2>Connect a website<\/h2>/);
  assert.match(app, /Production website URL/);
  assert.match(app, /CONNECT WEBSITE/);
});

test('human-friendly login, dashboard and connect routes land in the real app', () => {
  const toml = read('netlify.toml');
  for (const route of ['/login', '/dashboard', '/connect']) {
    assert.ok(toml.includes(`from = "${route}"`), `missing ${route} route`);
  }
  const matches = toml.match(/to = "\/app\.html"/g) || [];
  assert.ok(matches.length >= 5, 'expected application aliases to target app.html');
});
