import assert from 'node:assert/strict';
import {designContext} from './fixtures/p24/context.js';
import {stagePracticalDesignInput} from '../src/modeling/practicalDesignInputs.js';
const ctx=designContext(),m=ctx.model;
m.nodes=[{id:'A',x:0,y:0,z:0,support:'fixed'},{id:'B',x:0,y:0,z:3}];m.members=[{id:'AB',n1:'A',n2:'B',type:'frame',matId:'concrete',secId:'rc3060'}];
m.loadCases=[{id:'D',type:'dead',name:'D'}];m.loads=[{id:'F',type:'nodal',node:'B',P:10,dir:'-x',case:'D'}];m.loadCombinations=[{id:'U',name:'U',type:'strength',factors:{D:1.4}}];m.analysisCases=[{id:'E',name:'E',kind:'static',settings:{comboId:'U',pDeltaMethod:'off'}}];
stagePracticalDesignInput(m,{type:'reinforcement-record',id:'R',name:'R',version:1,memberId:'AB',start:0,end:1,cover:0.04,barMaterialId:'steel@1',bars:[-1,1].flatMap(y=>[-1,1].map(z=>({y:y*0.2,z:z*0.08,diameter:20}))),stirrupDiameter:10,stirrupSpacing:150,stirrupLegs:2,sourceNote:'synthetic'},[]);
try{
 assert.ok(ctx.tools.some(x=>x.name==='apply_design_candidate_and_review'));
 const run=await ctx.bridge.runElasticWorkflow({plan:ctx.bridge.planElasticWorkflow({caseIds:['E']}),requestId:'p25-auto-source'});
 const before=ctx.bridge.getWorkflowInputIdentity().inputHash;
 const evaluation=await ctx.call('evaluate_practical_design',{inputHash:before,sources:[{analysisRunId:run.steps[0].analysisRunId,comboId:'U'}]});
 const plan=await ctx.call('plan_design_candidates',{evaluationId:evaluation.evaluationId,memberId:'AB',spacings:[100],...(process.env.P25_REUSE?'':{sectionCandidates:[{B:400,H:700}]}),maxCandidates:1,maxMillis:10000});
 const start=await ctx.call('start_design_candidates',{planId:plan.planId,requestId:'p25-auto-candidate'});let job;
 for(let i=0;i<300;i++){job=await ctx.call('get_design_candidates',{jobId:start.jobId});if(job.status!=='running')break;await new Promise(r=>setTimeout(r,10));}
 assert.ok(job.best,JSON.stringify(job));
 const args={jobId:job.jobId,candidateId:job.best.candidateId,requestId:'p25-auto-apply'};
 const original=ctx.bridge.runElasticWorkflow;
 ctx.bridge.runElasticWorkflow=async()=>({ok:false,code:'SYNTHETIC_ANALYSIS_FAILURE'});
 const failed=await ctx.call('apply_design_candidate_and_review',args);
 ctx.bridge.runElasticWorkflow=original;
 assert.equal(failed.ok,false);assert.equal(failed.applied,true);assert.equal(m.designDetails.reinforcement.length,2);
 const receipt=await ctx.call('undo_design_input',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,expectedRequestId:args.requestId});
 assert.equal(receipt.ok,true,JSON.stringify(receipt));assert.equal(receipt.undoneRequestId,args.requestId);
 assert.equal(m.designDetails.reinforcement.length,1);assert.equal(m.members[0].secId,'rc3060');
 const restored=structuredClone(m);
 const retry=await ctx.call('apply_design_candidate_and_review',args);
 assert.equal(retry.ok,false);assert.deepEqual(m,restored,'retry after explicit undo cannot resurrect the candidate');
 console.log('PASS actual failed candidate review -> targeted undo -> retry preserves restored input');
}finally{await ctx.dispose();}
