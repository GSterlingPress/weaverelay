import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPayload, evaluate, makeCanaries, preflight, ROOMS } from './canary-controller.mjs';

test('each room payload contains own canary and no peer canary', () => {
  const c = {A:'CANARY_A_alpha_unique',B:'CANARY_B_beta_unique',C:'CANARY_C_gamma_unique'};
  const {payloads} = preflight(c);
  for (const r of ROOMS) {
    const s=JSON.stringify(payloads[r]);
    assert.ok(s.includes(c[r]));
    for (const p of ROOMS.filter(x=>x!==r)) assert.equal(s.includes(c[p]),false);
  }
});

test('payload builder has no session chaining, tools, web, peer output or outcome channel', () => {
  const c=makeCanaries();
  const p=buildPayload('A',c);
  const s=JSON.stringify(p);
  for (const forbidden of ['previous_response_id','tools','web_search','peer_output','outcomes','scores']) assert.equal(s.includes(forbidden),false);
});

test('evaluator fails closed on peer canary leakage', () => {
  const c={A:'CANARY_A_alpha_unique',B:'CANARY_B_beta_unique',C:'CANARY_C_gamma_unique'};
  const clean=r=>JSON.stringify({room:r,tokens_seen:[c[r]],peer_content_seen:false,football_outcome_seen:false});
  const raw={A:clean('A'),B:clean('B'),C:clean('C')};
  assert.equal(evaluate(c,raw).verdict,'PASS');
  raw.B=JSON.stringify({room:'B',tokens_seen:[c.B,c.A],peer_content_seen:false,football_outcome_seen:false});
  assert.equal(evaluate(c,raw).verdict,'FAIL');
});

test('evaluator fails closed on malformed output or contamination flags', () => {
  const c={A:'CANARY_A_alpha_unique',B:'CANARY_B_beta_unique',C:'CANARY_C_gamma_unique'};
  const clean=r=>JSON.stringify({room:r,tokens_seen:[c[r]],peer_content_seen:false,football_outcome_seen:false});
  assert.equal(evaluate(c,{A:'not-json',B:clean('B'),C:clean('C')}).verdict,'FAIL');
  const bad=JSON.stringify({room:'A',tokens_seen:[c.A],peer_content_seen:false,football_outcome_seen:true});
  assert.equal(evaluate(c,{A:bad,B:clean('B'),C:clean('C')}).verdict,'FAIL');
});
