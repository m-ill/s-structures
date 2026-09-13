import assert from 'node:assert/strict';
import {createFakeIndexDocument} from './helpers/fakeIndexDom.mjs';
import {installSpliceTransferControls} from '../src/ui/spliceTransferControls.js';
const document=createFakeIndexDocument(),panel=document.createElement('div'),handlers=[];let hash='h',args,resolve;
const bridge={solveRcSpliceInterval:x=>({ok:true,status:'CALCULATED',request:x}),getWorkflowInputIdentity:()=>({inputHash:hash}),evaluateSpliceElasticTransfer:x=>{args=x;return {ok:true,elasticRangeSatisfied:true,status:'CALCULATED'};}};
const ui=installSpliceTransferControls({target:{document,addEventListener:(name,fn)=>handlers.push(fn)},bridge,panel}),tick=()=>new Promise(r=>setTimeout(r,0));
ui.button.click();await tick();assert.equal(args,undefined);assert.ok(ui.status.textContent.includes('입력'));
ui.fields.spliceId.value='SP';ui.fields.barIndex.value='1';ui.fields.force.value='10';ui.button.click();await tick();
assert.deepEqual(args,{inputHash:'h',spliceId:'SP',barIndex:1,force:10});assert.ok(ui.status.textContent.includes('탄성 범위 내'));assert.ok(ui.result.textContent.includes('CALCULATED'));
bridge.evaluateSpliceElasticTransfer=()=>({ok:true,elasticRangeSatisfied:true,rcHostCoupling:{status:'NOT_CHECKED',reason:'RC_LAP_HOST_ELASTIC_RANGE_EXCEEDED'}});ui.button.click();await tick();assert.ok(ui.status.textContent.includes('RC_LAP_HOST_ELASTIC_RANGE_EXCEEDED'));
ui.intervalLoads.value='-10,0,0,0,0,0';ui.intervalButton.click();await tick();assert.ok(ui.status.textContent.includes('평형 계산 완료'));assert.deepEqual(JSON.parse(ui.result.textContent).request.endLoads,[-10,0,0,0,0,0]);
bridge.evaluateSpliceElasticTransfer=()=>new Promise(r=>{resolve=r;});ui.button.click();hash='next';resolve({ok:true,elasticRangeSatisfied:true});await tick();assert.equal(ui.result.textContent,'');assert.ok(ui.status.textContent.includes('변경'));
ui.button.click();for(const fn of handlers)fn();resolve({ok:true,elasticRangeSatisfied:true});await tick();assert.equal(ui.result.textContent,'');assert.equal(ui.button.disabled,false);
console.log('PASS native transfer inputs, selected force, stale-input and detached-page result rejection');

let resolveInterval;bridge.solveRcSpliceInterval=()=>new Promise(r=>{resolveInterval=r;});ui.intervalButton.click();ui.intervalLoads.value='-20,0,0,0,0,0';ui.intervalLoads.dispatchEvent({type:'input'});resolveInterval({ok:true,status:'CALCULATED'});await tick();assert.equal(ui.result.textContent,'');assert.ok(ui.status.textContent.includes('변경'));
console.log('PASS interval input edit discards late Worker response');

const modelDocument=createFakeIndexDocument(),modelPanel=modelDocument.createElement('div');let modelCalls=0,pageCalls=0,modelArgs;
const modelBridge={...bridge,getCurrentModel:()=>({loadCombinations:[{id:'S',enabled:true},{id:'disabled',enabled:false}]}),solveRcSpliceModel:x=>{modelCalls++;modelArgs=x;return {ok:true,status:'CALCULATED',stressIntegrationConvergenceVerified:true,frameRefinement:{convergenceVerified:true},inputHash:hash,segments:[{memberId:'M'}],segmentPage:{offset:0,total:4,returned:3,nextOffset:3}};},getRcSpliceModelResult:x=>{pageCalls++;return {ok:true,status:'CALCULATED',inputHash:hash,stressIntegrationConvergenceVerified:true,frameRefinement:{convergenceVerified:true},segments:[{memberId:'last'}],segmentPage:{offset:x.offset,total:4,returned:1,nextOffset:null}};}};
const modelUi=installSpliceTransferControls({target:{document:modelDocument,addEventListener(){}},bridge:modelBridge,panel:modelPanel});
assert.ok(modelUi.modelButton);modelUi.comboId.value='S';modelUi.modelButton.click();await tick();
assert.deepEqual(modelArgs,{inputHash:hash,comboId:'S',frameConvergence:true});assert.ok(modelUi.status.textContent.includes('수렴'));assert.equal(modelUi.nextPage.disabled,false);
modelUi.nextPage.click();await tick();assert.equal(modelCalls,1);assert.equal(pageCalls,1);assert.ok(modelUi.result.textContent.includes('last'));assert.equal(modelUi.nextPage.disabled,true);
modelBridge.solveRcSpliceModel=()=>({ok:false,status:'NOT_CHECKED',reason:'RC_MODEL_SPATIAL_REFINEMENT_LIMIT'});modelUi.modelButton.click();await tick();assert.ok(modelUi.status.textContent.includes('RC_MODEL_SPATIAL_REFINEMENT_LIMIT'));assert.equal(modelUi.nextPage.disabled,true);
console.log('PASS native source-model combination, mandatory convergence, prepared-result paging and failure status');

let finishModel;modelBridge.solveRcSpliceModel=()=>new Promise(r=>{finishModel=r;});modelUi.modelButton.click();assert.equal(modelUi.button.disabled,true);assert.equal(modelUi.intervalButton.disabled,true);
modelUi.comboId.dispatchEvent({type:'change'});finishModel({ok:true,inputHash:hash,status:'CALCULATED',stressIntegrationConvergenceVerified:true,frameRefinement:{convergenceVerified:true},segments:[],segmentPage:{offset:0,total:4,returned:3,nextOffset:3}});await tick();
assert.equal(modelUi.result.textContent,'');assert.ok(modelUi.status.textContent.includes('변경'));assert.equal(modelUi.modelButton.disabled,false);assert.equal(modelUi.nextPage.disabled,true);
modelBridge.solveRcSpliceModel=()=>({ok:true,inputHash:hash,status:'CALCULATED',stressIntegrationConvergenceVerified:true,frameRefinement:{convergenceVerified:true},segments:[],segmentPage:{offset:0,total:4,returned:3,nextOffset:3}});modelUi.modelButton.click();await tick();
let finishPage;modelBridge.getRcSpliceModelResult=()=>new Promise(r=>{finishPage=r;});modelUi.nextPage.click();hash='changed-again';finishPage({ok:true,inputHash:'next',segments:[{memberId:'stale'}],segmentPage:{offset:3,total:4,returned:1,nextOffset:null}});await tick();assert.equal(modelUi.result.textContent,'');assert.equal(modelUi.nextPage.disabled,true);assert.ok(modelUi.status.textContent.includes('변경'));
console.log('PASS source-model busy state, changed combination discards pending solve, stale result page rejected');
