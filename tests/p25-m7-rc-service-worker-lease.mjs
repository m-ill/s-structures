import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createRcServiceWorkflow} from '../src/compute/product/rcServiceWorkflow.js';
import {createResourceBudget} from '../src/core/resourceBudget.js';
const model={nodes:[],members:[],loadCombinations:[{id:'U'}]};
let ready;const posted=new Promise(resolve=>ready=resolve);
class Worker extends EventEmitter{
 postMessage(){ready();}
 terminate(){return Promise.reject(Error('native termination failed'));}
}
const worker=new Worker(),budget=createResourceBudget();
const workflow=createRcServiceWorkflow({bridge:{getCurrentModel:()=>model,getWorkflowInputIdentity:()=>({inputHash:'h'})},budget,workerFactory:()=>worker});
const input={inputHash:'h',stiffnessMode:'kds-elastic-second-order',comboIds:['U']};
const pending=workflow.run(input).catch(e=>e);
let readyTimer;
try{
 await Promise.race([posted,new Promise((_,reject)=>readyTimer=setTimeout(()=>reject(Error('worker factory was not used')),1000))]);
 clearTimeout(readyTimer);
 const before=budget.snapshot();assert.ok(before.totalBytes>0);
 assert.equal(workflow.cancel().cancelled,true);
 assert.equal((await pending).code,'CANDIDATE_WORKER_TERMINATION_FAILED');
 assert.equal(workflow.context().active,false);assert.equal(workflow.context().iterations.length,0);
 assert.equal(budget.snapshot().totalBytes,before.totalBytes,'retain the existing reservation without double accounting');
 assert.equal(Object.keys(budget.snapshot().quarantinedOwners).length,1);
 await assert.rejects(workflow.run(input),/WORKER_TERMINATION_UNCONFIRMED/);
 workflow.dispose();assert.equal(budget.snapshot().totalBytes,before.totalBytes);
 worker.emit('exit',1);assert.equal(budget.snapshot().totalBytes,0);
 assert.equal(worker.listenerCount('exit'),0);
 console.log('PASS RC service cancellation retains its reservation after failed termination, blocks restart and releases only on native exit');
}finally{clearTimeout(readyTimer);workflow.cancel();worker.emit('exit',1);await pending;workflow.dispose();}
// A Proxy can be inspected for sizing but cannot be structured-cloned. The
// admission error must happen before the clone or worker factory is reached.
let calls=0;const tiny=createResourceBudget({maxBytes:1});
const denied=createRcServiceWorkflow({bridge:{getCurrentModel:()=>new Proxy(model,{}),getWorkflowInputIdentity:()=>({inputHash:'h'})},budget:tiny,workerFactory:()=>{calls++;return worker;}});
await assert.rejects(denied.run(input),/MANAGED_MEMORY_BUDGET_EXCEEDED/);
assert.equal(calls,0);assert.equal(denied.context().active,false);assert.equal(tiny.snapshot().totalBytes,0);denied.dispose();
console.log('PASS RC service admission rejects before clone or Worker creation');
