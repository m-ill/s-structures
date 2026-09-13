import assert from 'node:assert/strict';
import {kdsBracedColumnMagnification,prepareProvidedStability} from '../src/design/rc/kdsStability.js';
const input={B:.4,H:.5,E:30000,L:3,N:-1000,My:10,Mz:-20};
const r=kdsBracedColumnMagnification(input);
const pc=Math.PI**2*.2*30000*1000*(.5*.4**3/12)/9;
assert.equal(r.status,'OK');assert.equal(r.spliceLayoutIndependent,true);assert.equal(r.stiffnessBasis,'0.2 Ec Ig; no reinforcement stiffness term');
assert.ok(Math.abs(r.axes.My.Pc-pc)<1e-8);
assert.ok(Math.abs(r.axes.My.delta-1/(1-1000/(.75*pc)))<1e-10);
assert.ok(r.demand.My>=27*r.axes.My.delta);
assert.ok(r.demand.Mz<=-30*r.axes.Mz.delta);
assert.equal(kdsBracedColumnMagnification({...input,N:-1e9}).status,'NG');
assert.equal(kdsBracedColumnMagnification({...input,N:0}).status,'N_A');
assert.equal(kdsBracedColumnMagnification({...input,E:NaN}).status,'NOT_CHECKED');
assert.ok(r.codeReferences[0].clause.includes('4.4.6'));
console.log('PASS braced column magnifier, signed minimum eccentricity, Euler limit and invalid inputs');

const tuples=[{N:-100,My:0,Mz:0,x:0}],details=[{start:0,end:1,stabilityStandard:'KDS-142020-2022',stabilitySystem:'braced-column',stabilityClassificationReference:'fixture'}];
assert.equal(prepareProvidedStability({}, {}, details,tuples,'direct').check.reason,'DIRECT_LOCAL_STABILITY_SEPARATION_REQUIRED');
assert.equal(prepareProvidedStability({}, {}, details,tuples,undefined).check.reason,'FIRST_ORDER_ANALYSIS_PROVENANCE_REQUIRED');
assert.equal(prepareProvidedStability({}, {}, details,[...tuples,{...tuples[0],N:-50}], 'off').check.reason,'VARIABLE_AXIAL_COLUMN_STABILITY_REQUIRED');

// KDS 14 20 20 4.4.2(2), independent constant-section scalar oracle.
const square={B:.4,H:.4,E:30000,L:3,My:100,Mz:100};
const squarePc=Math.PI**2*(.2*30000*1000*(.4**4/12))/9;
const tooLarge=kdsBracedColumnMagnification({...square,N:-.75*squarePc*.3});
assert.equal(tooLarge.status,'NG');assert.equal(tooLarge.reason,'COLUMN_SECOND_ORDER_AMPLIFICATION_LIMIT_EXCEEDED');
assert.ok(Math.abs(tooLarge.amplificationRatio-(1/.7)/1.4)<1e-12);
assert.ok(tooLarge.axialStabilityRatio<1);assert.equal(tooLarge.ratio,tooLarge.amplificationRatio);
const atLimit=kdsBracedColumnMagnification({...square,N:-.75*squarePc*(1-1/1.4)});
assert.equal(atLimit.status,'OK');assert.ok(Math.abs(atLimit.amplificationRatio-1)<1e-12);
assert.equal(kdsBracedColumnMagnification({...square,N:-.75*squarePc*(1-1/1.40001)}).status,'NG');
assert.ok(tooLarge.codeReferences.some(r=>r.clause.includes('4.4.2(2)')));
console.log('PASS finite positive Euler denominator does not bypass second-order amplification ceiling');

const {designContext}=await import('./fixtures/p24/context.js');
const {resolveMaterialRecord}=await import('../src/materials/registry.js');
const {readJsonRecord}=await import('../src/ui/jsonRecordReader.js');
const ctx=designContext();
try{
 Object.assign(ctx.model,{nodes:[{id:'A',x:0,y:0,z:0,support:'fixed'},{id:'B',x:3,y:0,z:0}],members:[{id:'AB',type:'frame',n1:'A',n2:'B',matId:'concrete',secId:'rc3060'}],loadCases:[{id:'D',name:'D',type:'dead'}],loadCombinations:[{id:'U',name:'U',type:'strength',factors:{D:1}}],analysisCases:[{id:'E',name:'E',kind:'static',status:'not-run',settings:{comboId:'U',pDeltaMethod:'off'}}]});
 ctx.model.analysisSettings.selfWeight=false;
 const ec=resolveMaterialRecord(ctx.model,'concrete').elastic.E;
 const weakPc=Math.PI**2*.2*ec*1000*(.6*.3**3/12)/9;
 ctx.model.loads=[{id:'P',type:'nodal',node:'B',dir:'-x',P:.75*weakPc*.3,case:'D'}];
 const command={type:'reinforcement-record',id:'R',name:'synthetic',version:1,memberId:'AB',start:0,end:1,cover:.04,barMaterialId:'steel@1',bars:[-1,1].flatMap(y=>[-1,1].map(z=>({y:y*.2,z:z*.08,diameter:20}))),stirrupDiameter:10,stirrupLegs:2,stirrupSpacing:150,reinforcementForm:'single-deformed',shearStandard:'KDS-142022-2022',shearScope:'ordinary-prismatic-no-opening',stirrupForm:'closed-rectangular-two-leg',sourceNote:'synthetic bound check; bracing classification is not independently qualified',strengthStandard:'KDS-142020-2022',stabilityStandard:'KDS-142020-2022',stabilitySystem:'braced-column',stabilityClassificationReference:'synthetic classification',concreteWeight:'normal'};
 const preview=await ctx.call('preview_design_changes',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,requestId:'column-preview',commands:[command]});assert.equal(preview.ok,true,JSON.stringify(preview));
 assert.equal((await ctx.call('apply_design_changes',{handle:preview.handle,requestId:'column-apply'})).ok,true);
 const run=await ctx.bridge.runElasticWorkflow({plan:ctx.bridge.planElasticWorkflow({caseIds:['E']}),requestId:'column-analysis'});assert.equal(run.ok,true,JSON.stringify(run));
 const evaluated=await ctx.call('evaluate_practical_design',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,sources:[{analysisRunId:run.steps[0].analysisRunId,comboId:'U'}]});
 const snapshot=ctx.bridge.getPracticalDesignSnapshot(evaluated.evaluationId),check=snapshot.checks.find(c=>c.checkId==='rc-stability');
 assert.equal(check.status,'NG',JSON.stringify(check));assert.equal(check.reason,'COLUMN_SECOND_ORDER_AMPLIFICATION_LIMIT_EXCEEDED');
 assert.ok(check.ratio>1);assert.ok(check.axialStabilityRatio<1);assert.equal(snapshot.summary.complete,false);
 const detailed=await readJsonRecord(args=>ctx.call('get_practical_design_check',{evaluationId:evaluated.evaluationId,checkId:check.id,...args}));
 assert.equal(detailed.value.amplificationLimit,1.4);assert.ok(detailed.value.codeReferences.some(r=>r.clause.includes('4.4.2(2)')));

 // Splitting reinforcement must not change the gross-concrete stiffness oracle.
 const split=[{...command,version:2,end:.5},{...command,id:'R2',start:.5,bars:command.bars.map(b=>({...b,diameter:22}))}];
 const staged=await ctx.call('preview_design_changes',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,requestId:'split-preview',commands:split});
 assert.equal((await ctx.call('apply_design_changes',{handle:staged.handle,requestId:'split-apply'})).ok,true);
 const rerun=await ctx.bridge.runElasticWorkflow({plan:ctx.bridge.planElasticWorkflow({caseIds:['E']}),requestId:'split-analysis'});assert.equal(rerun.ok,true);
 const reviewed=await ctx.call('evaluate_practical_design',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,sources:[{analysisRunId:rerun.steps[0].analysisRunId,comboId:'U'}]});
 const splitCheck=ctx.bridge.getPracticalDesignSnapshot(reviewed.evaluationId).checks.find(c=>c.checkId==='rc-stability');
 assert.equal(splitCheck.status,'NG');assert.equal(splitCheck.reason,check.reason);assert.equal(splitCheck.ratio,check.ratio);
 assert.deepEqual(splitCheck.detailSources.map(d=>d.id),['R','R2']);
 const plan=await ctx.call('plan_design_candidates',{evaluationId:reviewed.evaluationId,memberId:'AB',maxCandidates:1,maxMillis:10000});
 assert.equal(plan.generation.ok,true);assert.ok(plan.generation.sectionCandidates.length);
 assert.ok(plan.generation.basisCheckIds.includes(splitCheck.id));
 const started=await ctx.call('start_design_candidates',{planId:plan.planId,requestId:'stability-candidate'});
 let job;for(let i=0;i<400;i++){job=await ctx.call('get_design_candidates',{jobId:started.jobId});if(job.status!=='running')break;await new Promise(r=>setTimeout(r,10));}
 assert.ok(job.best,JSON.stringify(job));
 const records=ctx.model.designDetails.reinforcement.filter(d=>d.id==='R2'||d.id==='R'&&d.version===2);
 const member=ctx.model.members[0];
 for(const intervals of [[[0,.4],[.5,1]],[[0,.6],[.5,1]]]){
  const bad=records.map((d,i)=>({...d,start:intervals[i][0],end:intervals[i][1]}));
  assert.equal(prepareProvidedStability(ctx.model,member,bad,tuples,'off').check.status,'NOT_CHECKED');
 }
 assert.equal(prepareProvidedStability(ctx.model,member,records.map((d,i)=>i?{...d,stabilityClassificationReference:''}:d),tuples,'off').check.reason,'BRACED_COLUMN_CLASSIFICATION_AND_REFERENCE_REQUIRED');
 const low=prepareProvidedStability(ctx.model,member,records,tuples,'off');
 for(const extra of [{taper:{profile:'linear'}},{endOffset:{i:.1}},{insertionPoint:'top-center'}])assert.equal(prepareProvidedStability(ctx.model,{...member,...extra},records,tuples,'off').check.status,'NOT_CHECKED');
 assert.equal(prepareProvidedStability(ctx.model,{...member,endOffset:{i:0,j:{dx:0,dy:0,dz:0}},insertionPoint:'centroid'},records,tuples,'off').check.status,'OK');
 assert.equal(low.check.status,'OK');assert.equal(low.strengthTuples.length,4);
 assert.equal(prepareProvidedStability(ctx.model,member,records,[], 'off').check.status,'NOT_CHECKED');
 assert.equal(prepareProvidedStability(ctx.model,member,records,[{N:NaN,My:0,Mz:0}], 'off').check.status,'NOT_CHECKED');
 const applied=await ctx.call('apply_design_candidate',{jobId:started.jobId,candidateId:job.best.candidateId,requestId:'stability-apply'});assert.equal(applied.ok,true);
 const finalRun=await ctx.bridge.runElasticWorkflow({plan:ctx.bridge.planElasticWorkflow({caseIds:['E']}),requestId:'stability-final-analysis'});assert.equal(finalRun.ok,true);
 const finalReview=await ctx.call('evaluate_practical_design',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,sources:[{analysisRunId:finalRun.steps[0].analysisRunId,comboId:'U'}]});
 const finalCheck=ctx.bridge.getPracticalDesignSnapshot(finalReview.evaluationId).checks.find(c=>c.checkId==='rc-stability');
 assert.equal(finalCheck.status,'OK',JSON.stringify(finalCheck));assert.ok(finalCheck.amplificationRatio<check.amplificationRatio);
 assert.ok(finalCheck.codeReferences.some(r=>r.clause.includes('4.4.6')));
 assert.equal(ctx.model.loads[0].P,.75*weakPc*.3);
 ctx.model.members[0].endOffset={i:.1,j:0};
 const offsetRun=await ctx.bridge.runElasticWorkflow({plan:ctx.bridge.planElasticWorkflow({caseIds:['E']}),requestId:'offset-source'});assert.equal(offsetRun.ok,true);
 const offsetReview=await ctx.call('evaluate_practical_design',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,sources:[{analysisRunId:offsetRun.steps[0].analysisRunId,comboId:'U'}]});
 const offsetSnapshot=ctx.bridge.getPracticalDesignSnapshot(offsetReview.evaluationId),offsetStrength=offsetSnapshot.checks.find(c=>c.checkId==='rc-section-strength');
 assert.ok(['NOT_CHECKED','NG'].includes(offsetStrength.status));assert.equal(offsetStrength.reason,'OFFSET_RIGID_REGION_DESIGN_REQUIRED');assert.equal(offsetStrength.offsetSectionEvaluation,true);assert.equal(offsetStrength.stationMapping.startOffset,.1);assert.ok(offsetStrength.localChecks.every(c=>['OK','NG'].includes(c.status)));assert.ok(offsetSnapshot.demands.every(t=>Math.abs(t.x-t.analysisX-.1)<1e-9));
 assert.equal(offsetStrength.stationMapping.sourceLength,2.9);assert.equal(offsetStrength.stationMapping.grossLength,3);assert.ok(offsetStrength.stationMapping.sourceStationCount>0);
 delete ctx.model.members[0].endOffset;ctx.model.members[0].taper={profile:'linear',sectionIdJ:'rc3060'};
 const taperRun=await ctx.bridge.runElasticWorkflow({plan:ctx.bridge.planElasticWorkflow({caseIds:['E']}),requestId:'taper-source'});assert.equal(taperRun.ok,true,JSON.stringify(taperRun));
 const taperReview=await ctx.call('evaluate_practical_design',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,sources:[{analysisRunId:taperRun.steps[0].analysisRunId,comboId:'U'}]});
 const taperStrength=ctx.bridge.getPracticalDesignSnapshot(taperReview.evaluationId).checks.find(c=>c.checkId==='rc-section-strength');
 assert.equal(taperStrength.status,'NOT_CHECKED');assert.equal(taperStrength.reason,'NONPRISMATIC_RC_SECTION_MAPPING_REQUIRED');assert.equal(taperStrength.stationMapping.sectionProfileRequired,true);
 assert.equal(taperStrength.stationMapping.sectionProfile.profile,'linear');assert.equal(taperStrength.stationMapping.sectionProfile.sectionIdJ,'rc3060');assert.equal(taperStrength.stationMapping.sectionProfile.stationSections,undefined);assert.ok(taperStrength.stationMapping.sectionProfile.hash); 
 ctx.model.members[0].taper={profile:'segments',segments:[{start:0,end:.5,sectionId:ctx.model.members[0].secId},{start:.5,end:1,sectionId:'rc3060'}]};
 const stepRun=await ctx.bridge.runElasticWorkflow({plan:ctx.bridge.planElasticWorkflow({caseIds:['E']}),requestId:'segment-source'});assert.equal(stepRun.ok,true);
 const stepReview=await ctx.call('evaluate_practical_design',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,sources:[{analysisRunId:stepRun.steps[0].analysisRunId,comboId:'U'}]});
 const stepSnapshot=ctx.bridge.getPracticalDesignSnapshot(stepReview.evaluationId),strength=stepSnapshot.checks.find(c=>c.checkId==='rc-section-strength');
 assert.equal(strength.sectionProfileEvaluation,true,JSON.stringify(strength));assert.equal(strength.stationMapping.designStationMapped,true);assert.equal(strength.segmentChecks.length,2);assert.ok(strength.segmentChecks.every(r=>['OK','NG'].includes(r.check.status)));assert.equal(stepSnapshot.summary.complete,false);
 assert.ok(strength.segmentChecks[0].locations.some(t=>t.x===1.5&&t.side==='left'));assert.ok(strength.segmentChecks[1].locations.some(t=>t.x===1.5&&t.side==='right'));
 for(const id of ['rc-shear-y','rc-shear-z']){const shear=stepSnapshot.checks.find(c=>c.checkId===id);assert.equal(shear.sectionProfileEvaluation,true);assert.equal(shear.stationMapping.status,'MAPPED_FOR_SECTION_SHEAR');assert.equal(shear.segmentChecks.length,2);assert.ok(shear.segmentChecks.every(r=>['OK','NG'].includes(r.check.status)&&r.check.codeReferences.length));assert.equal(shear.reason,'SECTION_TRANSITION_SHEAR_REVIEW_REQUIRED');assert.equal(shear.incomplete,true);}
 console.log('PASS actual WebMCP input -> first-order axial analysis -> stability NG -> full KDS amplification detail');
}finally{await ctx.dispose();}
