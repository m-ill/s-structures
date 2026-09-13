import assert from 'node:assert/strict';
import {createFakeIndexDocument} from './helpers/fakeIndexDom.mjs';
import {installPracticalDesignControls} from '../src/ui/indexPracticalDesign.js';
const document=createFakeIndexDocument(),panel=document.createElement('div');document.body.appendChild(panel);
let selected=[{rcSpliceId:'splice',comboId:'S'}],calls=[],reuse=[],pending,stale=false;
const result={ok:true,evaluationId:'ev',summary:{checkCount:0},checks:[],offset:0,nextOffset:null};
const bridge={getWorkflowInputIdentity:()=>({inputHash:'current'}),
 evaluatePracticalDesign:async input=>{calls.push(input);if(pending)return new Promise(resolve=>pending=resolve);return stale?{ok:false,code:'RC_SPLICE_SOURCE_NOT_CURRENT'}:result;},
 reuseDesignAnalysis:input=>{reuse.push(input);if(!input.analysisRunId)throw Error('WRONG_SOURCE_KIND');return {ok:true,analysisRunId:'reused'};},
 cancelPracticalDesignEvaluation:()=>{},getPracticalDesignEvaluation:()=>result};
installPracticalDesignControls({target:{document},bridge,panel,getSources:()=>selected,refreshSources:()=>{}});
const button=label=>panel.querySelectorAll('button').find(b=>b.textContent===label),tick=()=>new Promise(r=>setTimeout(r,0));
await button('제공 상세 검토').click();await tick();
button('해석 재사용 후 재검토').click();await tick();
assert.equal(calls.length,2);assert.equal(reuse.length,0);assert.deepEqual(calls[1].sources,selected);
selected=[{rcIterationId:'iteration',comboId:'S'}];button('제공 상세 검토').click();await tick();button('해석 재사용 후 재검토').click();await tick();
assert.deepEqual(calls.at(-1).sources,selected);assert.equal(reuse.length,0);
selected=[{analysisRunId:'linear',comboId:'S'}];button('제공 상세 검토').click();await tick();button('해석 재사용 후 재검토').click();await tick();
assert.deepEqual(calls.at(-1).sources,[{analysisRunId:'reused',comboId:'S'}]);assert.equal(reuse.length,1);
selected=[{rcSpliceId:'splice',comboId:'S'}];button('제공 상세 검토').click();await tick();stale=true;button('해석 재사용 후 재검토').click();await tick();
assert.ok(panel.querySelectorAll('p').some(p=>p.textContent.includes('재해석')));
stale=false;pending=true;button('해석 재사용 후 재검토').click();button('상세 검토 취소').click();pending(result);await tick();
assert.ok(panel.querySelectorAll('p').some(p=>p.textContent==='상세 검토 취소 요청됨'));
console.log('PASS native source-family reuse, stale rejection and cancelled late completion');
