import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const roots=['wr-control.js','wr-runpod-control.js','script.js','netlify/functions'];
const files=[];
for(const root of roots){
  if(!fs.existsSync(root))continue;
  const stat=fs.statSync(root);
  if(stat.isFile())files.push(root);
  else{
    for(const name of fs.readdirSync(root)){
      const file=path.join(root,name);
      if(fs.statSync(file).isFile()&&/\.(mjs|js)$/.test(file))files.push(file);
    }
  }
}
let failed=false;
for(const file of files){
  const r=spawnSync(process.execPath,['--check',file],{stdio:'inherit'});
  if(r.status!==0)failed=true;
}
if(failed)process.exit(1);
console.log(`Build validation passed for ${files.length} JavaScript files.`);
