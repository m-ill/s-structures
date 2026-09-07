import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import os from 'node:os';
const args=process.argv.slice(2);
const out=resolve(args.find(a=>a.startsWith('--out='))?.slice(6)||'output/review-20260907/frame-benchmark.json');
if(existsSync(out))throw new Error('Use a new output filename to preserve prior measurements.');
const roots=args.filter(a=>!a.startsWith('--out=')).map(p=>resolve(p));
if(roots.length!==2)throw new Error('Provide baseline and candidate clean checkout directories.');
const script=`import {readFileSync} from 'node:fs';
import {runNonlinearAnalysisCaseAsync} from './src/nonlinear/analysisRouter.js';
const model=JSON.parse(readFileSync('verification/fixtures/phase19/eight-member-hinged-frame.json','utf8'));
const c=model.analysisCases.find(c=>c.id==='M5-FINAL-PUSH');const start=performance.now();
const r=await runNonlinearAnalysisCaseAsync(model,c,c.settings,{production:true});
console.log(JSON.stringify({ms:performance.now()-start,ok:r.ok,response:{capacityCurve:r.capacityCurve,memberResults:r.memberResults,hingeResults:r.hingeResults,storyResponse:r.storyResponse,audits:r.steps?.map(s=>s.audit)}}));
process.exitCode=r.ok?0:1;`;
const times=[[],[]];let reference;
for(let round=0;round<3;round++)for(const index of round%2?[1,0]:[0,1]){
  const run=spawnSync(process.execPath,['--input-type=module','-e',script],{cwd:roots[index],encoding:'utf8',timeout:180000,maxBuffer:32*1024*1024});
  assert.equal(run.status,0,run.stderr||run.error?.message);
  const result=JSON.parse(run.stdout);assert.equal(result.ok,true);
  if(!reference)reference=result.response;else assert.deepEqual(result.response,reference,'Full capacity/member/hinge/story/audit response must match exactly');
  times[index].push(result.ms);console.log(JSON.stringify({round,index,ms:result.ms,exactResponseParity:true}));
}
const median=a=>[...a].sort((a,b)=>a-b)[1];
const report={scope:'Eight-member 32-hinge production WASM Pushover, cold child processes, three alternating runs; not M-tier qualification',
  roots,node:process.version,cpu:os.cpus()[0]?.model,baselineMs:times[0],optimizedMs:times[1],
  baselineMedianMs:median(times[0]),optimizedMedianMs:median(times[1]),speedup:median(times[0])/median(times[1]),exactResponseParity:true};
mkdirSync(dirname(out),{recursive:true});
writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
