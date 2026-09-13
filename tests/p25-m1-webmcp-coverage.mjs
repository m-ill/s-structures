import assert from 'node:assert/strict';
import {designContext} from './fixtures/p24/context.js';
const ctx=designContext(),m=ctx.model;
m.nodes=[{id:'A',x:0,y:0,z:0,support:'fixed'},{id:'B',x:0,y:0,z:3}];
m.members=[{id:'AB',n1:'A',n2:'B',type:'frame',matId:'concrete',secId:'rc3060'}];
m.loadCases=[{id:'D',type:'dead',name:'D'}];
m.loads=[{id:'F',type:'nodal',node:'B',P:10,dir:'-x',case:'D'}];
m.loadCombinations=[{id:'U',name:'U',type:'strength',factors:{D:1.4}},{id:'S',name:'S',type:'service',factors:{D:1}}];
m.analysisCases=[{id:'E',name:'E',kind:'static',settings:{comboId:'U',pDeltaMethod:'off'}}];
try {
 const run=await ctx.bridge.runElasticWorkflow({plan:ctx.bridge.planElasticWorkflow({caseIds:['E']}),requestId:'p25-coverage'});
 assert.equal(run.ok,true);
 const args={inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,sources:[{analysisRunId:run.steps[0].analysisRunId,comboId:'U'}]};
 const evaluated=await ctx.call('evaluate_practical_design',args);
 assert.deepEqual(evaluated.summary.combinationCoverage.missingIds,['S']);
 assert.deepEqual(evaluated.summary.combinationCoverage.missingPurposes,['service']);
 assert.equal(evaluated.summary.complete,false);
 const read=await ctx.call('get_practical_design_result',{evaluationId:evaluated.evaluationId});
 assert.deepEqual(read.summary,evaluated.summary);
 assert.deepEqual((await ctx.call('get_practical_design_context')).evaluations[0].summary,read.summary);
 assert.deepEqual((await ctx.call('evaluate_practical_design',args)).summary,read.summary);
 console.log('PASS P25 WebMCP evaluate/read/context/cache preserve missing combination coverage');
}finally{await ctx.dispose();}
