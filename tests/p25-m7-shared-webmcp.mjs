import assert from 'node:assert/strict';
import {designContext} from './fixtures/p24/context.js';
const ctx=designContext(),m=ctx.model;
try{
 m.nodes=[{id:'A',x:0,y:0,z:0,support:'fixed'},{id:'B',x:0,y:0,z:3}];m.members=[{id:'AB',type:'frame',n1:'A',n2:'B',matId:'concrete',secId:'rc3060'}];m.loadCases=[{id:'D',type:'dead',name:'D'}];m.loads=[{id:'F',type:'nodal',node:'B',P:10,dir:'-z',case:'D'}];m.loadCombinations=[{id:'U',type:'strength',name:'U',factors:{D:1.4}}];m.analysisCases=[{id:'E',name:'E',kind:'static',settings:{comboId:'U',pDeltaMethod:'off'}}];
 const run=await ctx.bridge.runElasticWorkflow({plan:ctx.bridge.planElasticWorkflow({caseIds:['E']}),requestId:'cancel-source'});assert.equal(run.ok,true);
 const input={inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,sources:[{analysisRunId:run.steps[0].analysisRunId,comboId:'U'}]};
 const plan=await ctx.call('plan_design_review',{inputHash:input.inputHash,sources:input.sources});
 const before=ctx.bridge.getPracticalDesignContext().sharedResultCache.computation;
 const practical=ctx.call('evaluate_practical_design',input),cancelled=assert.rejects(practical,/CANCELLED/);
 const review=ctx.call('start_design_review',{handle:plan.handle,requestId:'concurrent-review'});
 assert.equal(ctx.bridge.getPracticalDesignContext().sharedResultCache.computation.joined,before.joined+1);
 await ctx.call('cancel_practical_design_evaluation');await cancelled;
 const result=await review;assert.ok(result.designRunId);
 const after=ctx.bridge.getPracticalDesignContext();assert.equal(after.sharedResultCache.computation.started,before.started+1);assert.equal(after.sharedResultCache.computation.active,0);assert.equal(after.evaluations.length,0);
 const retry=await ctx.call('evaluate_practical_design',input);assert.deepEqual(retry.summary,result.summary.practical);
 const budget=ctx.bridge.getResourceBudget();await ctx.dispose();assert.equal(budget.snapshot().totalBytes,0);
 console.log('PASS concurrent WebMCP review and evaluation share one RC Worker; single cancellation preserves peer and cache retry');
}finally{await ctx.dispose();}
