import assert from 'node:assert/strict';
import {runCandidateAutoApplication} from '../src/compute/product/candidateAutoApplication.js';
const job={jobId:'J',status:'scope-completed',best:{candidateId:'C'}};let finish,states=[];
const task=runCandidateAutoApplication({job,apply:args=>{assert.equal(args.requestId,'auto-J');return new Promise(r=>finish=r);},publish:()=>states.push(job.status),isCurrent:()=>true});
assert.equal(job.status,'applying');assert.deepEqual(states,['applying']);
finish({ok:true,followUp:{status:'completed',evaluationId:'E',comparison:{affectedScope:{complete:false}}}});await task;
assert.equal(job.status,'applied-needs-review');assert.equal(job.error,'POST_APPLY_SCOPE_INCOMPLETE');assert.equal(job.application.followUp.evaluationId,'E');assert.deepEqual(states,['applying','applied-needs-review']);
await runCandidateAutoApplication({job,apply:async()=>({ok:false,applied:true,code:'REANALYSIS_FAILED'}),publish:()=>{},isCurrent:()=>true});
assert.equal(job.status,'application-failed');assert.equal(job.application.applied,true);assert.equal(job.error,'REANALYSIS_FAILED');
await runCandidateAutoApplication({job,apply:async()=>{throw Error('BEFORE_APPLY_FAILED');},publish:()=>{},isCurrent:()=>true});assert.equal(job.status,'application-failed');assert.equal(job.application,null);
let current=true;const late=runCandidateAutoApplication({job,apply:()=>new Promise(r=>finish=r),publish:()=>{},isCurrent:()=>current});current=false;finish({ok:true,followUp:{status:'completed'}});await late;assert.equal(job.status,'applying');
console.log('PASS automatic application stays nonterminal until review, exposes partial failure and discards disposed completion');

for(const complete of [true,false,undefined]){
 const receipt={ok:true,followUp:{status:'completed',summary:{complete:false},comparison:{affectedScope:{complete}}}};
 await runCandidateAutoApplication({job,apply:async()=>receipt,publish:()=>{},isCurrent:()=>true});
 assert.equal(job.status,complete===true?'applied':'applied-needs-review');
 assert.equal(job.error,complete===true?null:'POST_APPLY_SCOPE_INCOMPLETE');
 assert.equal(job.application,receipt);
}
console.log('PASS automatic apply requires explicit post-apply affected-scope completion; incomplete project remains separate');
