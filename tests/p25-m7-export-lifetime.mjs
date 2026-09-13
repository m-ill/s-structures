import assert from 'node:assert/strict';
import {createDrawingExportService,loadBundledDrawingFont} from '../src/report/phase24/drawingExportService.js';
import {createResourceBudget} from '../src/core/resourceBudget.js';
const budget=createResourceBudget(),snapshot={id:'test',inputHash:'a'.repeat(64)};
let finishFont;
const service=createDrawingExportService({bridge:{getWorkflowInputIdentity:()=>({inputHash:snapshot.inputHash})},workflow:{getEvaluation:()=>({stale:false}),snapshotBytes:()=>64,readSnapshot:()=>snapshot},budget,timeoutMs:20,loadFont:()=>new Promise(resolve=>{finishFont=resolve;})});
try{
 const code=await Promise.race([service.exportDrawing({evaluationId:'test'}).then(()=>null,e=>e.code),new Promise(r=>setTimeout(()=>r('FONT_WAIT_UNBOUNDED'),250))]);
 assert.equal(code,'EXPORT_TIMEOUT');assert.ok(budget.snapshot().totalBytes>0,'unsettled font task still owns its reservation');
 service.dispose();assert.ok(budget.snapshot().totalBytes>0,'dispose cannot pretend a pending font task has stopped');
 finishFont(new Uint8Array(3));await new Promise(resolve=>setImmediate(resolve));
 assert.equal(budget.snapshot().totalBytes,0);assert.equal(service.listArtifacts().rows.length,0);
}finally{service.dispose();}
const previousFetch=globalThis.fetch;let cancelled=false;
try{
 globalThis.fetch=async()=>({ok:true,headers:{get:()=>null},body:new ReadableStream({start(c){c.enqueue(new Uint8Array(5*1024*1024));c.enqueue(new Uint8Array(4*1024*1024));},cancel(){cancelled=true;}}),arrayBuffer:()=>{throw Error('UNBOUNDED_ARRAY_BUFFER');}});
 await assert.rejects(loadBundledDrawingFont(new AbortController().signal),{code:'DRAWING_FONT_SIZE_LIMIT'});assert.equal(cancelled,true);
}finally{globalThis.fetch=previousFetch;}
console.log('PASS font timeout releases only after loader settles; streamed font allocation bound');

// A stream may reuse its backing storage after delivering a chunk. Preserve
// each chunk on arrival, without accumulating per-chunk object references.
try{
 let i=0;const storage=new Uint8Array(3);
 globalThis.fetch=async()=>({ok:true,headers:{get:()=>null},body:{getReader:()=>({
  async read(){if(i===4)return {done:true};storage.fill(++i);return {done:false,value:storage};},
  async cancel(){},releaseLock(){}
 })}});
 const bytes=await loadBundledDrawingFont(new AbortController().signal);
 assert.deepEqual([...bytes],[1,1,1,2,2,2,3,3,3,4,4,4]);
 assert.equal(bytes.buffer.byteLength,bytes.length,'do not retain spare capacity');
}finally{globalThis.fetch=previousFetch;}
let reads=0;
const deniedBudget=createResourceBudget({maxBytes:1024});
const denied=createDrawingExportService({bridge:{},budget:deniedBudget,workflow:{getEvaluation:()=>({stale:false}),snapshotBytes:()=>1000,readSnapshot(){reads++;throw Error('UNADMITTED_COPY');}}});
await assert.rejects(denied.exportDrawing({evaluationId:'test'}),{code:'MANAGED_MEMORY_BUDGET_EXCEEDED'});
assert.equal(reads,0);assert.equal(deniedBudget.snapshot().totalBytes,0);denied.dispose();
console.log('PASS font stream chunk ownership, exact returned buffer and snapshot admission before copy');

// Repeated cancelled loaders must still consume admission until each settles.
// A late rejection is observed, cannot publish an artifact, and frees only its
// own lease. This measures managed reservations, not the JavaScript heap.
const pendingBudget=createResourceBudget({maxBytes:150*1024*1024}),loaders=[];let workerStarts=0;
const pendingService=createDrawingExportService({budget:pendingBudget,bridge:{getWorkflowInputIdentity:()=>({inputHash:snapshot.inputHash})},workflow:{getEvaluation:()=>({stale:false}),snapshotBytes:()=>64,readSnapshot:()=>snapshot},loadFont:()=>new Promise((resolve,reject)=>loaders.push({resolve,reject})),workerFactory:()=>{workerStarts++;throw Error('UNEXPECTED_WORKER');}});
try{
 const retained=[];
 for(let i=0;i<2;i++){
  const task=pendingService.exportDrawing({evaluationId:'test'});
  await Promise.resolve();assert.equal(loaders.length,i+1);
  pendingService.cancel();await assert.rejects(task,{code:'EXPORT_CANCELLED'});
  retained.push(pendingBudget.snapshot().totalBytes);
 }
 assert.equal(retained[1],2*retained[0]);
 await assert.rejects(pendingService.exportDrawing({evaluationId:'test'}),{code:'MANAGED_MEMORY_BUDGET_EXCEEDED'});
 assert.equal(loaders.length,2);assert.equal(workerStarts,0);
 pendingService.dispose();assert.equal(pendingBudget.snapshot().totalBytes,retained[1]);
 loaders[0].resolve(new Uint8Array(8));await new Promise(resolve=>setImmediate(resolve));
 assert.equal(pendingBudget.snapshot().totalBytes,retained[0]);
 loaders[1].reject(Error('LATE_FONT_FAILURE'));await new Promise(resolve=>setImmediate(resolve));
 assert.equal(pendingBudget.snapshot().totalBytes,0);assert.equal(pendingService.listArtifacts().rows.length,0);
 console.log(JSON.stringify({fontPendingReservations:retained,accounting:'managed-estimate-not-heap',lateResultsPublished:0}));
}finally{pendingService.dispose();}
const failedFont=createDrawingExportService({budget:pendingBudget,bridge:{},workflow:{getEvaluation:()=>({stale:false}),snapshotBytes:()=>64,readSnapshot:()=>snapshot},loadFont:()=>{throw Error('SYNCHRONOUS_FONT_FAILURE');}});
try{await assert.rejects(failedFont.exportDrawing({evaluationId:'test'}),/SYNCHRONOUS_FONT_FAILURE/);assert.equal(pendingBudget.snapshot().totalBytes,0);}finally{failedFont.dispose();}

import {Worker} from 'node:worker_threads';
// Exercise service ownership with a real worker; numerical/rendering coverage
// lives in the separate actual product export test.
for(const mode of ['cancel','stale','release']){
 const resources=createResourceBudget();let current='h',ready;
 const started=new Promise(resolve=>{ready=resolve;});
 const workerFactory=()=>{const worker=new Worker(`const {parentPort}=require('node:worker_threads');parentPort.on('message',()=>setTimeout(()=>parentPort.postMessage({ok:true,result:{bytes:new Uint8Array([1,2,3]),mime:'text/csv;charset=utf-8',pages:0,totalPages:0,retainedPages:0}}),${mode==='cancel'?1000:20}));`,{eval:true});worker.once('online',()=>{if(mode==='stale')current='changed';ready();});return worker;};
 let statusReads=0,sourceStale=false;
 const output=createDrawingExportService({budget:resources,bridge:{getWorkflowInputIdentity:()=>({inputHash:current})},workflow:{getEvaluation:()=>{throw Error('UNNECESSARY_CHECK_PAGE_COPY');},getEvaluationStatus:()=>{statusReads++;return {stale:sourceStale};},snapshotBytes:()=>100,readSnapshot:()=>({id:'E',inputHash:'h'})},workerFactory,timeoutMs:2000});
 try{
  const task=output.exportDrawing({evaluationId:'E',format:'csv'}).then(value=>({value}),error=>({error}));
  const first=await Promise.race([started.then(()=>null),task]);assert.equal(first,null,'export must reach Worker without copying a check page');if(mode==='cancel')output.cancel();
  const outcome=await task;
  if(mode==='release'){
   assert.equal(outcome.error,undefined);assert.ok(resources.snapshot().totalBytes>0);
   assert.equal(output.getArtifact({artifactId:outcome.value.artifactId}).stale,false);
   sourceStale=true;assert.equal(output.getArtifact({artifactId:outcome.value.artifactId}).stale,true);
   assert.equal(output.listArtifacts().rows[0].stale,true);assert.ok(statusReads>=4);
   assert.equal(output.releaseArtifact({artifactId:outcome.value.artifactId}).released,true);
   assert.equal(output.releaseArtifact({artifactId:outcome.value.artifactId}).released,false);
   assert.throws(()=>output.getArtifact({artifactId:outcome.value.artifactId}),{code:'ARTIFACT_REQUIRED'});
  }else assert.equal(outcome.error.code,mode==='cancel'?'EXPORT_CANCELLED':'STALE_INPUT');
  assert.equal(resources.snapshot().totalBytes,0,mode);
  assert.deepEqual(resources.snapshot().quarantinedOwners,{});
 }finally{output.dispose();}
}
console.log('PASS real-worker CSV cancellation, stale source rejection and idempotent artifact release reclaim managed bytes');
