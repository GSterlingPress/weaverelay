import test from'node:test';
import assert from'node:assert/strict';
import{shouldNotifyFounder}from'../netlify/functions/auth-verify.mjs';

test('founder notification fires only for first verified signup',()=>{
  assert.equal(shouldNotifyFounder(true),true);
  assert.equal(shouldNotifyFounder(false),false);
  assert.equal(shouldNotifyFounder(undefined),false);
  assert.equal(shouldNotifyFounder(null),false);
});
