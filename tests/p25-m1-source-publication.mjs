import assert from 'node:assert/strict';
import {designContext} from './fixtures/p24/context.js';
const ctx=designContext(),m=ctx.model;
try{
 m.nodes=[{id:'A',x:0,y:0,z:0,support:'fixed'},{id:'B',x:0,y:0,z:3}];m.members=[{id:'AB',type:'frame',n1:'A',n2:'B',matId:'concrete',secId:'rc3060'}];m.loadCases=[{id:'D',type:'dead',name:'D'}];m.loads=[{id:'F',type:'nodal',node:'B',P:10,dir:'-z',case:'D'}];m.loadCombinations=[{id:'U',type:'strength',name:'U',factors:{D:1.4}}];m.analysisCases=[{id:'E',name:'E',kind:'static',settings:{comboId:'U',pDeltaMethod:'off'}}];
 const run=await ctx.bridge.runElasticWorkflow({plan:ctx.bridge.planElasticWorkflow({caseIds:['E']}),requestId:'cancel-source'});assert.equal(run.ok,true);
 const input={inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,sources:[{analysisRunId:run.steps[0].analysisRunId,comboId:'U'}]};
 const metadata=ctx.bridge.getWorkflowAnalysisMetadata;
 let changed=false;
 ctx.bridge.getWorkflowAnalysisMetadata=id=>{const row=metadata(id);return changed&&row.ok?{...row,resultHash:'f'.repeat(64)}:row;};
 try{
  const pending=ctx.call('evaluate_practical_design',input);changed=true;
  await assert.rejects(pending,/DESIGN_SOURCE_CHANGED/);
  assert.equal((await ctx.call('get_practical_design_context')).evaluations.length,0);
  changed=false;const first=await ctx.call('evaluate_practical_design',input);
  changed=true;assert.equal((await ctx.call('get_practical_design_result',{evaluationId:first.evaluationId})).stale,true);
  changed=false;assert.equal((await ctx.call('get_practical_design_result',{evaluationId:first.evaluationId})).stale,false);
 }finally{ctx.bridge.getWorkflowAnalysisMetadata=metadata;}
 console.log('PASS source hash changes block evaluation publication and invalidate stored-result reuse');
}finally{await ctx.dispose();}
