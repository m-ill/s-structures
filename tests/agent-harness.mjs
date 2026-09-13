import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {loadHarnessPackage,createHarnessFiles,connectionPrompt} from '../src/agentHarness/package.js';
import {installHarness} from '../src/agentHarness/install.mjs';
import {checkReadiness} from '../src/agentHarness/check.mjs';
import {textZip} from '../src/agentHarness/zip.js';
import {createHarnessTools} from '../src/ui/webmcp/harnessTools.js';
import {validate} from '../src/ui/webmcp/tools.js';

const bundle=await loadHarnessPackage({readSource:name=>readFile(new URL('../src/agentHarness/'+name,import.meta.url),'utf8')});
const staging=await mkdtemp(join(tmpdir(),'ss-harness-package-')),project=await mkdtemp(join(tmpdir(),'ss-harness-project-'));
await writeFile(join(staging,'harness-package.json'),JSON.stringify({version:bundle.version,files:bundle.files}));
await writeFile(join(staging,'install.mjs'),bundle.installer);
for(const args of [[],['--apply']]) {
 const run=spawnSync(process.execPath,[join(staging,'install.mjs'),'--target',project,...args],{encoding:'utf8'});
 assert.equal(run.status,0,run.stderr);assert.equal(JSON.parse(run.stdout).applied,args.length>0);
}
const initialCheck=spawnSync(process.execPath,[join(project,'.sstructures/harness/check.mjs'),project,'analysis'],{encoding:'utf8'});
assert.equal(initialCheck.status,2,initialCheck.stderr);assert.equal(JSON.parse(initialCheck.stdout).ready,false);
const root=await mkdtemp(join(tmpdir(),'ss-harness-'));
const existing='Existing user instructions.\n';await writeFile(join(root,'AGENTS.md'),existing);
const preview=await installHarness(bundle,root);
assert.equal(preview.applied,false);assert.equal(preview.entrypointReviewRequired,true);
await assert.rejects(readFile(join(root,'.sstructures/state.json')),{code:'ENOENT'});
const applied=await installHarness(bundle,root,{apply:true});assert.equal(applied.applied,true);
assert.equal(await readFile(join(root,'AGENTS.md'),'utf8'),existing);
assert.equal((await installHarness(bundle,root,{apply:true})).rows.filter(r=>r.action==='create').length,0);
await writeFile(join(root,'.sstructures/state.json'),'{}');
assert.equal((await installHarness(bundle,root,{apply:true})).blocked,true);
assert.equal(await readFile(join(root,'.sstructures/state.json'),'utf8'),'{}');
const malicious=structuredClone(bundle);delete malicious.files['CLAUDE.md'];malicious.files['../escape']='x';
await assert.rejects(installHarness(malicious,root,{apply:true}),/INVALID_PACKAGE/);
const linked=await mkdtemp(join(tmpdir(),'ss-harness-link-')),outside=await mkdtemp(join(tmpdir(),'ss-harness-out-'));
await symlink(outside,join(linked,'.sstructures'),process.platform==='win32'?'junction':'dir');
await assert.rejects(installHarness(bundle,linked,{apply:true}),/SYMLINK/);

const files=createHarnessFiles();
const data={state:JSON.parse(files['.sstructures/state.json']),...Object.fromEntries(['facts','sources','questions','decisions'].map(k=>[k,JSON.parse(files[`.sstructures/records/${k}.json`])]))};
assert.equal(checkReadiness(data).ready,false);
const hash='a'.repeat(64);data.state.inputHash=hash;data.state.requiredFactsReviewed=true;
data.sources=[{id:'S1',file:'inputs/confirmed.pdf',locator:'p.1'}];
data.facts=data.facts.map(f=>({...f,value:0,status:'confirmed',sourceRefs:['S1'],inputHash:hash}));
const decision={id:'D1',kind:'design-basis',status:'approved',inputHash:hash,actor:{type:'human',name:'fixture reviewer'},scope:'fixture only',evidenceRef:'fixture conversation',decidedAt:'2026-09-13T00:00:00Z'};
data.decisions=[decision];assert.equal(checkReadiness(data).ready,true);
data.decisions[0].actor.type='agent';assert.equal(checkReadiness(data).ready,false);data.decisions[0].actor.type='human';
data.state.inputHash='b'.repeat(64);assert.equal(checkReadiness(data).ready,false);data.state.inputHash=hash;
data.facts[0].status='extracted';assert.equal(checkReadiness(data).ready,false);
data.facts[0].status='approved-assumption';data.facts[0].decisionId='A1';data.state.mode='scenario';
assert.equal(checkReadiness(data).ready,false);data.decisions.push({...decision,id:'A1',kind:'assumption'});
assert.equal(checkReadiness(data).ready,true);assert.equal(checkReadiness(data,'publication').ready,false);
data.state.mode='confirmed';data.facts[0].status='confirmed';
data.questions=[{id:'Q1',blocks:['analysis'],status:'resolved'}];assert.equal(checkReadiness(data).ready,false);data.questions=[];
assert.equal(checkReadiness(data,'publication').ready,false);
data.state.numericalValidation={inputHash:hash,status:'passed',evidenceRef:'runs/1/numerical.json'};
data.state.engineeringReview={inputHash:hash,status:'complete',evidenceRef:'review/1'};
data.decisions.push({...decision,id:'P1',kind:'publication'});
const ready=checkReadiness(data,'publication');assert.equal(ready.ready,true);assert.equal(ready.designTransferAllowed,false);assert.equal(ready.humanIdentityVerified,false);
data.facts.push(data.facts[0]);assert.throws(()=>checkReadiness(data),/DUPLICATE/);
assert.throws(()=>createHarnessFiles('javascript:alert(1)'),/INVALID_SITE_URL/);
assert.ok(!connectionPrompt('https://example.com/app/?key=secret#token').includes('secret'));

const nativeFetch=globalThis.fetch;
globalThis.fetch=async url=>({ok:true,text:()=>readFile(url,'utf8')});
try {
 const tools=createHarnessTools({object:(properties={},required=[])=>({type:'object',properties,required,additionalProperties:false}),tool:(name,description,inputSchema,readOnly,run)=>({name,readOnly,execute:args=>{validate(inputSchema,args);return run(args);}})});
 const manifest=tools[0].execute({});assert.equal(manifest.installed,false);assert.ok(manifest.files.includes('AGENTS.md'));
 assert.ok((await tools[1].execute({path:'AGENTS.md'})).content.includes('사람'));
 assert.throws(()=>tools[1].execute({path:'../../secret'}),{code:'INVALID_INPUT'});
 assert.ok(tools.every(t=>t.readOnly));
} finally {globalThis.fetch=nativeFetch;}
const archive=join(root,'package.zip');await writeFile(archive,textZip({'한글.md':'사람의 결정\n','harness-package.json':JSON.stringify(bundle)}));
const unzip=spawnSync('python',['-c','import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; assert len(z.namelist())==2',archive],{encoding:'utf8'});
assert.equal(unzip.status,0,unzip.stderr);
console.log('PASS agent harness: preserve/dry-run/repeat/conflict/path/junction; missing/assumption/human/stale/publication; read-only tools; ZIP CRC');
