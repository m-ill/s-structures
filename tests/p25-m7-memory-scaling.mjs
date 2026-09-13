import assert from 'node:assert/strict';
import {designContext} from './fixtures/p24/context.js';
import {createPracticalWorkflowService} from '../src/compute/product/practicalWorkflowService.js';
import {createResourceBudget} from '../src/core/resourceBudget.js';
const samples=[];
for(const n of [1,2]){
 const ctx=designContext(),m=ctx.model,budget=createResourceBudget(),service=createPracticalWorkflowService({bridge:ctx.bridge,budget});
 try{
  m.nodes=[];m.members=[];m.loads=[];
  for(let i=0;i<n;i++){
   m.nodes.push({id:`A${i}`,x:i*3,y:0,z:0,support:'fixed'},{id:`B${i}`,x:i*3,y:0,z:3});
   m.members.push({id:`M${i}`,n1:`A${i}`,n2:`B${i}`,type:'frame',matId:'concrete',secId:'rc3060'});
   m.loads.push({id:`F${i}`,type:'nodal',node:`B${i}`,P:10,dir:'-z',case:'D'});
  }
  m.loadCases=[{id:'D',name:'D',type:'dead'}];m.loadCombinations=[{id:'U',name:'U',type:'strength',factors:{D:1.4}}];
  m.analysisCases=[{id:'E',name:'E',kind:'static',settings:{comboId:'U',pDeltaMethod:'off'}}];
  const run=await ctx.bridge.runElasticWorkflow({plan:ctx.bridge.planElasticWorkflow({caseIds:['E']}),requestId:`memory-${n}`});assert.equal(run.ok,true);
  const input={inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,sources:[{analysisRunId:run.steps[0].analysisRunId,comboId:'U'}]};
  const r=await service.evaluate(input),first=budget.snapshot();
  await service.evaluate(input);assert.equal(budget.snapshot().totalBytes,first.totalBytes);
  assert.ok(!Object.keys(first.owners).some(k=>k.startsWith('practical-evaluation-transient')));
  assert.ok(first.peakBytes>=first.totalBytes);
  samples.push({members:n,checks:r.summary.checkCount,retained:first.totalBytes,peak:first.peakBytes});
  if(n===1){
   const restored=createPracticalWorkflowService({bridge:ctx.bridge,budget:createResourceBudget()});
   try{
    assert.deepEqual(service.getEvaluationStatus({evaluationId:r.evaluationId}).staleReasons,[]);
    restored.restoreState(service.exportState());
    for(const value of [restored.getEvaluationStatus({evaluationId:r.evaluationId}),restored.getEvaluation({evaluationId:r.evaluationId}),restored.getContext().evaluations[0]]){
     assert.equal(value.stale,true);
     assert.deepEqual(value.staleReasons,['RESTORED_BUILD_UNBOUND']);
    }
    const refreshed=await restored.evaluate(input);
    assert.equal(refreshed.evaluationId,r.evaluationId,'same-version refresh replaces the restored stale entry');
    assert.deepEqual(restored.getEvaluationStatus({evaluationId:r.evaluationId}).staleReasons,[]);
    const beforeHistory=structuredClone(m);
    const preview=await ctx.call('preview_design_changes',{inputHash:input.inputHash,requestId:'restore-history-preview',commands:[{type:'section-record',id:'HISTORY-RESTORE',name:'history currentness',version:1,shape:'RECT',dimensionUnit:'mm',B:300,H:500,sourceNote:'synthetic history fixture'}]});
    assert.equal((await ctx.call('apply_design_changes',{handle:preview.handle,requestId:'restore-history-apply'})).ok,true);
    assert.ok(restored.getEvaluationStatus({evaluationId:r.evaluationId}).staleReasons.includes('INPUT_CHANGED'));
    const changedHash=ctx.bridge.getWorkflowInputIdentity().inputHash;
    assert.equal((await ctx.call('undo_design_input',{inputHash:changedHash})).ok,true);
    const undoneHash=ctx.bridge.getWorkflowInputIdentity().inputHash;
    assert.notEqual(undoneHash,input.inputHash,'monotonic input revision prevents implicit result revival');
    assert.deepEqual(m.sections,beforeHistory.sections);
    assert.ok(restored.getEvaluationStatus({evaluationId:r.evaluationId}).staleReasons.includes('INPUT_CHANGED'));
    assert.equal((await ctx.call('redo_design_input',{inputHash:undoneHash})).ok,true);
    const redoneHash=ctx.bridge.getWorkflowInputIdentity().inputHash;
    assert.notEqual(redoneHash,changedHash);
    assert.ok(restored.getEvaluationStatus({evaluationId:r.evaluationId}).staleReasons.includes('INPUT_CHANGED'));
    assert.equal((await ctx.call('undo_design_input',{inputHash:redoneHash})).ok,true);
    assert.deepEqual(m.sections,beforeHistory.sections);
    await assert.rejects(restored.evaluate(input),/STALE_INPUT/);
    const finalHash=ctx.bridge.getWorkflowInputIdentity().inputHash;
    const reused=await ctx.call('reuse_design_analysis',{analysisRunId:input.sources[0].analysisRunId,inputHash:finalHash});
    assert.equal(reused.ok,true,JSON.stringify(reused));
    const rebound=await restored.evaluate({inputHash:finalHash,sources:[{analysisRunId:reused.analysisRunId,comboId:'U'}]});
    assert.equal(rebound.stale,false);assert.notEqual(rebound.evaluationId,r.evaluationId);
    assert.deepEqual(rebound.summary.counts,r.summary.counts);
    assert.ok(restored.getEvaluationStatus({evaluationId:r.evaluationId}).staleReasons.includes('INPUT_CHANGED'));


   }finally{restored.dispose();}
  }
  const tiny=createResourceBudget({maxBytes:1});let sourceReads=0;
  const denied=createPracticalWorkflowService({budget:tiny,bridge:{...ctx.bridge,getWorkflowAnalysisResult(){sourceReads++;throw Error('MUST_NOT_READ_SOURCE');}}});
  await assert.rejects(denied.evaluate({...input,inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash}),/MANAGED_MEMORY_BUDGET_EXCEEDED/);
  assert.equal(sourceReads,0);denied.dispose();assert.equal(tiny.snapshot().totalBytes,0);
 }finally{service.dispose();assert.equal(budget.snapshot().totalBytes,0);assert.equal(Object.keys(budget.snapshot().owners).length,0);await ctx.dispose();}
}
assert.ok(samples[1].retained>samples[0].retained);
assert.ok(samples[1].retained<samples[0].retained*2.5);
console.log(JSON.stringify({accounting:'retained-data-estimate-not-JS-heap',samples}));
console.log('PASS N/2N accounting, cache retention, clone admission and dispose owner release');
