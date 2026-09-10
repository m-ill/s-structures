import assert from 'node:assert/strict';
import { getHeapCodeStatistics } from 'node:v8';
import { spawnSync } from 'node:child_process';
import { createAnalysisProductService } from '../src/compute/product/analysisProductService.js';
import { createResourceBudget } from '../src/core/resourceBudget.js';
import { p9M1CantileverModel } from './helpers/p9M1Fixture.mjs';
import { installIndexEngineBridge } from '../src/ui/indexBridge.js';
if(!process.argv.includes('--measured')) {
 const child=spawnSync(process.execPath,['--expose-gc',import.meta.filename,'--measured'],{encoding:'utf8',timeout:180000,maxBuffer:2*1024*1024});
 process.stdout.write(child.stdout||'');process.stderr.write(child.stderr||'');assert.equal(child.status,0,child.error?.message);process.exit(0);
}
const model=p9M1CantileverModel();const analysisCase={id:'S',kind:'static',settings:{comboId:model.loadCombinations[0].id,pDeltaMethod:'off'}};
model.analysisCases=[analysisCase];
const budget=createResourceBudget();let finish,published=0;
const service=createAnalysisProductService({budget,getModel:()=>model,caseRunner:()=>new Promise(resolve=>{finish=resolve;}),onPublishResult:()=>{published++;}});
const job=service.start({analysisCase});await new Promise(resolve=>setTimeout(resolve,0));
service.cancel(job.id);finish({ok:true,status:'ok',summary:{}});await service.wait(job.id);assert.equal(published,0);
service.dispose();assert.equal(budget.snapshot().totalBytes,0);
assert.throws(()=>service.start({analysisCase}),{code:'PRODUCT_ANALYSIS_SERVICE_DISPOSED'});
const observations=[],codeObservations=[],warmupObservations=[];
for(let cycle=0;cycle<40;cycle++) {
 const m=structuredClone(model),target={model:()=>m,location:{search:''}},bridge=installIndexEngineBridge(target);
 const job=bridge.startAnalysisRun({caseId:'S'});await bridge.getProductAnalysisService().wait(job.id);
 assert.equal(bridge.getAnalysisLatestAttempt('S').ok,true);
 await bridge.disposeRuntime();assert.equal(bridge.getResourceState().totalBytes,0);
 // The current scope is discarded at the next turn before GC.
 await new Promise(resolve=>setTimeout(resolve,0));global.gc();
 if(cycle>=10){observations.push(process.memoryUsage().heapUsed);codeObservations.push(getHeapCodeStatistics());}else warmupObservations.push({heapUsed:process.memoryUsage().heapUsed,code:getHeapCodeStatistics()});
}
global.gc();
const first=observations.slice(0,5).reduce((a,b)=>a+b)/5,last=observations.slice(-5).reduce((a,b)=>a+b)/5;
const mean=observations.reduce((a,b)=>a+b)/observations.length,mid=(observations.length-1)/2;
const slope=observations.reduce((sum,y,i)=>sum+(i-mid)*(y-mean),0)/observations.reduce((sum,_,i)=>sum+(i-mid)**2,0);
console.log(JSON.stringify({observations,slopeBytesPerCycle:slope}));
assert.ok(last-first<=Math.max(first*.1,16*1024*1024));assert.ok(slope<=32*1024,`Retained heap trend ${slope} bytes/cycle`);
console.log(JSON.stringify({ok:true,scope:'Node S fixture create/run/dispose, forced GC, 10 fixed warmups + 30 measured cycles; not renderer or M-scale qualification',observations,codeObservations,warmupObservations,firstMeanBytes:first,lastMeanBytes:last,deltaBytes:last-first,slopeBytesPerCycle:slope,maxRssKiB:process.resourceUsage().maxRSS,ledgerZeroAfterEveryDispose:true,cancelledLatePublishCount:published}));
