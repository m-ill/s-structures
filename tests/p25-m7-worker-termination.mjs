import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createRcSpliceExecution} from '../src/compute/product/rcSpliceExecution.js';
import {createResourceBudget} from '../src/core/resourceBudget.js';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
for(const operation of ['success','cancel','timeout']){
 let release,started,terminating=false;
 const ready=new Promise(resolve=>started=resolve),terminated=new Promise(resolve=>release=resolve);
 class Worker extends EventEmitter{postMessage(){started();}terminate(){terminating=true;return terminated;}}
 const worker=new Worker(),budget=createResourceBudget();
 const bridge={getCurrentModel:()=>({nodes:[],members:[]}),getWorkflowInputIdentity:()=>({inputHash:'h'})};
 const flow=createRcSpliceExecution({bridge,budget,workerFactory:async()=>worker,timeoutMs:operation==='timeout'?10:1000});
 let settled=false;const result=flow.run({inputHash:'h',spliceId:'S',endLoads:[0,0,0,0,0,0]}).then(v=>{settled=true;return v;},e=>{settled=true;return e;});
 await ready;
 if(operation==='success')worker.emit('message',{ok:true,result:{ok:true}});
 else if(operation==='cancel')flow.cancel();
 else await new Promise(resolve=>setTimeout(resolve,20));
 await tick();assert.equal(terminating,true);assert.equal(settled,false,'task must retain admission until native termination settles');assert.ok(budget.snapshot().totalBytes>0);
 await assert.rejects(flow.run({inputHash:'h',spliceId:'S',endLoads:[0,0,0,0,0,0]}),{code:'RC_SPLICE_BUSY'});
 release(0);const outcome=await result;
 if(operation==='success')assert.equal(outcome.ok,true);else assert.equal(outcome.code,operation==='cancel'?'CANCELLED':'TASK_TIMEOUT');
 assert.equal(budget.snapshot().totalBytes,0);assert.equal(worker.listenerCount('message'),0);flow.dispose();
}
console.log('PASS success, cancel and timeout retain memory admission until Worker termination');
