import assert from 'node:assert/strict';
import {stagePracticalDesignInput} from '../src/modeling/practicalDesignInputs.js';
import {designContext} from './fixtures/p24/context.js';
const data=new Map(),storage={get:async k=>structuredClone(data.get(k)),put:async(k,v)=>data.set(k,structuredClone(v)),delete:async k=>data.delete(k)};
const options={SStructuresCheckpointStorage:storage,SStructuresBuildIdentity:{version:'synthetic-shear-provenance'}};
const ctx=designContext(options),m=ctx.model;
try{
 m.nodes=[{id:'A',x:0,y:0,z:0,support:'fixed'},{id:'B',x:3,y:0,z:0}];m.members=[{id:'AB',type:'frame',n1:'A',n2:'B',matId:'concrete',secId:'C@1'}];
 m.loadCases=[{id:'D',type:'dead',name:'D'}];m.loads=[{id:'F',type:'nodal',node:'B',dir:'-z',P:35,case:'D'}];m.loadCombinations=[{id:'U',type:'strength',name:'U',factors:{D:1.4}}];m.analysisCases=[{id:'E',name:'E',kind:'static',status:'not-run',settings:{comboId:'U',pDeltaMethod:'off'}}];
 const c=.05+.01/Math.sqrt(2),bars=[-1,1].flatMap(y=>[-1,1].map(z=>({y:y*.18,z:z*.08,diameter:20})));
 const detail={type:'reinforcement-record',id:'R',name:'synthetic anchor column',version:1,sourceNote:'synthetic',memberId:'AB',start:0,end:1,cover:.04,barMaterialId:'steel@1',bars,stirrupDiameter:10,stirrupSpacing:400,stirrupLegs:2,strengthStandard:'KDS-142020-2022',concreteWeight:'normal',shearStandard:'KDS-142022-2022',shearScope:'ordinary-prismatic-no-opening',memberRole:'flexural-member',reinforcementForm:'single-deformed',stirrupForm:'closed-rectangular-two-leg',confinementStandard:'KDS-142050-2022',confinementSystem:'ordinary-flexural-member',tieClosure:'standard-135',tieClosureCorner:'+y+z',tieClosureSeparation:.03,tieHookTail:.06,tieBendInsideRadius:.02,tieFirstStart:.18,tieFirstEnd:.18,topAnchorBolts:false,anchorBoltTieEnd:'end'};
 stagePracticalDesignInput(m,{type:'section-record',id:'C',name:'240 square',version:1,shape:'RECT',dimensionUnit:'mm',B:300,H:500,sourceNote:'synthetic'},[]);
 const preview=await ctx.call('preview_design_changes',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,requestId:'anchor-preview',commands:[{...detail,end:.5},{...detail,id:'R2',start:.5}]});
 assert.equal((await ctx.call('apply_design_changes',{handle:preview.handle,requestId:'anchor-apply'})).ok,true);
 const run=await ctx.bridge.runElasticWorkflow({plan:ctx.bridge.planElasticWorkflow({caseIds:['E']}),requestId:'anchor-run'});
 const result=await ctx.call('evaluate_practical_design',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,sources:[{analysisRunId:run.steps[0].analysisRunId,comboId:'U'}]});

 const before=ctx.bridge.getPracticalDesignSnapshot(result.evaluationId).checks.find(c=>c.checkId==='rc-section-strength');
 assert.equal(before.status,'NG',JSON.stringify(before));assert.equal(before.strengthRepairRegions?.length,2);assert.ok(before.strengthRepairRegions.every(r=>r.needsRepair));
 const plan=await ctx.call('plan_design_candidates',{evaluationId:result.evaluationId,memberId:'AB',maxCandidates:1,maxMillis:10000});
 assert.equal(plan.generation.ok,true,JSON.stringify(plan));assert.equal(plan.regionCandidateOrder,'diagonal-first');assert.equal(plan.generation.regionConstraints.filter(r=>r.perimeterYCounts).length,2);assert.ok(plan.generation.regionConstraints.some(r=>r.perimeterYCounts?.includes(3)),JSON.stringify(plan));
 const started=await ctx.call('start_design_candidates',{planId:plan.planId,requestId:'bar-count-start'});let job;
 for(let i=0;i<500;i++){job=await ctx.call('get_design_candidates',{jobId:started.jobId});if(job.status!=='running')break;await new Promise(r=>setTimeout(r,10));}
 assert.ok(job.best,JSON.stringify(job));
 let applied=await ctx.call('apply_design_candidate_and_review',{jobId:started.jobId,candidateId:job.best.candidateId,requestId:'bar-count-apply'});
 assert.equal(applied.followUp.status,'completed',JSON.stringify(applied));

 const firstReview=ctx.bridge.getPracticalDesignSnapshot(applied.followUp.evaluationId);
 assert.equal(firstReview.checks.find(c=>c.checkId==='rc-section-strength').status,'NG');
 const again=await ctx.call('plan_design_candidates',{evaluationId:applied.followUp.evaluationId,memberId:'AB',maxCandidates:3,maxMillis:10000});
 assert.equal(again.generation.ok,true,JSON.stringify(again));assert.ok(again.generation.regionConstraints.some(r=>r.perimeterYCounts?.includes(4)));
 const continued=await ctx.call('start_design_candidates',{planId:again.planId,requestId:'bar-count-continue'});
 for(let i=0;i<700;i++){job=await ctx.call('get_design_candidates',{jobId:continued.jobId});if(job.status!=='running')break;await new Promise(r=>setTimeout(r,10));}
 assert.ok(job.best,JSON.stringify(job));
 applied=await ctx.call('apply_design_candidate_and_review',{jobId:continued.jobId,candidateId:job.best.candidateId,requestId:'bar-count-continue-apply'});
 assert.equal(applied.followUp.status,'completed',JSON.stringify(applied));
 const after=ctx.bridge.getPracticalDesignSnapshot(applied.followUp.evaluationId).checks.find(c=>c.checkId==='rc-section-strength');
 assert.equal(after.status,'OK',JSON.stringify(after));assert.ok(after.codeReferences.length);
 assert.equal(applied.followUp.summary.complete,false);
 const records=await ctx.call('get_design_records',{channel:'reinforcement',id:'R'});
 const latest=records.rows.at(-1);assert.ok(latest.bars.length>4);assert.ok(latest.bars.every(b=>b.diameter===.02));assert.equal(latest.crossTieBarPairs.length,latest.bars.length/2-2);assert.equal(latest.crossTiePlaneOffsets.length,latest.crossTieBarPairs.length);
 console.log('PASS actual WebMCP strength NG -> generated bar-count candidate -> reanalysis/review');
}finally{await ctx.dispose();}
