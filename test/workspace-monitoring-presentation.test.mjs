import test from'node:test';
import assert from'node:assert/strict';
import fs from'node:fs';

test('workspace API exposes both structured monitoring state and the UI compatibility incident',()=>{
 const source=fs.readFileSync(new URL('../netlify/functions/workspace-get.mjs',import.meta.url),'utf8');
 assert.match(source,/monitoringState/);
 assert.match(source,/monitoringIncident/);
 assert.match(source,/legacyMonitoringIncident\(monitoringState\)/);
 assert.match(source,/whatsHappening:incident\.whatIsHappening/);
 assert.match(source,/evidenceLabel:incident\.evidence\?\.label/);
 assert.match(source,/automaticRepairAttempted:false/);
});

test('legacy monitoring compatibility does not replace the canonical monitoringState response',()=>{
 const source=fs.readFileSync(new URL('../netlify/functions/workspace-get.mjs',import.meta.url),'utf8');
 assert.match(source,/json\(200,\{ok:true,workspace,connections,monitoringState,monitoringIncident,runtimeObserver\}\)/);
});
