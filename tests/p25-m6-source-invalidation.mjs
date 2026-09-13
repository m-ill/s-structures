import assert from 'node:assert/strict';
import {designContext} from './fixtures/p24/context.js';
import {stagePracticalDesignInput} from '../src/modeling/practicalDesignInputs.js';
const ctx=designContext(),m=ctx.model;
m.nodes=[{id:'A',x:0,y:0,z:0,support:'fixed'},{id:'B',x:0,y:0,z:3}];m.members=[{id:'AB',n1:'A',n2:'B',type:'frame',matId:'concrete',secId:'rc3060'}];
m.loadCases=[{id:'D',type:'dead',name:'D'}];m.loads=[{id:'F',type:'nodal',node:'B',P:10,dir:'-x',case:'D'}];m.loadCombinations=[{id:'U',name:'U',type:'strength',factors:{D:1.4}}];m.analysisCases=[{id:'E',name:'E',kind:'static',settings:{comboId:'U',pDeltaMethod:'off'}}];
stagePracticalDesignInput(m,{type:'reinforcement-record',id:'R',name:'R',version:1,memberId:'AB',start:0,end:1,cover:0.04,barMaterialId:'steel@1',bars:[-1,1].flatMap(y=>[-1,1].map(z=>({y:y*0.2,z:z*0.08,diameter:20}))),stirrupDiameter:10,stirrupSpacing:150,stirrupLegs:2,sourceNote:'synthetic'},[]);
try{
 const run=await ctx.bridge.runElasticWorkflow({plan:ctx.bridge.planElasticWorkflow({caseIds:['E']}),requestId:'source-invalidation'});
 const inputHash=ctx.bridge.getWorkflowInputIdentity().inputHash;
 const evaluation=await ctx.call('evaluate_practical_design',{inputHash,sources:[{analysisRunId:run.steps[0].analysisRunId,comboId:'U'}]});
 const plan=await ctx.call('plan_design_candidates',{evaluationId:evaluation.evaluationId,memberId:'AB',spacings:[100,120,140],maxCandidates:3,maxMillis:10000});
 const metadata=ctx.bridge.getWorkflowAnalysisMetadata;let changed=false;
 ctx.bridge.getWorkflowAnalysisMetadata=id=>{const row=metadata(id);return changed&&row.ok?{...row,resultHash:'f'.repeat(64)}:row;};
 try{
  const start=await ctx.call('start_design_candidates',{planId:plan.planId,requestId:'source-invalid-candidates'});
  changed=true;let job;
  for(let i=0;i<500;i++){job=await ctx.call('get_design_candidates',{jobId:start.jobId});if(job.status!=='running')break;await new Promise(r=>setTimeout(r,10));}
  assert.equal(job.status,'STALE_INPUT',JSON.stringify(job));assert.equal(job.error,'DESIGN_SOURCE_CHANGED');
  assert.equal(job.candidateCount,0,'do not compute candidates after source invalidation');assert.equal(job.best,null);assert.equal(job.total,0);assert.equal(job.stale,true);
  assert.equal(ctx.bridge.getWorkflowInputIdentity().inputHash,inputHash);
  changed=false;
  const second=await ctx.call('start_design_candidates',{planId:plan.planId,requestId:'source-invalid-during-worker'});
  let observed=false;
  for(let i=0;i<500;i++){
   job=await ctx.call('get_design_candidates',{jobId:second.jobId});
   if(job.status==='running'&&job.candidateCount>0){changed=true;observed=true;}
   if(job.status!=='running')break;
   await new Promise(r=>setTimeout(r,10));
  }
  assert.equal(observed,true);assert.equal(job.status,'STALE_INPUT',JSON.stringify(job));
  assert.equal(job.candidateCount,1);assert.equal(job.best,null);assert.equal(job.total,0);assert.equal(job.error,'DESIGN_SOURCE_CHANGED');
 }finally{ctx.bridge.getWorkflowAnalysisMetadata=metadata;}
 console.log('PASS actual WebMCP candidate job terminates on same-input source invalidation before calculation');
}finally{await ctx.dispose();}
