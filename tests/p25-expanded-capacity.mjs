import assert from 'node:assert/strict';
import {createResourceBudget} from '../src/core/resourceBudget.js';
import {PRACTICAL_DESIGN_LIMITS as limits} from '../src/metadata/practicalDesignLimits.js';
import {designContext} from './fixtures/p24/context.js';

// Exercise admission accounting without allocating a gigabyte of real memory.
const budget=createResourceBudget(),GiB=1024**3;
budget.reserve('retained-results',300*1024**2);
budget.reserve('worker',GiB-300*1024**2);
assert.equal(budget.snapshot().totalBytes,GiB);
assert.throws(()=>budget.reserve('one-more-byte',1),{code:'MANAGED_MEMORY_BUDGET_EXCEEDED'});
assert.equal(budget.snapshot().totalBytes,GiB,'failed reservations must be atomic');
budget.release('worker');budget.release('retained-results');assert.equal(budget.snapshot().totalBytes,0);
assert.equal(limits.maxMembers,300);
assert.ok(limits.maxStationsPerSet>=300*21,'default 21 samples per member must fit');

// A real 31-member model exceeds BOTH previous admission limits. No site data.
const memberCount=process.argv.includes('--300-members')?300:31;
const ctx=designContext(),m=ctx.model;
m.nodes=[{id:'BASE',x:0,y:0,z:0,support:'fixed'}];m.members=[];m.loads=[];
for(let i=0;i<memberCount;i++){
 const angle=2*Math.PI*i/memberCount,id=`N${i}`;
 m.nodes.push({id,x:3*Math.cos(angle),y:3*Math.sin(angle),z:3});
 m.members.push({id:`M${i}`,type:'frame',n1:'BASE',n2:id,matId:'concrete',secId:'rc3050'});
 m.loads.push({id:`P${i}`,type:'nodal',node:id,P:1,dir:'-z',case:'D'});
}
m.loadCases=[{id:'D',name:'D',type:'dead'}];m.loadCombinations=[{id:'U',name:'U',type:'strength',factors:{D:1.4}}];
m.analysisCases=[{id:'A',kind:'static',settings:{comboId:'U',pDeltaMethod:'off'}}];
try{
 const context=await ctx.call('get_practical_design_context');
 assert.equal(context.memory.maxBytes,GiB);
 assert.equal(context.limits.maxMembers,300);
 assert.equal(context.evaluationExecution.timeoutMs,limits.maxEvaluationMillis);
 const run=await ctx.bridge.runElasticWorkflow({plan:ctx.bridge.planElasticWorkflow({caseIds:['A']}),requestId:'expanded-capacity'});
 assert.equal(run.ok,true,JSON.stringify(run));
 const input={inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,sources:[{analysisRunId:run.steps[0].analysisRunId,comboId:'U'}]};
 const result=await ctx.call('evaluate_practical_design',input);
 assert.equal(result.ok,true);assert.equal(result.designTransferAllowed,false);
 assert.equal(result.summary.complete,false,'missing reinforcement must remain incomplete');
 const read=await ctx.call('get_practical_design_result',{evaluationId:result.evaluationId,limit:1});
 assert.deepEqual(read.summary,result.summary);
 console.log(JSON.stringify({ok:true,memberCount,scope:'Real synthetic members through WebMCP; 1GiB accounting boundary; missing reinforcement intentionally stays incomplete; not production performance qualification',summary:result.summary}));
}finally{await ctx.dispose();assert.equal(ctx.bridge.getResourceState().totalBytes,0);}
