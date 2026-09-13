import {sampleWorkerMemory,summarizeWorkerMemory} from '../telemetry/workerMemory.js';
import {solveRcSpliceModel} from './rcSpliceModelSolve.js';
import {solveRcSpliceInterval} from './rcSpliceSolveService.js';
let endpoint;
if(typeof self!=='undefined'&&typeof document==='undefined')endpoint=self;
else if(typeof process!=='undefined'&&process.versions?.node){const {parentPort}=await import('node:worker_threads');endpoint=parentPort;}
function handle(event){
 const {model,input,kind}=endpoint.addEventListener?event.data:event;
 try{const before=sampleWorkerMemory();const result=kind==='model'?solveRcSpliceModel(model,input):solveRcSpliceInterval(model,input);const workerMemory=summarizeWorkerMemory(before,sampleWorkerMemory());endpoint.postMessage({ok:true,result:{...result,workerMemory}});}
 catch(error){endpoint.postMessage({ok:false,code:error.code||error.message||'RC_SPLICE_WORKER_FAILED'});}
}
if(endpoint?.addEventListener)endpoint.addEventListener('message',handle);else endpoint?.on('message',handle);
