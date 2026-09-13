import assert from 'node:assert/strict';
import {designContext} from './fixtures/p24/context.js';
import {stagePracticalDesignInput} from '../src/modeling/practicalDesignInputs.js';
const ctx=designContext(),m=ctx.model;
m.nodes=[{id:'A',x:0,y:0,z:0,support:'fixed'},{id:'B',x:0,y:0,z:3}];m.members=[{id:'AB',n1:'A',n2:'B',type:'frame',matId:'concrete',secId:'rc3060'}];
m.loadCases=[{id:'D',type:'dead',name:'D'}];m.loads=[{id:'F',type:'nodal',node:'B',P:10,dir:'-x',case:'D'}];m.loadCombinations=[{id:'U',name:'U',type:'strength',factors:{D:1.4}}];m.analysisCases=[{id:'E',name:'E',kind:'static',settings:{comboId:'U',pDeltaMethod:'off'}}];
m.nodes.push({id:'C',x:5,y:0,z:0,support:'fixed'},{id:'D',x:5,y:0,z:3});m.members.push({id:'CD',n1:'C',n2:'D',type:'frame',matId:'concrete',secId:'rc3060'});
stagePracticalDesignInput(m,{type:'reinforcement-record',id:'R',name:'R',version:1,memberId:'AB',start:0,end:1,cover:0.04,barMaterialId:'steel@1',bars:[-1,1].flatMap(y=>[-1,1].map(z=>({y:y*0.2,z:z*0.08,diameter:20}))),stirrupDiameter:10,stirrupSpacing:150,stirrupLegs:2,sourceNote:'synthetic'},[]);
try{
 assert.ok(ctx.tools.some(x=>x.name==='apply_design_candidate_and_review'));
 const run=await ctx.bridge.runElasticWorkflow({plan:ctx.bridge.planElasticWorkflow({caseIds:['E']}),requestId:'p25-auto-source'});
 const before=ctx.bridge.getWorkflowInputIdentity().inputHash;
 const evaluation=await ctx.call('evaluate_practical_design',{inputHash:before,sources:[{analysisRunId:run.steps[0].analysisRunId,comboId:'U'}]});
 const plan=await ctx.call('plan_design_candidates',{evaluationId:evaluation.evaluationId,memberId:'AB',spacings:[100],maxCandidates:1,maxMillis:10000});
 const start=await ctx.call('start_design_candidates',{planId:plan.planId,requestId:'p25-auto-candidate'});let job;
 for(let i=0;i<300;i++){job=await ctx.call('get_design_candidates',{jobId:start.jobId});if(job.status!=='running')break;await new Promise(r=>setTimeout(r,10));}
 assert.ok(job.best,JSON.stringify(job));
 const args={jobId:job.jobId,candidateId:job.best.candidateId,requestId:'p25-auto-apply'};
 if(process.env.P25_RETRY){const original=ctx.bridge.runElasticWorkflow;ctx.bridge.runElasticWorkflow=async()=>({ok:false,code:'SYNTHETIC_ANALYSIS_FAILURE'});const failed=await ctx.call('apply_design_candidate_and_review',args);assert.equal(failed.ok,false);assert.equal(failed.applied,true);assert.equal(m.designDetails.reinforcement.length,2);ctx.bridge.runElasticWorkflow=original;}
 const applied=await ctx.call('apply_design_candidate_and_review',args);
 assert.equal(applied.ok,true,JSON.stringify(applied));assert.notEqual(applied.inputIdentity.inputHash,before);
 assert.equal(applied.followUp.comparison.affectedScope.unaffectedRegressionCount,0);
 assert.ok(applied.followUp.comparison.affectedScope.unaffectedSourceRecordChangeCount>0);
 assert.ok(applied.followUp.evaluationId);assert.equal(applied.followUp.status,'completed');
 const result=await ctx.call('get_practical_design_result',{evaluationId:applied.followUp.evaluationId});
 assert.equal(result.stale,false);assert.equal(result.summary.complete,false,'unimplemented checks remain incomplete');
 const filtered=await ctx.call('get_practical_design_result',{evaluationId:applied.followUp.evaluationId,filter:{entityId:'CD',comboId:'U'},limit:1});
 assert.ok(filtered.filteredTotal>1);assert.equal(filtered.checks.length,1);assert.equal(filtered.checks[0].entityId,'CD');assert.equal(filtered.nextOffset,1);
 assert.deepEqual(filtered.summary,result.summary,'filter must never turn project summary into a partial pass');
 let offset=0,ids=[];
 do{const page=await ctx.call('get_practical_design_result',{evaluationId:applied.followUp.evaluationId,filter:{entityId:'CD',comboId:'U'},offset,limit:3});ids.push(...page.checks.map(x=>x.id));offset=page.nextOffset;}while(offset!==null);
 assert.equal(ids.length,filtered.filteredTotal);assert.equal(new Set(ids).size,ids.length);
 const empty=await ctx.call('get_practical_design_result',{evaluationId:applied.followUp.evaluationId,filter:{entityId:'absent'}});assert.deepEqual(empty.checks,[]);assert.equal(empty.filteredTotal,0);assert.equal(empty.nextOffset,null);
 const stored=(await ctx.call('get_practical_design_context',{})).evaluations.find(x=>x.evaluationId===applied.followUp.evaluationId);
 assert.deepEqual(stored.sources,applied.followUp.sources,'UI must recover the exact stored source identities');
 stored.sources[0].analysisRunId='mutated-client-copy';
 const reread=(await ctx.call('get_practical_design_context',{})).evaluations.find(x=>x.evaluationId===applied.followUp.evaluationId);
 assert.deepEqual(reread.sources,applied.followUp.sources,'source metadata is isolated from clients');
 assert.notEqual(applied.followUp.sources[0].analysisRunId,run.steps[0].analysisRunId);
 const again=await ctx.call('apply_design_candidate_and_review',args);
 assert.equal(again.followUp.evaluationId,applied.followUp.evaluationId);assert.equal(m.designDetails.reinforcement.length,2);
 console.log('PASS actual WebMCP reinforcement apply -> source reuse -> unrelated checks retain semantics -> idempotent replay');
}finally{await ctx.dispose();}
