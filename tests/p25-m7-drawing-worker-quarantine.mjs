import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createDrawingExportService} from '../src/report/phase24/drawingExportService.js';
import {createResourceBudget} from '../src/core/resourceBudget.js';
let posted,rejectTermination;const ready=new Promise(r=>posted=r);
class Worker extends EventEmitter{postMessage(){posted();}terminate(){return new Promise((_,reject)=>rejectTermination=reject);}}
const worker=new Worker(),budget=createResourceBudget();
const service=createDrawingExportService({budget,bridge:{getWorkflowInputIdentity:()=>({inputHash:'h'})},workflow:{getEvaluation:()=>({stale:false}),snapshotBytes:()=>100,readSnapshot:()=>({inputHash:'h'})},workerFactory:()=>worker});
const result=service.exportDrawing({evaluationId:'E',format:'json'}).catch(e=>e);
await ready;service.dispose();assert.ok(budget.snapshot().totalBytes>0,'dispose must retain live Worker reservation');
rejectTermination(new Error('failed'));assert.equal((await result).code,'TASK_WORKER_TERMINATION_FAILED');
assert.ok(budget.snapshot().totalBytes>0);assert.equal(Object.keys(budget.snapshot().quarantinedOwners).length,1);
worker.emit('exit',1);assert.equal(budget.snapshot().totalBytes,0);
console.log('PASS drawing dispose and failed Worker termination retain admission until exit');
