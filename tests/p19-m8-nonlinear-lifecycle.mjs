import assert from 'node:assert/strict';
import {createNonlinearProductService} from '../src/nonlinear/product/jobManager.js';
import {createM10Model,createM10PushoverCase,syntheticPushoverResult} from './helpers/p8M10Fixture.mjs';
import {attachAnalysisWorker} from '../src/nonlinear/runtime/analysisWorker.js';
import {createRunRequest} from '../src/nonlinear/runtime/protocol.js';
let receive,release;const events=[];
const initializing=attachAnalysisWorker({endpoint:{onMessage(fn){receive=fn;},postMessage(message){events.push(message);}},
  createWasmSparseBackend:()=>new Promise(r=>{release=r;}),taskHandler:async()=>({ok:true,probe:'early-run'})});
receive(createRunRequest({requestId:'early',runToken:'early',task:{type:'ECHO',payload:{}}}));
release(null);await initializing;await new Promise(r=>setTimeout(r,0));
assert.ok(events.some(e=>e.requestId==='early'),'RUN delivered during WASM startup must receive a response');
const model=createM10Model(),analysisCase=createM10PushoverCase(model);
let terminated=0;
function stalledWorker(){return {postMessage(){},addEventListener(){},removeEventListener(){},terminate(){terminated++;}};}
const service=createNonlinearProductService({getModel:()=>model,executionMode:'worker',workerFactory:stalledWorker,cancelGraceMs:20,maxRunMs:1000});
const j=service.start({analysisCase});await new Promise(r=>setTimeout(r,0));
assert.equal(service.getStatus(j.id).status,'running');service.cancel(j.id);
const done=await service.wait(j.id);assert.equal(done.status,'cancelled');assert.equal(done.runtime.forcedTermination,true);assert.equal(terminated,1);
const retried=service.retry(j.id,{jobId:j.id});assert.notEqual(retried.id,j.id);service.cancel(retried.id);await service.wait(retried.id);
const timeout=createNonlinearProductService({getModel:()=>model,executionMode:'worker',workerFactory:stalledWorker,maxRunMs:20});
const t=timeout.start({analysisCase});const failed=await timeout.wait(t.id);assert.equal(failed.status,'failed');assert.equal(failed.error.code,'NONLINEAR_TIME_BUDGET_EXCEEDED');assert.equal(terminated,2);
const forged=createNonlinearProductService({getModel:()=>model,runner:async()=>({...syntheticPushoverResult(),qualification:'verified',designBlocked:false})});
const f=forged.start({analysisCase});await forged.wait(f.id);const result=forged.getResult(f.id);
assert.equal(result.qualification,'candidate');assert.equal(result.designBlocked,true);assert.equal(result.designTransferAllowed,false);
for(const s of [service,timeout,forged])s.dispose();
console.log(JSON.stringify({ok:true,forcedTermination:terminated,qualificationEscalationBlocked:true,scope:'stalled Worker transport injection, not a performance qualification'}));
