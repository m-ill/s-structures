import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createSharedComputation} from '../src/core/sharedComputation.js';
import {createResourceBudget} from '../src/core/resourceBudget.js';
import {runCandidateEvaluation} from '../src/compute/product/candidateAnalysisClient.js';
const tick=()=>new Promise(r=>setImmediate(r));
let posted,failTermination;const ready=new Promise(r=>posted=r);
class Worker extends EventEmitter{postMessage(){posted();}terminate(){return new Promise((_,reject)=>failTermination=reject);}}
const worker=new Worker(),budget=createResourceBudget({maxBytes:10000}),shared=createSharedComputation(),a=new AbortController(),b=new AbortController();
budget.reserve('caller',1000);
const produce=signal=>runCandidateEvaluation({model:{},sets:[],signal,timeoutMs:1000,workerFactory:()=>worker,budget,workerReservationBytes:1000});
const one=shared.run('key',produce,a.signal).catch(e=>e),two=shared.run('key',produce,b.signal).catch(e=>e);
await ready;a.abort();await one;budget.release('caller');assert.equal(budget.snapshot().totalBytes,1000);
b.abort();await two;assert.equal(budget.snapshot().totalBytes,1000,'all subscribers leaving must not release the live Worker');
failTermination(new Error('not terminated'));await tick();
assert.equal(Object.keys(budget.snapshot().quarantinedOwners).length,1);
assert.throws(()=>budget.reserve('next',1),/WORKER_TERMINATION_UNCONFIRMED/);
worker.emit('exit',1);assert.equal(budget.snapshot().totalBytes,0);
console.log('PASS shared caller cancellation retains independent Worker lease through failed termination');
