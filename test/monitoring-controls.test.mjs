import test from'node:test';
import assert from'node:assert/strict';
import fs from'node:fs';

const app=fs.readFileSync(new URL('../app.html',import.meta.url),'utf8');
const source=fs.readFileSync(new URL('../wr-monitoring-controls.js',import.meta.url),'utf8');

test('workspace UI loads explicit monitoring controls',()=>{
 assert.match(app,/id="monitoringControls"/);
 assert.match(app,/wr-monitoring-controls\.js/);
 assert.match(source,/\/api\/workspace\/monitoring/);
 assert.match(source,/Watch this app automatically/);
});

test('monitoring controls never expose broad automatic repair',()=>{
 assert.match(source,/autoRepairMode:'off'/);
 assert.doesNotMatch(source,/preapproved-only/);
 assert.match(source,/Automatic repair remains OFF/);
});

test('monitoring settings preserve explicit incident and recovery email choices',()=>{
 assert.match(source,/emailAlerts:document\.querySelector\('#monitorEmail'\)\.checked/);
 assert.match(source,/recoveryAlerts:document\.querySelector\('#monitorRecovery'\)\.checked/);
});
