import assert from 'node:assert/strict';
import {designContext} from './fixtures/p24/context.js';
const ctx=designContext(),m=ctx.model;
try{
 m.nodes=[{id:'A',x:0,y:0,z:0,support:'fixed'},{id:'B',x:0,y:0,z:3}];m.members=[{id:'AB',type:'frame',n1:'A',n2:'B',matId:'concrete',secId:'rc3060'}];m.loadCases=[{id:'D',type:'dead',name:'D'}];m.loads=[{id:'F',type:'nodal',node:'B',P:100,dir:'-z',case:'D'}];m.loadCombinations=[{id:'U',type:'strength',name:'U',factors:{D:1.4}}];m.analysisCases=[{id:'E',name:'E',kind:'static',status:'not-run',settings:{comboId:'U',pDeltaMethod:'off'}}];
 const ground={type:'ground-record',id:'G',name:'synthetic',version:1,sourceNote:'test',sourceReference:'fixture',basisStatus:'specified',allowableBearing:150,bearingBasis:'gross'};
 const columnBars={type:'reinforcement-record',id:'R',name:'continuous column bars',version:1,sourceNote:'synthetic',memberId:'AB',start:0,end:1,cover:.04,barMaterialId:'steel@1',reinforcementForm:'single-deformed',barCoating:'uncoated',lapRequired:false,bars:[-1,1].flatMap(y=>[-1,1].map(z=>({y:y*.2,z:z*.08,diameter:20})))};
 const footing={aggregateMaxSize:.02,columnMemberId:'AB',columnEmbedmentLength:.3,columnDevelopmentAbove:.3,barShape:'straight',shrinkageRestraint:'ordinary-not-severely-restrained',type:'foundation-record',id:'F',name:'synthetic',version:1,sourceNote:'test',nodeId:'A',foundationType:'isolated',B:2,L:2,thickness:.18,cover:.05,materialId:'concrete@1',groundId:'G@1',barMaterialId:'steel@1',bottomDiameterB:16,bottomDiameterL:16,bottomSpacingB:500,bottomSpacingL:500,topDiameterB:16,topDiameterL:16,topSpacingB:150,topSpacingL:150,footingWeightCaseId:'D',reactionBasis:'superstructure-only',columnWidth:.6,columnDepth:.3,flexureStandard:'KDS-142020-2022',concreteWeight:'normal',barCoating:'uncoated',punchingStandard:'KDS-142022-2022',punchingMomentMethod:'conservative-perimeter-shear',punchingPerimeterScope:'interior-solid-no-openings'};

 const preview=await ctx.call('preview_design_changes',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,requestId:'input-preview',commands:[ground,footing]});assert.equal((await ctx.call('apply_design_changes',{handle:preview.handle,requestId:'input'})).ok,true);
 const run=await ctx.bridge.runElasticWorkflow({plan:ctx.bridge.planElasticWorkflow({caseIds:['E']}),requestId:'source'});assert.equal(run.ok,true);
 const evaluation=await ctx.call('evaluate_practical_design',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,sources:[{analysisRunId:run.steps[0].analysisRunId,comboId:'U'}]});
 const before=ctx.bridge.getPracticalDesignSnapshot(evaluation.evaluationId),flex=before.checks.find(c=>c.checkId==='foundation-flexure');assert.equal(before.checks.find(c=>c.checkId==='foundation-depth').status,'NG');
 const minimumBefore=before.checks.find(c=>c.checkId==='foundation-reinforcement');assert.ok(minimumBefore.axisChecks.every(r=>r.criteria.length===2&&r.areaBasis.units.capPerUnitWidth==='m2/m'));
 const plan=await ctx.call('plan_design_candidates',{evaluationId:evaluation.evaluationId,foundationId:'F',maxCandidates:3,maxMillis:10000});assert.equal(plan.generation.ok,true);
 const started=await ctx.call('start_design_candidates',{planId:plan.planId,requestId:'search'});let job;
 for(let i=0;i<500;i++){job=await ctx.call('get_design_candidates',{jobId:started.jobId});if(job.status!=='running')break;await new Promise(r=>setTimeout(r,10));}
 assert.ok(job.best,JSON.stringify(job));
 const applied=await ctx.call('apply_design_candidate_and_review',{jobId:started.jobId,candidateId:job.best.candidateId,requestId:'repair'});assert.equal(applied.ok,true,JSON.stringify(applied));
 const after=ctx.bridge.getPracticalDesignSnapshot(applied.followUp.evaluationId),repaired=after.checks.find(c=>c.checkId==='foundation-flexure');
 assert.equal(repaired.status,'OK',JSON.stringify({repaired,plan:plan.generation}));assert.ok(repaired.codeReferences.length>0);assert.equal(after.summary.complete,false);
 const minimumAfter=after.checks.find(c=>c.checkId==='foundation-reinforcement');assert.ok(minimumAfter.axisChecks.every(r=>r.criteria.every(c=>c.status==='OK'&&c.codeReferences.length>0)));
 const stored=(await ctx.call('get_design_records',{channel:'foundations',id:'F'})).rows[0];assert.equal(stored.aggregateMaxSize,.02);assert.equal(after.checks.find(c=>c.checkId==='foundation-spacing').status,'OK');assert.ok(stored.thickness>.18);assert.equal(after.checks.find(c=>c.checkId==='foundation-depth').status,'OK');assert.equal(stored.reinforcement.bottomB.diameter,.016);assert.equal(stored.reinforcement.bottomL.diameter,.016);
 console.log('PASS actual WebMCP bottom-depth NG -> thickness and reinforcement -> depth and strength OK; other incompleteness preserved');
}finally{await ctx.dispose();}
