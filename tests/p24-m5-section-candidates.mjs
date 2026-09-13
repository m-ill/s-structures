import assert from 'node:assert/strict';
import {designContext} from './fixtures/p24/context.js';
import {stagePracticalDesignInput} from '../src/modeling/practicalDesignInputs.js';
const ctx=designContext(),m=ctx.model;
m.nodes=[{id:'A',x:0,y:0,z:0,support:'fixed'},{id:'B',x:0,y:0,z:3}];
m.members=[{id:'AB',n1:'A',n2:'B',type:'frame',matId:'concrete',secId:'rc3060'}];
m.loadCases=[{id:'D',type:'dead',name:'D'}];m.loads=[{id:'F',type:'nodal',node:'B',P:10,dir:'-x',case:'D'}];
m.loadCombinations=[{id:'U',name:'U',type:'strength',factors:{D:1.4}}];
m.analysisCases=[{id:'E',name:'E',kind:'static',settings:{comboId:'U',pDeltaMethod:process.env.P24_PDELTA_METHOD||'off'}}];
stagePracticalDesignInput(m,{type:'reinforcement-record',id:'R',name:'R',version:1,memberId:'AB',start:0,end:1,cover:0.04,barMaterialId:'steel@1',bars:[{y:0.2,z:-0.08,diameter:20},{y:0.2,z:0.08,diameter:20},{y:-0.2,z:-0.08,diameter:20},{y:-0.2,z:0.08,diameter:20}],stirrupDiameter:10,stirrupSpacing:150,stirrupLegs:2,sourceNote:'synthetic',strengthStandard:'KDS-142020-2022',reinforcementForm:'single-deformed'},[]);
try {
 const plan=ctx.bridge.planElasticWorkflow({caseIds:['E']});
 const run=await ctx.bridge.runElasticWorkflow({plan,requestId:'section-source'});assert.equal(run.ok,true);
 const inputHash=ctx.bridge.getWorkflowInputIdentity().inputHash;
 const evaluated=await ctx.call('evaluate_practical_design',{inputHash,sources:[{analysisRunId:run.steps[0].analysisRunId,comboId:'U'}]});
 const before=JSON.stringify(m);
 const cp=await ctx.call('plan_design_candidates',{evaluationId:evaluated.evaluationId,memberId:'AB',spacings:[150],sectionCandidates:[{B:400,H:700}],maxCandidates:1,maxMillis:10000});
 const started=await ctx.call('start_design_candidates',{planId:cp.planId,requestId:'section-job'});
 let job;for(let i=0;i<100;i++){job=await ctx.call('get_design_candidates',{jobId:started.jobId});if(job.status!=='running')break;await new Promise(r=>setTimeout(r,10));}
 assert.equal(job.status,'NEEDS_INPUT',JSON.stringify(job));assert.equal(job.best.impact,'REANALYSIS_REQUIRED');
 assert.equal(job.best.analysisProof.length,1);assert.equal(job.best.analysisProof[0].isolated,true);
 assert.equal(job.best.analysisProof[0].method,process.env.P24_PDELTA_METHOD||'off');
 assert.notEqual(job.best.analysisProof[0].candidateInputHash,inputHash);
 assert.equal(JSON.stringify(m),before,'isolated candidate solve does not modify active model');
 const basis=await ctx.call('get_design_candidate_basis',{jobId:job.jobId,candidateId:job.best.candidateId});
 assert.ok(basis.rows.some(x=>x.applied.some(r=>r.code==='KDS 14 20 20')));
 const applied=await ctx.call('apply_design_candidate',{jobId:job.jobId,candidateId:job.best.candidateId,requestId:'section-apply'});
 assert.equal(applied.ok,true);assert.equal(applied.requiredNext,'new-analysis-and-design-evaluation');
 assert.notEqual(m.members[0].secId,'rc3060');assert.equal(m.designDetails.reinforcement.length,2);
 assert.equal((await ctx.call('get_practical_design_result',{evaluationId:evaluated.evaluationId})).stale,true);
 console.log('PASS actual isolated section candidate CPU/Direct reanalysis, KDS trace, atomic apply and stale source');
}finally{await ctx.dispose();}
