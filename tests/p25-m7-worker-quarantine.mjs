import {createRcSpliceExecution} from '../src/compute/product/rcSpliceExecution.js';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createResourceBudget} from '../src/core/resourceBudget.js';
import {runBoundedWorkerTask} from '../src/core/boundedWorkerTask.js';
const budget=createResourceBudget({maxBytes:1000}),owner=budget.nextOwner('worker');budget.reserve(owner,800);
class BrokenWorker extends EventEmitter {postMessage(){queueMicrotask(()=>this.emit('message',{ok:true,result:{value:1}}));}terminate(){return Promise.reject(new Error('termination rejected'));}}
const worker=new BrokenWorker();
try{await runBoundedWorkerTask({payload:{},timeoutMs:100,workerFactory:()=>worker,onTerminationUnconfirmed:()=>budget.quarantine(owner,'termination-failed'),onTerminationConfirmed:()=>budget.confirmTermination(owner)});assert.fail('must reject');}catch(e){assert.equal(e.code,'TASK_WORKER_TERMINATION_FAILED');}finally{budget.release(owner);}
assert.equal(budget.snapshot().totalBytes,800);
assert.equal(budget.snapshot().quarantinedOwners[owner],'termination-failed');
assert.throws(()=>budget.reserve('next',1),/WORKER_TERMINATION_UNCONFIRMED/);
worker.emit('exit',1);
assert.equal(budget.snapshot().totalBytes,0);assert.equal(worker.listenerCount('exit'),0);
budget.reserve('next',100);assert.equal(budget.snapshot().totalBytes,100);
console.log('PASS failed termination quarantines reservation until actual exit');

const serviceBudget=createResourceBudget(),serviceWorker=new BrokenWorker();let factories=0;
const bridge={getCurrentModel:()=>({nodes:[],members:[]}),getWorkflowInputIdentity:()=>({inputHash:'h'})};
const service=createRcSpliceExecution({bridge,budget:serviceBudget,workerFactory:()=>{factories++;return serviceWorker;},timeoutMs:100});
const input={inputHash:'h',spliceId:'S',endLoads:[0,0,0,0,0,0]};
await assert.rejects(service.run(input),{code:'TASK_WORKER_TERMINATION_FAILED'});
assert.equal(service.context().workerTerminationUnconfirmed,true);assert.ok(serviceBudget.snapshot().totalBytes>0);
await assert.rejects(service.run(input),{code:'WORKER_TERMINATION_UNCONFIRMED'});assert.equal(factories,1);
serviceWorker.emit('exit',1);assert.equal(service.context().workerTerminationUnconfirmed,false);assert.equal(serviceBudget.snapshot().totalBytes,0);service.dispose();
