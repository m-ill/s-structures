import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const root=resolve('output/phase20/publication-810abc0/runtime-install');
const api=await import(pathToFileURL(resolve(root,'src/index.js')));
const fixture=JSON.parse(readFileSync('verification/evidence/phase20/m0/fixtures.json'))[1].model;
const result=api.analyzeModel(fixture);assert.equal(result.ok,true);
const child=spawn(process.execPath,['server/main.mjs','5197'],{cwd:root,windowsHide:true,env:{...process.env,S_STRUCTURES_DATA_DIR:resolve('output/phase20/publication-810abc0/install-data')},stdio:['ignore','pipe','pipe']});
let log='';child.stdout.on('data',b=>log+=b);child.stderr.on('data',b=>log+=b);
const responses=[];
try{
 for(let i=0;i<50;i++){try{const r=await fetch('http://127.0.0.1:5197/index.html');if(r.ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 for(const path of ['/index.html','/app.html','/src/ui/indexBridge.js','/src/metadata/numericVersions.js','/src/solver/elastic/stages.js','/src/ui/webmcp/register.js']){const r=await fetch('http://127.0.0.1:5197'+path);const body=await r.text();assert.equal(r.status,200,path);assert.ok(body.length>0);responses.push({path,status:r.status,characters:body.length});}
 const report={ok:true,source:JSON.parse(readFileSync(resolve(root,'SOURCE-IDENTITY.json'))),runtimeManifestFiles:JSON.parse(readFileSync(resolve(root,'PACKAGE-MANIFEST.json'))).files.length,numericalSmoke:result.ok,responses,log};writeFileSync('output/phase20/runtime-install-smoke.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{child.kill();}
