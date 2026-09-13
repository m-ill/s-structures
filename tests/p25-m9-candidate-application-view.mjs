import assert from 'node:assert/strict';
import {createFakeIndexDocument} from './helpers/fakeIndexDom.mjs';
import {installPracticalDesignControls} from '../src/ui/indexPracticalDesign.js';
const document=createFakeIndexDocument(),panel=document.createElement('div');document.body.appendChild(panel);
let currentInputHash='h';
let evaluationCount=1,resolveApply,refreshes=0,reads=0;const calls=[];
const result=id=>({ok:true,evaluationId:id,summary:{checkCount:evaluationCount,counts:{NG:1,NOT_CHECKED:0,FAILED:0},incompleteCheckCount:0},checks:[],nextOffset:null});
const candidate={candidateId:'C',changes:{regionCount:1,stirrupSpacing:100},summary:result('E').summary};
const bridge={getWorkflowInputIdentity:()=>({inputHash:currentInputHash}),evaluatePracticalDesign:async()=>result('E'),planDesignCandidates:()=>({ok:true,planId:'P',generation:{ok:true}}),startDesignCandidates:()=>({jobId:'J'}),getDesignCandidateJob:()=>({status:'completed',candidateCount:1,candidates:[candidate],best:candidate,nextOffset:null}),applyDesignCandidateAndReview:args=>{calls.push(args);return new Promise(r=>resolveApply=r);},getPracticalDesignEvaluation:()=>{reads++;return result('AFTER');}};
installPracticalDesignControls({target:{document},bridge,panel,getSources:()=>[],refreshSources:()=>refreshes++});
assert.ok(panel.querySelectorAll('button').some(b=>b.textContent==='상세 CSV 저장'));
const click=t=>panel.querySelectorAll('button').find(b=>b.textContent===t).click(),tick=()=>new Promise(r=>setTimeout(r,0));
click('제공 상세 검토');await tick();panel.querySelector('[aria-label="후보 대상 ID"]').value='M';panel.querySelector('[aria-label="후보 대상 종류"]').value='member';
click('계산 요구량으로 자동 후보');await tick();const select=panel.querySelector('[aria-label="배근 후보 선택"]');assert.equal(select.children.length,1);assert.equal(select.value,'C');assert.ok(select.children[0].textContent.includes('100mm'));
click('선택 후보 적용·재해석·검토');await tick();assert.equal(calls[0].candidateId,'C');
evaluationCount=9;click('제공 상세 검토');await tick();
resolveApply({ok:true,applied:true,followUp:{evaluationId:'AFTER',sources:[]}});await tick();
assert.equal(reads,0,'old apply completion must not replace newer review');assert.equal(refreshes,1,'applied source state still refreshed');
assert.ok(panel.querySelectorAll('p').some(p=>p.textContent.includes('상세 검토 9건')));
assert.ok(panel.querySelectorAll('p').some(p=>p.textContent.includes('이전 선택의 후보 적용')));
console.log('PASS rendered candidate selection and stale apply result isolation with explicit notice');

click('계산 요구량으로 자동 후보');await tick();click('선택 후보 적용·재해석·검토');await tick();
resolveApply({ok:true,applied:true,followUp:{evaluationId:'AFTER',sources:[]}});await tick();
assert.equal(reads,1,'current selection still displays successful follow-up');assert.equal(refreshes,2);

const {stableHash}=await import('../src/core/stableHash.js');
const detail={connectionChanges:[{before:{id:'J',version:1,jointWidth:.3},after:{id:'J',version:2,jointWidth:.35},changedFields:['jointWidth'],units:{jointWidth:'m'}}],foundationChanges:[{before:{id:'F',version:1,columnDepth:.3},after:{id:'F',version:2,columnDepth:.35},changedFields:['columnDepth'],units:{columnDepth:'m'}}],reinforcementChanges:[{before:{id:'R',version:1,bars:[{y:0,z:0,diameter:20}]},after:{id:'R',version:2,bars:[{y:.01,z:0,diameter:20}]}}]},text=JSON.stringify(detail);
let resolveDetail;bridge.getDesignCandidateDetail=({offset})=>offset?Promise.resolve({...packet,offset,chunk:'',nextOffset:null}):new Promise(resolve=>resolveDetail=resolve);
const packet={ok:true,stale:false,offset:0,total:text.length,detailHash:stableHash(detail),encoding:'json-text',chunk:text,nextOffset:null};
click('계산 요구량으로 자동 후보');await tick();click('후보 조건·수량 상세 보기');await tick();currentInputHash='new-hash';resolveDetail(packet);await tick();
assert.ok(!panel.querySelectorAll('h4').some(n=>n.textContent==='배근 변경 전후'));
click('후보 조건·수량 상세 보기');await tick();resolveDetail(packet);await tick();
assert.ok(panel.querySelectorAll('h4').some(n=>n.textContent==='배근 변경 전후'));
assert.ok(panel.querySelectorAll('td').some(n=>n.textContent==='10.000, 0.000'));
assert.ok(panel.querySelectorAll('h4').some(n=>n.textContent==='접합부 변경 전후'));assert.ok(panel.querySelectorAll('h4').some(n=>n.textContent==='기초 변경 전후'));assert.ok(panel.querySelectorAll('td').some(n=>n.textContent==='0.35')); 
console.log('PASS candidate detail integrates before/after view and discards late input-hash changes');

select.value='OTHER';select.dispatchEvent({type:'change'});
assert.ok(!panel.querySelectorAll('h4').some(n=>n.textContent==='배근 변경 전후'),'changing the candidate must clear the previous comparison');
select.value='C';click('후보 조건·수량 상세 보기');await tick();resolveDetail(packet);await tick();
assert.ok(panel.querySelectorAll('h4').some(n=>n.textContent==='배근 변경 전후'));
panel.querySelector('[aria-label="후보 대상 ID"]').value='OTHER_MEMBER';panel.querySelector('[aria-label="후보 대상 ID"]').dispatchEvent({type:'input'});
assert.ok(!panel.querySelectorAll('h4').some(n=>n.textContent==='배근 변경 전후'),'changing the member must release the displayed candidate comparison');
console.log('PASS displayed candidate comparison removed on candidate and member changes');

bridge.getDesignCandidateJob=()=>({status:'applied-needs-review',stageTiming:{activeStage:null,durationsMs:{geometry:1200,evaluation:2200}},error:'POST_APPLY_SCOPE_INCOMPLETE',candidateCount:1,candidates:[candidate],best:candidate,nextOffset:null});
click('계산 요구량으로 자동 후보');await tick();
assert.ok(panel.querySelectorAll('p').some(p=>p.textContent.includes('입력 적용됨 · 변경 영향 범위 추가 검토 필요')));
console.log('PASS post-apply incomplete scope has an explicit Korean status');

assert.ok(panel.querySelectorAll('p').some(p=>p.textContent.includes('형상 생성 1.2초')&&p.textContent.includes('설계 검토 2.2초')));

const blockers={total:1,truncated:false,counts:{input:1,designNg:0,failure:2,method:0,review:0},rows:[{entityId:'foundation:A',checkId:'foundation-bearing',status:'NOT_CHECKED',reason:'FOUNDATION_DETAIL_REQUIRED',withinAffectedScope:true,requiredInputRecords:[{type:'foundation-record',nodeId:'A'}],inputTargets:[],requiredInputFields:[],codeBasisStatus:'NOT_ESTABLISHED'}]};
blockers.inputActions={rows:[{action:'create',target:{type:'foundation-record',nodeId:'A'},requiredInputFields:[],affectedCheckCount:44}],unmappedCheckCount:0,truncated:false};
bridge.getDesignCandidateJob=()=>({status:'applied-needs-review',candidateCount:1,candidates:[candidate],best:candidate,nextOffset:null,application:{followUp:{evaluationId:'AFTER',comparison:{completionBlockers:blockers}}}});
click('계산 요구량으로 자동 후보');await tick();
assert.ok(panel.querySelectorAll('h4').some(n=>n.textContent==='적용 후 남은 보완 사항'));
assert.ok(panel.querySelectorAll('p').some(n=>n.textContent.includes('입력 보완 대상 1건')));
assert.ok(panel.querySelectorAll('p').some(n=>n.textContent.includes('계산 실패 2')&&n.textContent.includes('NG 0')));
assert.ok(panel.querySelectorAll('p').some(n=>n.textContent.includes('관련 검사 44건')));
assert.ok(panel.querySelectorAll('td').some(n=>n.textContent.includes('foundation-record')&&n.textContent.includes('A')));
panel.querySelector('[aria-label="후보 대상 ID"]').dispatchEvent({type:'input'});
assert.ok(!panel.querySelectorAll('h4').some(n=>n.textContent==='적용 후 남은 보완 사항'));
console.log('PASS automatic application renders current blocker input targets and clears them on target change');

click('계산 요구량으로 자동 후보');await tick();click('선택 후보 적용·재해석·검토');await tick();
resolveApply({ok:true,applied:true,followUp:{evaluationId:'AFTER',sources:[],comparison:{counts:{resolvedNg:1,remainingNg:0,newNg:0,ngToIncomplete:0,remainingIncomplete:1,newIncomplete:0,removed:0},completionBlockers:blockers}}});await tick();
assert.equal(panel.querySelectorAll('h4').filter(n=>n.textContent==='적용 후 남은 보완 사항').length,1);
assert.ok(panel.querySelectorAll('td').some(n=>n.textContent==='NOT_ESTABLISHED'));
bridge.getDesignCandidateJob=()=>({status:'applied-needs-review',stale:true,candidateCount:1,candidates:[candidate],best:candidate,nextOffset:null,application:{followUp:{evaluationId:'AFTER',comparison:{completionBlockers:blockers}}}});
click('계산 요구량으로 자동 후보');await tick();
assert.ok(!panel.querySelectorAll('h4').some(n=>n.textContent==='적용 후 남은 보완 사항'));
console.log('PASS manual review uses same blocker view; stale job suppresses old diagnostics');

const spliceOnly={spliceChanges:[{before:{id:'SP',version:1,memberId:'M',reinforcementId:'R@1',start:.48,end:.52},after:{id:'SP',version:2,memberId:'M',reinforcementId:'R@1',start:.2,end:.76}}],changes:{spliceLengthChanges:[{id:'SP',requiredLength:2.25,centreShiftM:-.08,positionStrategy:'neighbor-shift-preserving-overlap'}]}};
const spliceText=JSON.stringify(spliceOnly),splicePacket={ok:true,stale:false,offset:0,total:spliceText.length,detailHash:stableHash(spliceOnly),encoding:'json-text',chunk:spliceText,nextOffset:null};
bridge.getDesignCandidateJob=()=>({status:'completed',candidateCount:1,candidates:[candidate],best:candidate,nextOffset:null});
bridge.getDesignCandidateDetail=({offset})=>offset?Promise.resolve({...splicePacket,offset,chunk:'',nextOffset:null}):new Promise(resolve=>resolveDetail=resolve);
click('계산 요구량으로 자동 후보');await tick();click('후보 조건·수량 상세 보기');await tick();resolveDetail(splicePacket);await tick();
assert.ok(panel.querySelectorAll('h4').some(n=>n.textContent==='이음 변경 전후'),JSON.stringify(panel.querySelectorAll('p').map(n=>n.textContent)));assert.ok(!panel.querySelectorAll('h4').some(n=>n.textContent==='배근 변경 전후'));assert.ok(panel.querySelectorAll('td').some(n=>n.textContent==='인접 이음 회피'));
panel.querySelector('[aria-label="후보 대상 ID"]').dispatchEvent({type:'input'});assert.ok(!panel.querySelectorAll('h4').some(n=>n.textContent==='이음 변경 전후'));
console.log('PASS actual candidate detail button renders splice-only changes and clears them on target change');


const fullComparison={completionBlockers:{...blockers,rows:[{...blockers.rows[0],reason:'FULL_RECORDED_REASON'}]}};
const comparisonText=JSON.stringify(fullComparison),comparisonHash=stableHash(fullComparison);
let resolveComparison;
bridge.getPracticalDesignCheck=({offset,checkId})=>{assert.equal(checkId,comparisonHash);return offset?Promise.resolve({ok:true,stale:false,offset,totalChars:comparisonText.length,checkHash:comparisonHash,encoding:'json-text-utf16',chunk:'',nextOffset:null}):new Promise(resolve=>resolveComparison=resolve);};
const comparisonPacket={ok:true,stale:false,offset:0,totalChars:comparisonText.length,checkHash:comparisonHash,encoding:'json-text-utf16',chunk:comparisonText,nextOffset:null};
bridge.getDesignCandidateJob=()=>({status:'applied-needs-review',candidateCount:1,candidates:[candidate],best:candidate,nextOffset:null,application:{followUp:{evaluationId:'AFTER',comparison:{detailsTruncated:true,detailHash:comparisonHash,comparisonDetailQuery:{evaluationId:'AFTER',checkId:comparisonHash},completionBlockers:{...blockers,rows:[],truncated:true}}}}});
click('계산 요구량으로 자동 후보');await tick();click('적용 기록 상세 불러오기');await tick();
currentInputHash='comparison-new-input';resolveComparison(comparisonPacket);await tick();
assert.ok(!panel.querySelectorAll('td').some(n=>n.textContent==='FULL_RECORDED_REASON'));
click('적용 기록 상세 불러오기');await tick();resolveComparison(comparisonPacket);await tick();
assert.ok(panel.querySelectorAll('td').some(n=>n.textContent==='FULL_RECORDED_REASON'));
assert.ok(!panel.querySelectorAll('button').some(n=>n.textContent==='적용 기록 상세 불러오기'));
click('계산 요구량으로 자동 후보');await tick();click('적용 기록 상세 불러오기');await tick();
panel.querySelector('[aria-label="후보 대상 ID"]').dispatchEvent({type:'input'});resolveComparison(comparisonPacket);await tick();
assert.ok(!panel.querySelectorAll('h4').some(n=>n.textContent==='적용 후 남은 보완 사항'));
console.log('PASS installed UI comparison detail read/hash, stale input and late target isolation');

bridge.getPracticalDesignEvaluation=()=>({...result('AFTER'),stale:false,postApplication:{evaluationId:'AFTER',comparison:fullComparison}});
click('상세 결과 새로고침');await tick();assert.ok(panel.querySelectorAll('td').some(n=>n.textContent==='FULL_RECORDED_REASON'));
bridge.getPracticalDesignEvaluation=()=>({...result('AFTER'),stale:true,postApplication:{evaluationId:'AFTER',comparison:fullComparison}});
click('상세 결과 새로고침');await tick();assert.ok(!panel.querySelectorAll('h4').some(n=>n.textContent==='적용 후 남은 보완 사항'));
console.log('PASS re-opened evaluation restores comparison UI; stale evaluation clears it');

const {renderConnectedDetailChanges}=await import('../src/ui/connectedDetailChangeView.js');
const bounded=document.createElement('div'),keys=Array.from({length:25},(_,i)=>`field${i}`);
renderConnectedDetailChanges(document,bounded,[{before:{id:'J',version:1},after:{id:'J',version:2,...Object.fromEntries(keys.map(k=>[k,k]))},changedFields:keys}], 'connection-record');
assert.equal(bounded.querySelectorAll('tr').length,21);
bounded.querySelectorAll('button').find(b=>b.textContent==='다음 변경 항목').dispatchEvent({type:'click'});
assert.equal(bounded.querySelectorAll('tr').length,6);assert.ok(bounded.querySelectorAll('td').some(c=>c.textContent==='field24'));
console.log('PASS connected detail view renders bounded pages without dropping later changed fields');
