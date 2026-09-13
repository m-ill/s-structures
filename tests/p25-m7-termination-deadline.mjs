import {createRcSpliceExecution} from '../src/compute/product/rcSpliceExecution.js';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {runBoundedWorkerTask} from '../src/core/boundedWorkerTask.js';
import {createResourceBudget} from '../src/core/resourceBudget.js';
import {workerBudgetObservers} from '../src/core/workerBudgetObservers.js';
const tick=()=>new Promise(r=>setImmediate(r));
for(const mode of ['message','cancel','timeout']){
 let posted,terminateDone;const ready=new Promise(r=>posted=r);
 class Worker extends EventEmitter{postMessage(){posted();}terminate(){return new Promise(r=>terminateDone=r);}}
 const worker=new Worker(),controller=new AbortController(),budget=createResourceBudget({maxBytes:1000}),owner=budget.nextOwner('hanging');budget.reserve(owner,500);
 const pending=runBoundedWorkerTask({payload:{},timeoutMs:mode==='timeout'?5:1000,terminationTimeoutMs:15,signal:controller.signal,workerFactory:()=>worker,...workerBudgetObservers(budget,owner)}).catch(e=>e);
 await ready;if(mode==='message')worker.emit('message',{ok:true,result:{}});if(mode==='cancel')controller.abort();
 const outcome=await Promise.race([pending,new Promise(r=>setTimeout(()=>r(null),80))]);
 if(!outcome){terminateDone(0);await pending;}
 assert.equal(outcome?.code,'TASK_WORKER_TERMINATION_TIMEOUT');
 budget.release(owner);assert.equal(budget.snapshot().totalBytes,500);
 if(mode==='cancel')worker.emit('exit',1);else terminateDone(0);
 await tick();assert.equal(budget.snapshot().totalBytes,0);assert.equal(worker.listenerCount('exit'),0);
}
await assert.rejects(runBoundedWorkerTask({payload:{},timeoutMs:1,terminationTimeoutMs:0,workerFactory:()=>null}),{code:'TASK_TERMINATION_TIMEOUT_INVALID'});
console.log('PASS bounded termination wait preserves quarantine until late confirmation');

class HangingWorker extends EventEmitter{postMessage(){queueMicrotask(()=>this.emit('message',{ok:true,result:{ok:true}}));}terminate(){return new Promise(()=>{});}}
const serviceWorker=new HangingWorker(),serviceBudget=createResourceBudget();
const service=createRcSpliceExecution({bridge:{getCurrentModel:()=>({nodes:[],members:[]}),getWorkflowInputIdentity:()=>({inputHash:'h'})},budget:serviceBudget,workerFactory:()=>serviceWorker});
await assert.rejects(service.run({inputHash:'h',spliceId:'S',endLoads:[0,0,0,0,0,0]}),{code:'TASK_WORKER_TERMINATION_TIMEOUT'});
assert.equal(service.context().active,false);assert.equal(service.context().workerTerminationUnconfirmed,true);
serviceWorker.emit('exit',0);assert.equal(serviceBudget.snapshot().totalBytes,0);service.dispose();
