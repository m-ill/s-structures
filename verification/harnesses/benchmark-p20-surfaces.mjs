import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const [baseline,candidate,outArg]=process.argv.slice(2),out=resolve(outArg);
assert.ok(baseline&&candidate&&outArg&&!existsSync(out),'Two roots and new output path required');
const roots=[baseline,candidate].map(p=>resolve(p));
const script=`import {readFileSync} from 'node:fs';
const started=performance.now();const {buildAgentManifest}=await import('./src/ui/agentManifest.js');const manifest=buildAgentManifest();const metadataMs=performance.now()-started;
const {createModel}=await import('./src/core/model.js');const {installIndexEngineBridge}=await import('./src/ui/indexBridge.js');
const m=createModel();m.nodes=[{id:'N1',x:0,y:0,z:0,support:'fixed'},{id:'N2',x:0,y:0,z:3}];m.members=[{id:'M1',type:'frame',n1:'N1',n2:'N2',matId:'steel',secId:'h300'}];m.loads=[{id:'P',type:'nodal',node:'N2',P:1,dir:'-z',case:'D'}];m.loadCases=[{id:'D',type:'dead'}];m.loadCombinations=[{id:'D1',type:'service',factors:{D:1}}];
const target={model:()=>m,location:{search:''}};const b=installIndexEngineBridge(target);b.analyzeModel(m);
const opts=i=>({generatedAt:'2026-09-08T00:00:00.000Z',p20Measurement:i});b.prepareResultView('getDetailedReport',opts(-1));
const prepare=[],read=[],repeatPrepare=[];let report;
for(let i=0;i<7;i++){let s=performance.now();report=b.prepareResultView('getDetailedReport',opts(i));prepare.push(performance.now()-s);s=performance.now();for(let j=0;j<20;j++)b.getDetailedReport(opts(i));read.push((performance.now()-s)/20);s=performance.now();b.prepareResultView('getDetailedReport',opts(i));repeatPrepare.push(performance.now()-s);}
const stats=b.getResultViewCacheStats?.()||null;console.log(JSON.stringify({metadataMs,prepare,read,repeatPrepare,stats,reportCharacters:JSON.stringify(report).length,rssKiB:process.resourceUsage().maxRSS,node:process.version,source:JSON.parse(readFileSync('SOURCE-IDENTITY.json'))}));`;
const samples=[[],[]];
for(let round=0;round<3;round++)for(const i of round%2?[1,0]:[0,1]){
 const p=spawnSync(process.execPath,['--input-type=module','-e',script],{cwd:roots[i],encoding:'utf8',maxBuffer:4*1024*1024,timeout:180000});assert.equal(p.status,0,p.stderr);samples[i].push(JSON.parse(p.stdout));
}
const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
const summary=samples.map(rows=>({metadataImportMedianMs:median(rows.map(r=>r.metadataMs)),prepareMedianMs:median(rows.flatMap(r=>r.prepare)),readMedianMs:median(rows.flatMap(r=>r.read)),repeatPrepareMedianMs:median(rows.flatMap(r=>r.repeatPrepare)),maxRssKiB:Math.max(...rows.map(r=>r.rssKiB)),stats:rows[0].stats}));
const report={scope:'Small report fixture only; timing characterization, no unregistered timing PASS threshold. Metadata includes manifest evaluation; not browser cold load.',warmups:1,rounds:3,preparedSamplesPerProcess:7,readsPerSample:20,roots,samples,summary};writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(summary));
