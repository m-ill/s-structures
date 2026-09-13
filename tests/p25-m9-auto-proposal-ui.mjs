import assert from 'node:assert/strict';
import {createFakeIndexDocument} from './helpers/fakeIndexDom.mjs';
import {installPracticalDesignControls} from '../src/ui/indexPracticalDesign.js';
const document=createFakeIndexDocument(),panel=document.createElement('div');document.body.appendChild(panel);
const calls=[];let starts=0,available=true,resolveResume;
const result={ok:true,evaluationId:'E',summary:{checkCount:0},checks:[],offset:0,nextOffset:null};
const bridge={resumeDesignCandidates:()=>new Promise(resolve=>{resolveResume=resolve;}),getWorkflowInputIdentity:()=>({inputHash:'h'}),evaluatePracticalDesign:async()=>result,
 planDesignCandidates:input=>{calls.push(input);return {ok:true,planId:'P',generation:{ok:available,basisCheckIds:['S'],reason:'NO_SHEAR_SPACING_CHANGE_REQUIRED'}};},
 startDesignCandidates:()=>{starts++;return {jobId:'J'};},getDesignCandidateJob:()=>({status:'NEEDS_INPUT',candidateCount:1,candidates:[],best:null,nextOffset:null})};
installPracticalDesignControls({target:{document},bridge,panel,getSources:()=>[{analysisRunId:'A',comboId:'U'}],refreshSources:()=>{}});
const button=label=>panel.querySelectorAll('button').find(b=>b.textContent===label),tick=()=>new Promise(r=>setTimeout(r,0));
assert.ok(button('계산 요구량으로 자동 후보'));
button('계산 요구량으로 자동 후보').click();await tick();assert.equal(calls.length,0,'evaluation required');
button('제공 상세 검토').click();await tick();
panel.querySelector('[aria-label="후보 대상 ID"]').value='M';panel.querySelector('[aria-label="후보 대상 종류"]').value='member';
button('계산 요구량으로 자동 후보').click();await tick();assert.equal(starts,1);assert.equal(calls[0].memberId,'M');assert.equal(calls[0].spacings,undefined);assert.equal(calls[0].autoApply,false);
panel.querySelector('[aria-label="후보 대상 종류"]').value='foundation';panel.querySelector('[aria-label="후보 대상 ID"]').value='F';
button('계산 요구량으로 자동 후보').click();await tick();assert.equal(calls[1].foundationId,'F');assert.equal(calls[1].detailCandidates,undefined);
available=false;button('계산 요구량으로 자동 후보').click();await tick();assert.equal(starts,2,'do not launch unchanged fallback plan');
panel.querySelector('[aria-label="후보 대상 종류"]').value='connection';button('계산 요구량으로 자동 후보').click();await tick();assert.equal(calls.length,4);assert.equal(calls[3].connectionId,'F');assert.equal(calls[3].detailCandidates,undefined);
console.log('PASS UI automatic member/foundation proposal without accidental manual constraints');

// A delayed start must not publish a job for an obsolete review or target.
let resolveStart, polls=0;const cancelled=[];
bridge.startDesignCandidates=()=>new Promise(resolve=>{resolveStart=resolve;});
bridge.cancelDesignCandidates=({jobId})=>{cancelled.push(jobId);return {ok:true};};
bridge.getDesignCandidateJob=()=>{polls++;return {status:'completed',candidateCount:0,candidates:[],nextOffset:null};};
available=true;
panel.querySelector('[aria-label="후보 대상 종류"]').value='member';
panel.querySelector('[aria-label="후보 대상 ID"]').value='M';
button('계산 요구량으로 자동 후보').click();await tick();
button('제공 상세 검토').click();await tick();
resolveStart({jobId:'OLD-REVIEW'});await tick();
assert.deepEqual(cancelled,['OLD-REVIEW']);assert.equal(polls,0);
button('계산 요구량으로 자동 후보').click();await tick();
panel.querySelector('[aria-label="후보 대상 ID"]').value='M2';
resolveStart({jobId:'OLD-TARGET'});await tick();
assert.deepEqual(cancelled,['OLD-REVIEW','OLD-TARGET']);assert.equal(polls,0);
let hash='h';bridge.getWorkflowInputIdentity=()=>({inputHash:hash});
button('계산 요구량으로 자동 후보').click();await tick();
hash='changed';resolveStart({jobId:'OLD-INPUT'});await tick();
assert.deepEqual(cancelled,['OLD-REVIEW','OLD-TARGET','OLD-INPUT']);assert.equal(polls,0);
console.log('PASS obsolete asynchronous candidate starts are cancelled before publication');

bridge.startDesignCandidates=()=>({jobId:'RESUME-BASE'});
button('계산 요구량으로 자동 후보').click();await tick();const beforeResumePolls=polls;
button('남은 후보 이어서 검토').click();await tick();panel.querySelector('[aria-label="후보 대상 ID"]').value='M3';resolveResume({jobId:'OLD-RESUME-TARGET'});await tick();
assert.equal(cancelled.at(-1),'OLD-RESUME-TARGET');assert.equal(polls,beforeResumePolls);
button('계산 요구량으로 자동 후보').click();await tick();const inputPolls=polls;button('남은 후보 이어서 검토').click();await tick();hash='changed-again';resolveResume({jobId:'OLD-RESUME-INPUT'});await tick();assert.equal(cancelled.at(-1),'OLD-RESUME-INPUT');assert.equal(polls,inputPolls);
console.log('PASS delayed continuation cannot overwrite a changed target or model');

button('계산 요구량으로 자동 후보').click();await tick();panel.querySelector('[aria-label="후보 대상 ID"]').dispatchEvent({type:'input'});const oldResolve=resolveResume;button('남은 후보 이어서 검토').click();await tick();assert.equal(resolveResume,oldResolve,'target edits clear the prior job selection');assert.ok(panel.querySelectorAll('p').some(p=>p.textContent.includes('먼저 후보 탐색')));

let exhaustedStarts=0;
bridge.startDesignCandidates=()=>{exhaustedStarts++;return {jobId:'UNEXPECTED'};};
bridge.planDesignCandidates=()=>{throw Object.assign(new Error('FOOTPRINT_CLEARANCE_SEARCH_EXHAUSTED'),{proposalFailure:{code:'FOOTPRINT_CLEARANCE_SEARCH_EXHAUSTED',generation:{proposalFailures:[{component:'footprint',reason:'FOOTPRINT_CLEARANCE_SEARCH_EXHAUSTED'}]}}});};
button('계산 요구량으로 자동 후보').click();await tick();
assert.equal(exhaustedStarts,0);
assert.ok(panel.querySelectorAll('p').some(p=>p.textContent.includes('footprint: FOOTPRINT_CLEARANCE_SEARCH_EXHAUSTED')));
console.log('PASS UI displays component failure and does not start an exhausted plan');
