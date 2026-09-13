import assert from 'node:assert/strict';
import {createModel} from '../src/core/model.js';
import {createResourceBudget} from '../src/core/resourceBudget.js';
import {runCandidateGeometry} from '../src/compute/product/candidateAnalysisClient.js';
import {memberCandidateCommands} from '../src/design/rc/memberCandidateCommands.js';
import {memberCageProposal} from '../src/compute/product/memberCageProposal.js';
const model=createModel(),command={type:'reinforcement-record',id:'R',version:1,memberId:'M',bars:[{y:-.2,z:-.08,diameter:20},{y:-.2,z:.08,diameter:20},{y:.2,z:-.08,diameter:20},{y:.2,z:.08,diameter:20}],stirrupSpacing:150};
const settings={originalCommands:[command],options:{spacing:100}};
const budget=createResourceBudget({maxBytes:128*1024*1024});
const expected=memberCandidateCommands(model,[command],settings.options);
assert.deepEqual(await runCandidateGeometry({model,settings,budget,workerReservationBytes:32*1024*1024,timeoutMs:5000}),expected);
assert.equal(command.version,1);assert.equal(budget.snapshot().totalBytes,0);
const controller=new AbortController();controller.abort();
await assert.rejects(runCandidateGeometry({model,settings,budget,workerReservationBytes:32*1024*1024,timeoutMs:5000,signal:controller.signal}));assert.equal(budget.snapshot().totalBytes,0);
await assert.rejects(runCandidateGeometry({model,settings,budget,workerReservationBytes:32*1024*1024,timeoutMs:1}),e=>e.code==='CANDIDATE_TIMEOUT');assert.equal(budget.snapshot().totalBytes,0);
const row={id:'C',entityId:'M',detailId:'R',detailVersion:1,checkId:'rc-confinement',status:'NG',reason:'SPATIAL_HOOP_LONGITUDINAL_COLLISION',outerHoop:{actualPathAssembly:{status:'NG'}}};
const c={...command,confinementStandard:'KDS-142050-2022',tieClosure:'standard-135'};
assert.equal(memberCageProposal([c],[row],new Proxy({}, {get(){throw Error('planning must not execute geometry against the model');}})).ok,true);
console.log('PASS candidate geometry worker parity, cancellation, timeout and released budget; cage planning avoids numerical precomputation');

const {isCandidateWorkerFailure,recordCandidateWorkerFailure}=await import('../src/compute/product/candidateWorkerFailure.js');
await assert.rejects(runCandidateGeometry({model,settings,budget,workerReservationBytes:32*1024*1024,timeoutMs:5000,workerFactory:async()=>{throw Object.assign(Error('unavailable'),{code:'TASK_WORKER_UNAVAILABLE'});}}),error=>{
 assert.equal(error.code,'CANDIDATE_WORKER_UNAVAILABLE');assert.equal(isCandidateWorkerFailure(error),true);
 const job={candidates:[],best:null};recordCandidateWorkerFailure(job,error);assert.equal(job.status,'failed');assert.equal(job.workerTerminationUnconfirmedAtFailure,false);return true;
});assert.equal(budget.snapshot().totalBytes,0);
console.log('PASS actual bounded-worker client startup failure is classified as infrastructure failure with no leaked reservation');
