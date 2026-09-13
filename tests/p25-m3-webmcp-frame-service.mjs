import assert from 'node:assert/strict';
import {designContext} from './fixtures/p24/context.js';
const ctx=designContext(),m=ctx.model;
try{
 m.nodes=[{id:'A',x:0,y:0,z:0,support:'fixed'},{id:'B',x:4,y:0,z:0}];m.members=[{id:'AB',type:'frame',n1:'A',n2:'B',matId:'concrete',secId:'rc3060'}];
 const p=await ctx.call('preview_design_changes',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,requestId:'rc-interval-input',commands:[{type:'reinforcement-record',id:'R',name:'test',version:1,memberId:'AB',start:0,end:1,cover:.04,stirrupDiameter:10,stirrupLegs:2,stirrupSpacing:100,barMaterialId:'steel@1',sourceNote:'synthetic',bars:[[-.2,-.08],[-.2,.08],[.2,-.08],[.2,.08]].map(([y,z])=>({y,z,diameter:20})),lapRequired:true,serviceabilityMode:'instant-live-frame',serviceCrackingComboId:'T',serviceBaselineComboId:'D0',serviceDeflectionAxis:'v',serviceBoundary:'cantilever-start',serviceDeflectionLimit:'live-floor',nonstructuralDamageSensitive:false},{type:'splice-record',id:'SP',name:'lap',version:1,sourceNote:'synthetic',memberId:'AB',reinforcementId:'R@1',barIndices:['1'],start:.25,end:.65,offsetY:.02,offsetZ:0,spliceType:'tension-B',spliceSystem:'ordinary-no-seismic-detail',continuationSide:'offset-toward-end',transferStiffness:80000,transferElasticSlipLimit:.001,transferReference:'synthetic linear interface'}]});
 assert.ok(p.handle,JSON.stringify(p));assert.equal((await ctx.call('apply_design_changes',{handle:p.handle,requestId:'service-apply'})).ok,true);
 assert.equal(m.designDetails.reinforcement[0].serviceabilityMode,'instant-live-frame');assert.equal(m.designDetails.reinforcement[0].serviceBaselineComboId,'D0');
 m.analysisSettings.shearDeformation=false;m.analysisSettings.pDeltaMethod='off';m.analysisSettings.includeSelfWeight=false;
 m.loadCases=[{id:'D',name:'D',type:'dead'},{id:'L',name:'L',type:'live'}];
 m.loads=[{id:'FD',case:'D',type:'nodal',node:'B',dir:'-x',P:10},{id:'FL',case:'L',type:'nodal',node:'B',dir:'-z',P:.001}];
 m.loadCombinations=[{id:'T',name:'Total',type:'service',factors:{D:1,L:1}},{id:'D0',name:'Baseline',type:'service',factors:{D:1}}];
 const sources=[];
 for(const comboId of ['T','D0']){
  const result=await ctx.call('solve_rc_splice_model',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,comboId,frameConvergence:true});
  assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.frameRefinement.convergenceVerified,true);assert.equal(result.execution.measuredHeap,true);assert.equal(result.execution.memory.sampleCount,2);assert.equal(result.execution.memory.peakMeasured,false);sources.push({rcSpliceId:result.sourceId,comboId});
 }
 const evaluation=await ctx.call('evaluate_practical_design',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,sources});assert.equal(evaluation.ok,true,JSON.stringify(evaluation));
 const snapshot=ctx.bridge.getPracticalDesignSnapshot(evaluation.evaluationId);
 const check=snapshot.checks.find(c=>c.entityId==='AB'&&c.comboId==='T'&&c.checkId==='rc-deflection');
 assert.ok(['OK','NG'].includes(check.status),JSON.stringify(check));assert.ok(check.demand>0,JSON.stringify(check));assert.equal(check.capacity,4/360);assert.equal(check.incomplete,true);assert.equal(check.designTransferAllowed,false);assert.equal(check.baselineComboId,'D0');assert.ok(check.codeReferences.length);
 assert.ok(Number.isFinite(check.axialRelative.endChange));
 const {readJsonRecord}=await import('../src/ui/jsonRecordReader.js');
 const publicCheck=await readJsonRecord(args=>ctx.call('get_practical_design_check',{evaluationId:evaluation.evaluationId,checkId:check.id,...args}));
 assert.deepEqual(publicCheck.value.axialRelative,check.axialRelative);
 assert.equal(publicCheck.value.axialRelative.units,'m');
 assert.equal(publicCheck.value.incomplete,true);
 const baseline=snapshot.checks.find(c=>c.entityId==='AB'&&c.comboId==='D0'&&c.checkId==='rc-deflection');assert.equal(baseline.status,'N_A');
 const report=await ctx.call('export_design_drawings',{evaluationId:evaluation.evaluationId,format:'json'});assert.equal(report.ok,true,JSON.stringify(report));assert.equal(report.analysisSources.length,2);
 console.log('PASS real WebMCP frame service input, total/baseline solve, review and report',JSON.stringify({demand:check.demand,capacity:check.capacity,ratio:check.ratio}));
}finally{await ctx.dispose();}
