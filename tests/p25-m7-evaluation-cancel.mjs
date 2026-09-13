import assert from 'node:assert/strict';
import {designContext} from './fixtures/p24/context.js';
const ctx=designContext(),m=ctx.model;
try{
 m.nodes=[{id:'A',x:0,y:0,z:0,support:'fixed'},{id:'B',x:0,y:0,z:3}];m.members=[{id:'AB',type:'frame',n1:'A',n2:'B',matId:'concrete',secId:'rc3060'}];m.loadCases=[{id:'D',type:'dead',name:'D'}];m.loads=[{id:'F',type:'nodal',node:'B',P:10,dir:'-z',case:'D'}];m.loadCombinations=[{id:'U',type:'strength',name:'U',factors:{D:1.4}}];m.analysisCases=[{id:'E',name:'E',kind:'static',settings:{comboId:'U',pDeltaMethod:'off'}}];
 const run=await ctx.bridge.runElasticWorkflow({plan:ctx.bridge.planElasticWorkflow({caseIds:['E']}),requestId:'cancel-source'});assert.equal(run.ok,true);
 const input={inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,sources:[{analysisRunId:run.steps[0].analysisRunId,comboId:'U'}]};
 const pending=ctx.call('evaluate_practical_design',input);
 const rejected=assert.rejects(pending,/CANCELLED/);
 assert.equal((await ctx.call('cancel_practical_design_evaluation')).cancelRequested,true);await rejected;
 let context=await ctx.call('get_practical_design_context');assert.equal(context.evaluations.length,0);assert.equal(context.evaluationExecution.active,false);
 assert.ok(!Object.keys(context.memory.owners).some(x=>x.startsWith('practical-evaluation-transient')));
 const first=await ctx.call('evaluate_practical_design',input),second=await ctx.call('evaluate_practical_design',input);assert.equal(first.evaluationId,second.evaluationId);
 context=await ctx.call('get_practical_design_context');assert.equal(context.evaluations.length,1);assert.equal(context.evaluationExecution.mode,'module-worker');
 const beforeHits=ctx.bridge.getPracticalDesignContext().sharedResultCache.hits,plan=await ctx.call('plan_design_review',{inputHash:input.inputHash,sources:input.sources});const reviewed=await ctx.call('start_design_review',{handle:plan.handle,requestId:'practical-to-review'});assert.deepEqual(reviewed.summary.practical,first.summary);assert.ok(ctx.bridge.getPracticalDesignContext().sharedResultCache.hits>beforeHits);
 console.log('PASS real WebMCP evaluation cancellation, no partial publication, resource release and cached retry');
}finally{await ctx.dispose();}
