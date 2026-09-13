import assert from 'node:assert/strict';
import {createModel} from '../src/core/model.js';
import {stagePracticalDesignInput} from '../src/modeling/practicalDesignInputs.js';
import {evaluateProvidedAnchorage} from '../src/design/rc/providedAnchorage.js';
const m=createModel();m.nodes=[{id:'A',x:0,y:0,z:0},{id:'B',x:3,y:0,z:0}];m.members=[{id:'AB',type:'frame',n1:'A',n2:'B',matId:'concrete',secId:'rc3060'}];
stagePracticalDesignInput(m,{type:'reinforcement-record',id:'R',name:'R',version:1,memberId:'AB',start:0,end:1,cover:.04,barMaterialId:'steel@1',sourceNote:'synthetic',bars:[{y:-.2,z:0,diameter:20}],reinforcementForm:'single-deformed',anchorageStandard:'KDS-142052-2024',anchorageMode:'hook-tension',concreteWeight:'normal',barPosition:'other',barCoating:'uncoated',lapRequired:false,startFabricationShape:'L90',endFabricationShape:'L90',startBendInsideRadius:.06,endBendInsideRadius:.06,startHookTailLength:.24,endHookTailLength:.24,endSetbackStart:.04,endSetbackEnd:.04,anchorageStartCriticalX:.7,anchorageEndCriticalX:2.3},[]);
const d=m.designDetails.reinforcement[0],run=()=>evaluateProvidedAnchorage(m,m.members[0],[d]);
let r=run();assert.equal(r.status,'OK',JSON.stringify(r));assert.equal(r.calculations.length,2);assert.equal(r.calculations[0].end,'start');assert.equal(r.calculations[1].end,'end');
d.anchorageEndCriticalX=2.8;r=run();assert.equal(r.status,'NG');assert.equal(r.governing.end,'end');
d.endHookTailLength=.01;assert.equal(run().status,'NOT_CHECKED');
console.log('PASS actual both-end geometry/critical section anchorage and one-end deficiency');

Object.assign(d,{anchorageMode:'straight-compression',startFabricationShape:'straight',endFabricationShape:'straight',anchorageStartCriticalX:.7,anchorageEndCriticalX:2.3});
r=run();assert.equal(r.status,'OK');assert.equal(r.calculations[0].assumption,'full-yield-compression-at-supplied-critical-section');
d.anchorageEndCriticalX=2.85;assert.equal(run().status,'NG');
d.endFabricationShape='L90';d.endHookTailLength=.24;assert.equal(run().reason,'COMPRESSION_REQUIRES_STRAIGHT_END_GEOMETRY');

Object.assign(d,{anchorageMode:'straight-tension',startFabricationShape:'straight',endFabricationShape:'straight',anchorageStartCriticalX:0,anchorageEndCriticalX:3,startExtension:1.04,endExtension:1.04,endSetbackStart:.04,endSetbackEnd:.04});
r=run();assert.equal(r.status,'OK',JSON.stringify(r));assert.equal(r.calculations[0].providedMm,1000);assert.equal(r.calculations[1].providedMm,1000);
d.endExtension=0;assert.equal(run().status,'NG');

const deficient={...d,id:'DEFICIENT',endExtension:.05};
const missing={...d,id:'MISSING',anchorageStandard:undefined};
for(const regions of [[deficient,missing],[missing,deficient]]){
 const mixed=evaluateProvidedAnchorage(m,m.members[0],regions);
 assert.equal(mixed.status,'NG','confirmed region deficiency must survive another region missing its standard');
 assert.equal(mixed.incomplete,true);assert.equal(mixed.locationCoverage.total,2);assert.equal(mixed.locationCoverage.counts.NG,1);assert.equal(mixed.locationCoverage.counts.NOT_CHECKED,1);
 assert.ok(mixed.requiredInputFields.includes('anchorageStandard'));assert.ok(mixed.inputTargets.some(t=>t.id==='MISSING'));
 assert.ok(mixed.calculations.some(c=>c.detailId==='DEFICIENT'&&c.source));
}
const completeRegion={...d,id:'COMPLETE',endExtension:1.04};
const completeRegions=evaluateProvidedAnchorage(m,m.members[0],[completeRegion,{...completeRegion,id:'COMPLETE2'}]);assert.equal(completeRegions.status,'OK');assert.equal(completeRegions.incomplete,false);assert.equal(completeRegions.calculations.length,4);
const incompleteRegion=evaluateProvidedAnchorage(m,m.members[0],[completeRegion,missing]);assert.equal(incompleteRegion.status,'NOT_CHECKED');assert.equal(incompleteRegion.calculations.length,2);
console.log('PASS multi-region anchorage preserves calculated NG, missing inputs and KDS evidence in either order');

const {designContext}=await import('./fixtures/p24/context.js');
const ctx=designContext();
try{
 Object.assign(ctx.model,{nodes:[{id:'A',x:0,y:0,z:0,support:'fixed'},{id:'B',x:3,y:0,z:0}],members:m.members,loadCases:[{id:'D',type:'dead',name:'D'}],loads:[{id:'P',type:'nodal',node:'B',P:1,dir:'-z',case:'D'}],loadCombinations:[{id:'U',type:'strength',name:'U',factors:{D:1.4}}],analysisCases:[{id:'E',name:'E',kind:'static',status:'not-run',settings:{comboId:'U',pDeltaMethod:'off'}}]});
 const {practicalCommandFromRecord}=await import('../src/modeling/practicalInputContract.js');
 for(const record of [{...deficient,start:0,end:.5,anchorageEndCriticalX:1.5},{...missing,start:.5,end:1,anchorageEndCriticalX:1.5}]){const command=practicalCommandFromRecord('reinforcement-record',record);if(command.anchorageStandard===undefined)delete command.anchorageStandard;stagePracticalDesignInput(ctx.model,command,[]);}
 const run=await ctx.bridge.runElasticWorkflow({plan:ctx.bridge.planElasticWorkflow({caseIds:['E']}),requestId:'region-source'});assert.equal(run.ok,true,JSON.stringify({run,validation:ctx.bridge.getAnalysisRunResult(run.steps[0].jobId)?.payload?.validation}));
 const evaluation=await ctx.call('evaluate_practical_design',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,sources:[{analysisRunId:run.steps[0].analysisRunId,comboId:'U'}]});
 const result=ctx.bridge.getPracticalDesignSnapshot(evaluation.evaluationId).checks.find(c=>c.checkId==='rc-anchorage');
 assert.equal(result.status,'NG');assert.equal(result.incomplete,true);assert.equal(result.locationCoverage.total,2);assert.ok(result.inputTargets.some(t=>t.id==='MISSING'));assert.ok(result.calculations.some(c=>c.source));
 console.log('PASS actual WebMCP evaluation retains multi-region anchorage NG and missing-standard target');
 const barRecord={...d,id:'BAR_MIX',anchorageMode:'hook-tension',startFabricationShape:'L90',endFabricationShape:'L90',startBendInsideRadius:.06,endBendInsideRadius:.06,startHookTailLength:.24,endHookTailLength:.24,startExtension:1.04,endExtension:.05,bars:[{...d.bars[0],diameter:.02,y:-.2},{...d.bars[0],diameter:.04,y:.15}]};
 ctx.model.designDetails.reinforcement=[];stagePracticalDesignInput(ctx.model,practicalCommandFromRecord('reinforcement-record',barRecord),[]);
 const barRun=await ctx.bridge.runElasticWorkflow({plan:ctx.bridge.planElasticWorkflow({caseIds:['E']}),requestId:'bar-source'});assert.equal(barRun.ok,true,JSON.stringify(barRun));
 const barEvaluation=await ctx.call('evaluate_practical_design',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,sources:[{analysisRunId:barRun.steps[0].analysisRunId,comboId:'U'}]});
 const barCheck=ctx.bridge.getPracticalDesignSnapshot(barEvaluation.evaluationId).checks.find(c=>c.checkId==='rc-anchorage');assert.equal(barCheck.status,'NG');assert.equal(barCheck.incomplete,true);assert.equal(barCheck.locationCoverage.missingLocations[0].bar,1);
 console.log('PASS actual WebMCP retains per-bar geometry gap alongside another bar development failure');

}finally{await ctx.dispose();}

const mixedBars={...d,anchorageMode:'hook-tension',startFabricationShape:'L90',endFabricationShape:'L90',startBendInsideRadius:.06,endBendInsideRadius:.06,startHookTailLength:.24,endHookTailLength:.24,startExtension:1.04,endExtension:.05,bars:[{...d.bars[0],diameter:.02,y:-.2},{...d.bars[0],diameter:.04,y:.15}]};
for(const bars of [mixedBars.bars,[...mixedBars.bars].reverse()]){
 const result=evaluateProvidedAnchorage(m,m.members[0],[{...mixedBars,bars}]);
 assert.equal(result.status,'NG');assert.equal(result.incomplete,true);assert.ok(result.calculations.some(c=>c.ratio>1));assert.ok(result.incompleteReasons.includes('BOTH_END_STANDARD_GEOMETRY_REQUIRED'));assert.equal(result.locationCoverage.missingLocations[0].bar,bars.findIndex(b=>b.diameter===.04));
}
const legacyGap={...d,anchorageMode:'straight-tension',anchorageLength:.01,lapRequired:undefined};delete legacyGap.anchorageStartCriticalX;delete legacyGap.anchorageEndCriticalX;
const gapResult=evaluateProvidedAnchorage(m,m.members[0],[legacyGap]);assert.equal(gapResult.status,'NG');assert.equal(gapResult.incomplete,true);assert.ok(gapResult.requiredInputFields.includes('lapRequired'));
console.log('PASS within-region bar geometry and missing lap declaration cannot erase calculated anchorage NG');

const unreachable=evaluateProvidedAnchorage(m,m.members[0],[{...d,startExtension:0,endExtension:0}]);
assert.equal(unreachable.status,'NG');assert.equal(unreachable.calculations.length,2);assert.ok(unreachable.calculations.every(c=>c.requiredMm>0&&c.providedMm<0&&c.ratio===null&&c.source));
console.log('PASS both unreachable ends retain calculated development demand without nonfinite ratios');
