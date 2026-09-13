import assert from 'node:assert/strict';
import {compareFirstSecondOrderMoments} from '../src/solver/pdelta/momentComparison.js';
const ax={x:[1,0,0],y:[0,1,0],z:[0,0,1],L:2};
const source=Mz=>({ok:true,memberResults:{M:{ax,xs:[0,1,2],My:[0,0,0],Mz}}});
const first=source([10,0,-10]),second=source([15,2,-12]);
const r=compareFirstSecondOrderMoments(first,second).members.M;
assert.equal(r.status,'EXCEEDS_AT_RECORDED_STATIONS');assert.equal(r.axes.Mz.governing.x,1);
assert.equal(r.axes.Mz.governing.ratio,null);assert.equal(r.axes.Mz.zeroReferenceExceedance,true);
assert.equal(r.fullMemberQualified,false);
assert.equal(compareFirstSecondOrderMoments(first,source([14,0,-14])).members.M.status,'WITHIN_AT_RECORDED_STATIONS');
second.memberResults.M.xs=[0,.5,2];assert.equal(compareFirstSecondOrderMoments(first,second).members.M.reason,'MOMENT_COMPARISON_GRID_MISMATCH');
second.memberResults.M.xs=[0,1,2];second.memberResults.M.ax={...ax,y:[0,-1,0]};assert.equal(compareFirstSecondOrderMoments(first,second).members.M.reason,'MOMENT_COMPARISON_AXES_MISMATCH');
console.log('PASS matched positions/axes, zero-reference excess and explicit station-only qualification');

const {prepareProvidedStability}=await import('../src/design/rc/kdsStability.js');
const evidence=compareFirstSecondOrderMoments(first,source([15,2,-12]));
const fullDetail={id:'R',version:1,start:0,end:1,stabilityStandard:'KDS-142020-2022',stabilitySystem:'braced-column',stabilityClassificationReference:'synthetic'};
for(const [details,tuples,reason] of [
 [[{...fullDetail,end:.5}],[{N:-1,My:0,Mz:1}],'STABILITY_PRISMATIC_FULL_LENGTH_DETAIL_REQUIRED'],
 [[fullDetail],[{N:-1,My:0,Mz:1},{N:-2,My:0,Mz:1}],'VARIABLE_AXIAL_COLUMN_STABILITY_REQUIRED'],
 [[{...fullDetail,stabilityClassificationReference:''}],[{N:-1,My:0,Mz:1}],'BRACED_COLUMN_CLASSIFICATION_AND_REFERENCE_REQUIRED']
]){
 const pending=prepareProvidedStability({}, {id:'M'},details,tuples,'direct',{firstOrderMomentComparison:evidence});
 assert.equal(pending.check.status,'NOT_CHECKED');assert.equal(pending.check.reason,reason);
 assert.deepEqual(pending.check.momentComparison,evidence.members.M);
 assert.equal(pending.check.observedMomentExcess,true);
 assert.equal(pending.strengthTuples,tuples);
}
const {designContext}=await import('./fixtures/p24/context.js');
const {resolveMaterialRecord}=await import('../src/materials/registry.js');
const {readJsonRecord}=await import('../src/ui/jsonRecordReader.js');
const ctx=designContext();
try{
 Object.assign(ctx.model,{nodes:[{id:'A',x:0,y:0,z:0,support:'fixed'},{id:'B',x:3,y:0,z:0}],members:[{id:'AB',type:'frame',n1:'A',n2:'B',matId:'concrete',secId:'rc3060'}],loadCases:[{id:'D',name:'D',type:'dead'}],loadCombinations:[{id:'U',name:'U',type:'strength',factors:{D:1}}],analysisCases:[{id:'E',name:'E',kind:'static',status:'not-run',settings:{comboId:'U',pDeltaMethod:'direct'}}]});
 ctx.model.analysisSettings.selfWeight=false;
 ctx.model.analysisSettings.pDeltaMethod='direct';
 const ec=resolveMaterialRecord(ctx.model,'concrete').elastic.E;
 const weakPc=Math.PI**2*.2*ec*1000*(.6*.3**3/12)/9;
 ctx.model.loads=[{id:'P',type:'nodal',node:'B',dir:'-x',P:.75*weakPc*.95,case:'D'},{id:'H',type:'nodal',node:'B',dir:'-y',P:1,case:'D'}];
 const command={type:'reinforcement-record',id:'R',name:'synthetic',version:1,memberId:'AB',start:0,end:1,cover:.04,barMaterialId:'steel@1',bars:[-1,1].flatMap(y=>[-1,1].map(z=>({y:y*.2,z:z*.08,diameter:20}))),sourceNote:'synthetic bound check; bracing classification is not independently qualified',strengthStandard:'KDS-142020-2022',stabilityStandard:'KDS-142020-2022',stabilitySystem:'braced-column',stabilityClassificationReference:'synthetic classification',concreteWeight:'normal'};
 const preview=await ctx.call('preview_design_changes',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,requestId:'column-preview',commands:[command]});assert.equal(preview.ok,true,JSON.stringify(preview));
 assert.equal((await ctx.call('apply_design_changes',{handle:preview.handle,requestId:'column-apply'})).ok,true);
 const run=await ctx.bridge.runElasticWorkflow({plan:ctx.bridge.planElasticWorkflow({caseIds:['E']}),requestId:'column-analysis'});assert.equal(run.ok,true,JSON.stringify(run));
 const evaluated=await ctx.call('evaluate_practical_design',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,sources:[{analysisRunId:run.steps[0].analysisRunId,comboId:'U'}]});
 const snapshot=ctx.bridge.getPracticalDesignSnapshot(evaluated.evaluationId),check=snapshot.checks.find(c=>c.checkId==='rc-stability');
 assert.equal(check.status,'NG',JSON.stringify(check));assert.equal(check.reason,'DIRECT_MOMENT_AMPLIFICATION_LIMIT_EXCEEDED');
 assert.ok(check.ratio===null||check.ratio>1);assert.equal(check.momentComparison.status,'EXCEEDS_IN_RECOVERY_INTERVALS');assert.equal(snapshot.summary.complete,false);
 const detailed=await readJsonRecord(args=>ctx.call('get_practical_design_check',{evaluationId:evaluated.evaluationId,checkId:check.id,...args}));
 assert.deepEqual(detailed.value.momentComparison,check.momentComparison);assert.equal(detailed.value.incomplete,true);assert.ok(detailed.value.codeReferences.some(r=>r.clause.includes('4.4.2(2)')));
 const unclassified={...command,version:2};for(const key of ['stabilityStandard','stabilitySystem','stabilityClassificationReference'])delete unclassified[key];
 const change=await ctx.call('preview_design_changes',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,requestId:'classification-missing',commands:[unclassified]});
 assert.equal((await ctx.call('apply_design_changes',{handle:change.handle,requestId:'classification-missing-apply'})).ok,true);
 const secondRun=await ctx.bridge.runElasticWorkflow({plan:ctx.bridge.planElasticWorkflow({caseIds:['E']}),requestId:'unclassified-analysis'});assert.equal(secondRun.ok,true);
 const secondReview=await ctx.call('evaluate_practical_design',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,sources:[{analysisRunId:secondRun.steps[0].analysisRunId,comboId:'U'}]});
 const pending=ctx.bridge.getPracticalDesignSnapshot(secondReview.evaluationId).checks.find(c=>c.checkId==='rc-stability');
 assert.equal(pending.status,'NOT_CHECKED');assert.equal(pending.reason,'BRACED_COLUMN_CLASSIFICATION_AND_REFERENCE_REQUIRED');
 assert.equal(pending.observedMomentExcess,true);assert.equal(pending.momentComparison.status,'EXCEEDS_IN_RECOVERY_INTERVALS');
 const pendingDetail=await readJsonRecord(args=>ctx.call('get_practical_design_check',{evaluationId:secondReview.evaluationId,checkId:pending.id,...args}));
 assert.deepEqual(pendingDetail.value.momentComparison,pending.momentComparison);
 assert.ok(pendingDetail.value.codeReferences.some(r=>r.clause==='4.4.2(2)'&&r.governsCalculation===false));
 console.log('PASS actual WebMCP input -> Direct same-run seed comparison -> observed moment excess NG -> KDS detail; method qualification pending');
}finally{await ctx.dispose();}
