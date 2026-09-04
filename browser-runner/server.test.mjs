import test from'node:test';import assert from'node:assert/strict';
const SAFE_ACTIONS=new Set(['navigate','assert-visible','click-link','click-control','wait-for-url']),SAFE_METHODS=new Set(['GET','HEAD']);
const safePath=v=>typeof v==='string'&&v.startsWith('/')&&!v.startsWith('//')&&!v.includes('\\');
const safe=s=>SAFE_ACTIONS.has(s.action)&&SAFE_METHODS.has(String(s.method||'GET').toUpperCase())&&(!['navigate','wait-for-url'].includes(s.action)||safePath(s.path))&&(s.action!=='click-control'||/data-weaverelay-safe-action/.test(s.selector||''));
test('runner accepts read-only navigation',()=>assert.equal(safe({action:'navigate',path:'/pricing'}),true));
test('runner rejects mutation methods',()=>assert.equal(safe({action:'navigate',path:'/',method:'POST'}),false));
test('runner rejects cross-origin style paths',()=>assert.equal(safe({action:'navigate',path:'//evil.example'}),false));
test('runner requires explicit safe marker for control clicks',()=>{assert.equal(safe({action:'click-control',selector:'#save'}),false);assert.equal(safe({action:'click-control',selector:'button[data-weaverelay-safe-action]'}),true)});
