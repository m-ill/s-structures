import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import os from 'node:os';
const args=process.argv.slice(2),roots=args.filter(a=>!a.startsWith('--out=')).map(p=>resolve(p));
const out=resolve(args.find(a=>a.startsWith('--out='))?.slice(6)||'output/phase20/frame-performance.json');
if(roots.length!==2||existsSync(out))throw Error('Provide two clean roots and a new --out path.');
const script=`import {readFileSync} from 'node:fs';
import {runNonlinearAnalysisCaseAsync} from './src/nonlinear/analysisRouter.js';
const model=JSON.parse(readFileSync('verification/fixtures/phase19/eight-member-hinged-frame.json','utf8'));
const c=model.analysisCases.find(c=>c.id==='M5-FINAL-PUSH');const start=performance.now();
const r=await runNonlinearAnalysisCaseAsync(model,c,c.settings,{production:true});
console.log(JSON.stringify({ms:performance.now()-start,rssKiB:process.resourceUsage().maxRSS,ok:r.ok,response:{capacityCurve:r.capacityCurve,memberResults:r.memberResults,hingeResults:r.hingeResults,storyResponse:r.storyResponse,audits:r.steps?.map(s=>s.audit)}}));process.exitCode=r.ok?0:1;`;
const times=[[],[]],rss=[[],[]];let reference;
for(let round=0;round<3;round++)for(const index of round%2?[1,0]:[0,1]){
  const run=spawnSync(process.execPath,['--input-type=module','-e',script],{cwd:roots[index],encoding:'utf8',timeout:180000,maxBuffer:32*1024*1024});
  assert.equal(run.status,0,run.stderr||run.error?.message);const r=JSON.parse(run.stdout);assert.equal(r.ok,true);
  for(const name of ['capacityCurve','memberResults','hingeResults','storyResponse','audits'])assert.ok(r.response[name],name);
  if(!reference)reference=r.response;else assert.deepEqual(r.response,reference,'Engineering response must match exactly');
  times[index].push(r.ms);rss[index].push(r.rssKiB);console.log(JSON.stringify({round,index,ms:r.ms,rssKiB:r.rssKiB,exactResponseParity:true}));
}
const median=a=>[...a].sort((a,b)=>a-b)[1];
const timeRatio=median(times[1])/median(times[0]),rssRatio=Math.max(...rss[1])/Math.max(...rss[0]);
const report={scope:'Phase20 small-frame regression budget; not M-tier qualification',roots,
  source:roots.map(p=>JSON.parse(readFileSync(resolve(p,'SOURCE-IDENTITY.json')))),node:process.version,cpu:os.cpus()[0]?.model,
  baselineMs:times[0],candidateMs:times[1],baselineRssKiB:rss[0],candidateRssKiB:rss[1],
  baselineMedianMs:median(times[0]),candidateMedianMs:median(times[1]),timeRatio,rssRatio,
  spread:times.map(a=>(Math.max(...a)-Math.min(...a))/median(a)),limits:{timeRatio:1.1,rssRatio:1.1},
  exactResponseParity:true,ok:timeRatio<=1.1&&rssRatio<=1.1};
mkdirSync(dirname(out),{recursive:true});writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));process.exitCode=report.ok?0:1;
