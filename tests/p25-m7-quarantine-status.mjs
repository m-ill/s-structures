import {designContext} from './fixtures/p24/context.js';
import {createFakeIndexDocument} from './helpers/fakeIndexDom.mjs';
import {installPracticalDesignControls} from '../src/ui/indexPracticalDesign.js';
import assert from 'node:assert/strict';
import {BudgetMap,createResourceBudget,retainedBytes} from '../src/core/resourceBudget.js';
import {recordCandidateWorkerFailure,isCandidateWorkerFailure} from '../src/compute/product/candidateWorkerFailure.js';
import {createBrowserMemoryDiagnostics} from '../src/compute/telemetry/browserMemory.js';
const budget=createResourceBudget({maxBytes:100000}),jobs=new BudgetMap(budget,'jobs',{measure:entry=>Math.max(16384,retainedBytes(entry))});
const job={jobId:'J',planId:'P',status:'running',candidates:[],best:null};jobs.set('J',job);
job.candidates.push({value:'x'.repeat(10000)});jobs.set('J',job);
budget.reserve('worker',1000);budget.quarantine('worker','not-confirmed');
recordCandidateWorkerFailure(job,{code:'CANDIDATE_WORKER_TERMINATION_TIMEOUT'});jobs.set('J',job);
assert.equal(jobs.get('J').status,'failed');assert.equal(jobs.get('J').discardedCandidateCount,1);
assert.equal(jobs.get('J').best,null);assert.ok(budget.snapshot().totalBytes>=1000);
const read=createBrowserMemoryDiagnostics({},()=>budget.snapshot());
const status=await read();assert.equal(status.workerLifecycle.status,'termination-unconfirmed');assert.equal(status.workerLifecycle.reservedBytes,1000);
assert.equal(status.workerLifecycle.newAllocationsBlocked,true);
budget.confirmTermination('worker');assert.equal((await read()).workerLifecycle.status,'clear');
console.log('PASS quarantined Worker permits bounded terminal status and explicit runtime diagnostics');

const ctx=designContext();try{
 await ctx.call('get_runtime_resources',{});const b=ctx.bridge.getResourceBudget();b.reserve('test-exit',100);b.quarantine('test-exit','test-pending');
 const state=await ctx.call('get_runtime_resources',{});assert.equal(state.workerLifecycle.ownerCount,1);assert.equal(state.workerLifecycle.newAllocationsBlocked,true);
 b.confirmTermination('test-exit');assert.equal((await ctx.call('get_runtime_resources',{})).workerLifecycle.status,'clear');
}finally{await ctx.dispose();}
const document=createFakeIndexDocument(),panel=document.createElement('div');document.body.appendChild(panel);
const viewBudget=createResourceBudget();viewBudget.reserve('test',1024);viewBudget.quarantine('test','pending');
installPracticalDesignControls({target:{document},bridge:{evaluatePracticalDesign:async()=>({}),getRuntimeResources:createBrowserMemoryDiagnostics({},()=>viewBudget.snapshot())},panel,getSources:()=>[],refreshSources:()=>{}});
const button=panel.querySelectorAll('button').find(b=>b.textContent==='실행 자원 상태');assert.ok(button);button.click();await new Promise(r=>setTimeout(r,0));
assert.ok(panel.querySelectorAll('p').some(p=>p.textContent.includes('Worker 1개 종료 미확인')));
viewBudget.confirmTermination('test');button.click();await new Promise(r=>setTimeout(r,0));assert.ok(panel.querySelectorAll('p').some(p=>p.textContent.includes('종료 미확인 Worker 없음')));

for(const code of ['CANDIDATE_WORKER_UNAVAILABLE','CANDIDATE_WORKER_FAILED','CANDIDATE_WORKER_EXITED']){
 assert.equal(isCandidateWorkerFailure({code}),true);
 const failed={status:'running',candidates:[{candidateId:'C'}],best:{candidateId:'C'}};recordCandidateWorkerFailure(failed,{code});
 assert.equal(failed.status,'failed');assert.equal(failed.error,code);assert.equal(failed.best,null);assert.equal(failed.discardedCandidateCount,1);assert.equal(failed.workerTerminationUnconfirmedAtFailure,false);
}
for(const code of ['CAGE_REPAIR_GEOMETRY_UNAVAILABLE','PERIMETER_LAYOUT_GEOMETRY_INVALID','CANDIDATE_TIMEOUT','CANCELLED'])assert.equal(isCandidateWorkerFailure({code}),false);
console.log('PASS worker infrastructure failures are not no-feasible-design and do not imply unconfirmed termination');
