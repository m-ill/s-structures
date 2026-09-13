import assert from 'node:assert/strict';
import {designContext} from './fixtures/p24/context.js';
const ctx=designContext(),m=ctx.model;
try{
 m.nodes=[{id:'A',x:0,y:0,z:0,support:'fixed'},{id:'B',x:3,y:0,z:0}];m.members=[{id:'AB',type:'frame',n1:'A',n2:'B',matId:'concrete',secId:'rc3060'}];m.loadCases=[{id:'D',name:'D',type:'dead'}];m.loads=[{id:'F',type:'nodal',node:'B',dir:'-z',P:1,case:'D'}];m.loadCombinations=[{id:'U',name:'U',type:'strength',factors:{D:1.4}}];m.analysisCases=[{id:'E',name:'E',kind:'static',status:'not-run',settings:{comboId:'U',pDeltaMethod:'off'}}];
 const base={type:'reinforcement-record',id:'R1',name:'R1',version:1,memberId:'AB',start:0,end:.5,cover:.04,barMaterialId:'steel@1',bars:[-1,1].flatMap(y=>[-1,1].map(z=>({y:y*.2,z:z*.06,diameter:20}))),stirrupDiameter:10,stirrupLegs:2,stirrupSpacing:100,sourceNote:'synthetic'};
 const preview=await ctx.call('preview_design_changes',{requestId:'regional-candidate-input',inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,commands:[base,{...base,id:'R2',name:'R2',start:.5,end:1,cover:.05,stirrupSpacing:150}]});assert.equal((await ctx.call('apply_design_changes',{requestId:'regional-candidate-apply',handle:preview.handle})).ok,true);
 const run=await ctx.bridge.runElasticWorkflow({plan:ctx.bridge.planElasticWorkflow({caseIds:['E']}),requestId:'regional-candidate-source'});assert.equal(run.ok,true);
 const evaluation=await ctx.call('evaluate_practical_design',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,sources:[{comboId:'U',analysisRunId:run.steps[0].analysisRunId}]});
 const plan=await ctx.call('plan_design_candidates',{evaluationId:evaluation.evaluationId,memberId:'AB',regionConstraints:[{detailId:'R1',spacings:[80],layersPerFace:[2],layerClearSpacings:[.04]},{detailId:'R2',spacings:[120]}],sectionCandidates:[{B:400,H:700}],maxCandidates:1,maxMillis:10000});assert.equal(plan.regionCount,2);
 const start=await ctx.call('start_design_candidates',{planId:plan.planId,requestId:'regional-candidate-job'});let job;
 for(let i=0;i<500;i++){job=await ctx.call('get_design_candidates',{jobId:start.jobId});if(job.status!=='running')break;await new Promise(r=>setTimeout(r,10));}
 assert.ok(job.best,JSON.stringify(job));assert.equal(job.best.changes.regionCount,2);
 let detailOffset=0,detailText='',detailHash;do{const part=await ctx.call('get_design_candidate_detail',{jobId:job.jobId,candidateId:job.best.candidateId,offset:detailOffset,limit:79});assert.ok(!detailHash||detailHash===part.detailHash);detailHash=part.detailHash;detailText+=part.chunk;detailOffset=part.nextOffset;}while(detailOffset!==null);assert.equal(JSON.parse(detailText).changes.regionEdits.R1.layersPerFace,2);
 const receipt=await ctx.call('apply_design_candidate_and_review',{jobId:job.jobId,candidateId:job.best.candidateId,requestId:'regional-candidate-commit'});assert.equal(receipt.ok,true,JSON.stringify(receipt));
 const records=(await ctx.call('get_design_records',{channel:'reinforcement'})).rows;
 for(const id of ['R1','R2'])assert.ok(records.some(r=>r.id===id&&r.version===2));
 const latest=id=>records.find(r=>r.id===id&&r.version===2);
 assert.equal(latest('R1').bars.length,8);assert.equal(latest('R2').bars.length,4);assert.equal(latest('R1').stirrups.spacing,.08);assert.equal(latest('R2').stirrups.spacing,.12);assert.equal(latest('R1').cover,.04);assert.equal(latest('R2').cover,.05);
 assert.notEqual(latest('R1').bars[0].y,base.bars[0].y);assert.notEqual(latest('R1').bars[0].y,latest('R2').bars[0].y);
 assert.equal(receipt.followUp.status,'completed');
 const {memberCandidateCommands}=await import('../src/design/rc/memberCandidateCommands.js');
 const {practicalCommandFromRecord}=await import('../src/modeling/practicalInputContract.js');
 const resized=memberCandidateCommands(m,['R1','R2'].map(id=>practicalCommandFromRecord('reinforcement-record',latest(id))),{section:{B:500,H:800}});
 assert.equal(resized.commands[0].bars.length,8);assert.equal(resized.commands[1].bars.length,4,'omitted layer constraints preserve existing layer topology on later resize');
 console.log('PASS actual multi-region candidate section change, per-region defaults, atomic apply and fresh review');
}finally{await ctx.dispose();}
