import {readJsonRecord} from '../src/ui/jsonRecordReader.js';
import {validateModel} from '../src/core/validation.js';
import assert from 'node:assert/strict';
import {designContext} from './fixtures/p24/context.js';
const ctx=designContext(),m=ctx.model;
try{
 m.nodes=[{id:'A',x:0,y:0,z:0,support:'fixed'},{id:'B',x:3,y:0,z:0}];
 m.members=[{id:'AB',n1:'A',n2:'B',type:'frame',matId:'concrete',secId:'rc3060'}];
 m.loadCases=[{id:'D',type:'dead',name:'D'}];m.loads=[{id:'F',type:'nodal',node:'B',P:600,dir:'-z',case:'D'}];
 m.loadCombinations=[{id:'U',name:'U',type:'strength',factors:{D:1}}];
 m.analysisCases=[{id:'E',name:'E',kind:'static',status:'not-run',settings:{comboId:'U',pDeltaMethod:'off'}}];m.analysisSettings.selfWeight=false;
 const cmd={type:'reinforcement-record',id:'R',name:'R',version:1,memberId:'AB',start:0,end:1,cover:.04,barMaterialId:'steel@1',bars:[-1,1].flatMap(a=>[-1,1].map(b=>({y:a*.2,z:b*.06,diameter:32}))),stirrupDiameter:32,stirrupSpacing:50,stirrupLegs:2,sourceNote:'synthetic ceiling test; not construction detailing',strengthStandard:'KDS-142020-2022',reinforcementForm:'single-deformed',shearStandard:'KDS-142022-2022',shearScope:'ordinary-prismatic-no-opening',concreteWeight:'normal',stirrupForm:'closed-rectangular-two-leg'};
 assert.equal(validateModel(m).ok,true,JSON.stringify(validateModel(m).errors));
 const preview=await ctx.call('preview_design_changes',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,requestId:'shear-preview',commands:[cmd]});
 const appliedInput=await ctx.call('apply_design_changes',{handle:preview.handle,requestId:'shear-input'});assert.equal(appliedInput.ok,true);
 const run=await ctx.bridge.runElasticWorkflow({plan:ctx.bridge.planElasticWorkflow({caseIds:['E']}),requestId:'shear-baseline'});assert.equal(run.ok,true);
 const review=await ctx.call('evaluate_practical_design',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,sources:[{analysisRunId:run.steps[0].analysisRunId,comboId:'U'}]});
 const before=ctx.bridge.getPracticalDesignSnapshot(review.evaluationId).checks.find(c=>c.checkId==='rc-shear-y');
 assert.equal(before.status,'NG');assert.equal(before.spacingRepair.reason,'SECTION_SHEAR_CAPACITY_EXCEEDED');
 const plan=await ctx.call('plan_design_candidates',{evaluationId:review.evaluationId,memberId:'AB',maxCandidates:1,maxMillis:10000});
 assert.equal(plan.generation.sectionChangeRequired,true);assert.ok(plan.generation.sectionCandidates.every(Boolean));assert.ok(plan.generation.basisCheckIds.includes(before.id));
 const jobStart=await ctx.call('start_design_candidates',{planId:plan.planId,requestId:'shear-search'});
 let job;for(let i=0;i<700;i++){job=await ctx.call('get_design_candidates',{jobId:jobStart.jobId});if(job.status!=='running')break;await new Promise(r=>setTimeout(r,10));}
 assert.ok(job.best,JSON.stringify(job));assert.equal(job.best.analysisProofCount??job.best.analysisProof?.length,1);
 const applied=await ctx.call('apply_design_candidate_and_review',{jobId:job.jobId,candidateId:job.best.candidateId,requestId:'shear-apply'});
 assert.equal(applied.ok,true);assert.equal(applied.followUp.status,'completed');
 const after=ctx.bridge.getPracticalDesignSnapshot(applied.followUp.evaluationId).checks.find(c=>c.checkId==='rc-shear-y');
 assert.equal(after.status,'OK',JSON.stringify(after));assert.ok(after.capacity>before.capacity);assert.ok(after.codeReferences.length);
 assert.notEqual(applied.followUp.sources[0].analysisRunId,run.steps[0].analysisRunId);
 const nextQuery=applied.followUp.remainingRepairs.detailQuery;
 assert.equal(nextQuery.tool,'get_practical_design_check');assert.equal(nextQuery.evaluationId,applied.followUp.evaluationId);
 const next=await readJsonRecord(args=>ctx.call(nextQuery.tool,{evaluationId:nextQuery.evaluationId,checkId:nextQuery.checkId,...args}));
 assert.equal(next.hash,nextQuery.checkId);assert.equal(next.value.inputHash,ctx.bridge.getWorkflowInputIdentity().inputHash);
 const memberNext=next.value.targets.find(t=>t.entityId==='AB');assert.ok(memberNext);assert.ok(!memberNext.checkKinds.includes('rc-shear-y'));assert.ok(memberNext.checkKinds.includes('rc-section-strength'));
 const continuation=await ctx.call(memberNext.planQuery.tool,memberNext.planQuery.arguments);assert.equal(continuation.ok,true);
 const again=await ctx.call('get_practical_design_result',{evaluationId:applied.followUp.evaluationId});assert.deepEqual(again.remainingRepairs,applied.followUp.remainingRepairs);
 assert.equal(m.loads[0].P,600);assert.equal(applied.followUp.summary.complete,false);
 console.log('PASS actual WebMCP shear ceiling NG -> automatic section-first candidate -> new analysis -> shear OK with KDS basis; full design remains incomplete');
}finally{await ctx.dispose();}
