import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createResourceBudget} from '../src/core/resourceBudget.js';
import {workerBudgetObservers} from '../src/core/workerBudgetObservers.js';
import {runBoundedWorkerTask} from '../src/core/boundedWorkerTask.js';
const tick=()=>new Promise(r=>setImmediate(r));
for(const mode of ['terminate','factory-failed','terminate-failed']){
 const budget=createResourceBudget({maxBytes:1000}),owner=budget.nextOwner('late');budget.reserve(owner,500);
 let created,failed,terminated,rejectTermination,posted=0;
 const factory=new Promise((resolve,reject)=>{created=resolve;failed=reject;});
 class Worker extends EventEmitter{postMessage(){posted++;}terminate(){return new Promise((resolve,reject)=>{terminated=resolve;rejectTermination=reject;});}}
 const worker=new Worker();
 await assert.rejects(runBoundedWorkerTask({payload:{},timeoutMs:10,workerFactory:()=>factory,...workerBudgetObservers(budget,owner)}),{code:'TASK_TIMEOUT'});
 budget.release(owner);assert.equal(budget.snapshot().totalBytes,500,'factory still pending');
 assert.throws(()=>budget.reserve('next',1),/WORKER_TERMINATION_UNCONFIRMED/);
 if(mode==='factory-failed'){failed(new Error('factory failed'));await tick();}
 else{
  created(worker);await tick();assert.equal(posted,0);assert.equal(budget.snapshot().totalBytes,500);
  if(mode==='terminate'){terminated(0);await tick();}
  else{rejectTermination(new Error('failed'));await tick();assert.equal(budget.snapshot().totalBytes,500);worker.emit('exit',1);}
 }
 assert.equal(budget.snapshot().totalBytes,0);assert.equal(worker.listenerCount('exit'),0);
}
console.log('PASS late factory lease survives timeout through termination or failed creation');

const earlyBudget=createResourceBudget({maxBytes:1000}),earlyOwner=earlyBudget.nextOwner('early'),controller=new AbortController();earlyBudget.reserve(earlyOwner,500);let calls=0;
const pending=runBoundedWorkerTask({payload:{},timeoutMs:100,signal:controller.signal,workerFactory:()=>{calls++;throw new Error('must not start');},...workerBudgetObservers(earlyBudget,earlyOwner)}).catch(e=>e);
controller.abort();assert.equal((await pending).code,'CANCELLED');await tick();earlyBudget.release(earlyOwner);assert.equal(calls,0);assert.equal(earlyBudget.snapshot().totalBytes,0);
