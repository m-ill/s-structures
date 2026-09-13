import {checkIncomplete} from '../src/metadata/checkCompleteness.js';
import assert from 'node:assert/strict';
import {designContext} from './fixtures/p24/context.js';
const ctx=designContext(),m=ctx.model;
try{
 m.nodes=[{id:'A',x:0,y:0,z:0,support:'fixed'},{id:'B',x:0,y:0,z:3},{id:'C',x:3,y:0,z:3}];m.members=[{id:'AB',type:'frame',n1:'A',n2:'B',matId:'concrete',secId:'rc3060'},{id:'BC',type:'frame',n1:'B',n2:'C',matId:'concrete',secId:'rc3060'}];m.loadCases=[{id:'D',type:'dead',name:'D'}];m.loads=[{id:'F',type:'nodal',node:'C',P:10,dir:'-z',case:'D'}];m.loadCombinations=[{id:'U',type:'strength',name:'U',factors:{D:1.4}}];m.analysisCases=[{id:'E',name:'E',kind:'static',status:'not-run',settings:{comboId:'U',pDeltaMethod:'off'}}];
 m.loads.push({id:'T',type:'nmoment',node:'C',M:.2,dir:'+z',case:'D'});
 const reinforcement={reinforcementForm:'single-deformed',barCoating:'uncoated',lapRequired:false,strengthStandard:'KDS-142020-2022',type:'reinforcement-record',id:'R',name:'column bars',version:1,sourceNote:'fixture',memberId:'AB',start:0,end:1,cover:.04,stirrupDiameter:10,stirrupSpacing:150,stirrupLegs:2,barMaterialId:'steel@1',bars:[-1,1].flatMap(y=>[-1,1].map(z=>({y:y*.2,z:z*.08,diameter:20})))};
 const beamBars={...reinforcement,id:'RB',memberId:'BC',reinforcementForm:'single-deformed',barCoating:'uncoated',startExtension:.29,startFabricationShape:'L90',endFabricationShape:'straight',startBendInsideRadius:.06,startHookTailLength:.24,endSetbackStart:.04,endSetbackEnd:.04};
 const joint={jointFirstStart:.025,jointFirstEnd:.025,jointColumnContinuity:'aligned-through-bars',jointCongestionMode:'longitudinal-paths',jointMinimumClearance:0,jointStrengthMode:'conservative-column-design-beam-nominal',jointAnchorageMode:'special-frame-beam-90-hooks',jointPanelHeight:.6,capacityDemandBasis:'derived-1.25fy-no-column-shear-credit',capacityBeamScope:'rectangular-no-slab-participation',jointHoopForm:'closed-rectangular-two-leg',jointCover:.04,jointDesignStandard:'KDS-142080-2021-special-frame',columnMemberId:'AB',jointMaterialId:'concrete@1',concreteWeight:'normal',type:'connection-record',id:'J',name:'synthetic joint',version:1,sourceNote:'test',nodeId:'B',memberIds:['AB','BC'],connectionType:'rc-joint',restraint:'rigid',jointWidth:.3,jointDepth:.6,barMaterialId:'steel@1',tieDiameter:16,tieSpacing:150,tieLegs:2};
 const ground={type:'ground-record',id:'G',name:'synthetic',version:1,sourceNote:'test',sourceReference:'fixture',basisStatus:'specified',allowableBearing:150,bearingBasis:'gross'};
 const footing={reactionVerticalReference:'footing-top',columnInterfaceSurface:'roughened-6mm',columnInterfaceClean:true,columnInterfacePreparationReference:'synthetic roughness specification',columnTransferType:'cast-in-place-continuous-straight-bars',columnMemberId:'AB',columnEmbedmentLength:.05,columnDevelopmentAbove:.05,barShape:'straight',shrinkageRestraint:'ordinary-not-severely-restrained',type:'foundation-record',id:'F',name:'synthetic',version:1,sourceNote:'test',nodeId:'A',foundationType:'isolated',B:2,L:2,thickness:.3,cover:.05,materialId:'concrete@1',groundId:'G@1',barMaterialId:'steel@1',bottomDiameterB:16,bottomDiameterL:16,bottomSpacingB:500,bottomSpacingL:500,topDiameterB:16,topDiameterL:16,topSpacingB:150,topSpacingL:150,footingWeightCaseId:'D',reactionBasis:'superstructure-only',columnWidth:.6,columnDepth:.3,flexureStandard:'KDS-142020-2022',concreteWeight:'normal',barCoating:'uncoated',punchingStandard:'KDS-142022-2022',punchingMomentMethod:'conservative-perimeter-shear',punchingPerimeterScope:'interior-solid-no-openings'};
 const preview=await ctx.call('preview_design_changes',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,requestId:'joint-preview',commands:[reinforcement,beamBars,joint,ground,footing]});assert.equal((await ctx.call('apply_design_changes',{handle:preview.handle,requestId:'joint-input'})).ok,true);
 const run=await ctx.bridge.runElasticWorkflow({plan:ctx.bridge.planElasticWorkflow({caseIds:['E']}),requestId:'joint-source'});assert.equal(run.ok,true);
 const evaluation=await ctx.call('evaluate_practical_design',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,sources:[{analysisRunId:run.steps[0].analysisRunId,comboId:'U'}]});

 const plan=await ctx.call('plan_design_candidates',{evaluationId:evaluation.evaluationId,memberId:'AB',maxCandidates:1,maxMillis:10000});
 assert.equal(plan.generation.ok,true);assert.ok(plan.dependentDetailCount>=1);assert.ok(plan.affectedDetailIds.includes('J'));assert.ok(plan.affectedDetailIds.includes('F'),JSON.stringify(plan.generation));
 assert.ok(plan.generation.components.some(c=>c.detailId==='J'));
 assert.ok(plan.generation.components.find(c=>c.detailId==='F').components.some(c=>c.version==='p25-foundation-steel-proposal-v7-depth-coupled'));
 const started=await ctx.call('start_design_candidates',{planId:plan.planId,requestId:'auto-connected'});
 let job;for(let i=0;i<300;i++){job=await ctx.call('get_design_candidates',{jobId:started.jobId});if(job.status!=='running')break;await new Promise(r=>setTimeout(r,10));}
 assert.ok(job.best,JSON.stringify(job));assert.ok(job.best.changes.dependentDetails.some(d=>d.id==='J'));assert.equal(job.best.summary.complete,false);
 const applied=await ctx.call('apply_design_candidate_and_review',{jobId:started.jobId,candidateId:job.best.candidateId,requestId:'auto-connected-apply'});
 assert.equal(applied.ok,true,JSON.stringify(applied));assert.equal(applied.followUp.status,'completed');
 const stored=(await ctx.call('get_design_records',{channel:'connections',id:'J'})).rows[0];
 assert.equal(stored.version,2);assert.ok(stored.reinforcement.spacing<.15);
 assert.equal((await ctx.call('get_design_records',{channel:'reinforcement',id:'R'})).rows[0].version,1,'unchanged member detail keeps original version');
 const repairedFoundation=(await ctx.call('get_design_records',{channel:'foundations',id:'F'})).rows[0];assert.equal(repairedFoundation.version,2);assert.ok(repairedFoundation.thickness>.3,'development repair enlarges footing and coupled steel demand');assert.ok(repairedFoundation.columnEmbedmentLength>.05);assert.ok(repairedFoundation.columnDevelopmentAbove>.05);
 assert.ok(applied.followUp.comparison.proposalProvenance.basisCheckIds.length>0);
 const outcome=applied.followUp.comparison.repairOutcome;
 assert.equal(outcome.preservedRegionCount,1);assert.ok(outcome.changedDetails.some(d=>d.id==='J'&&d.version===2));
 const after=ctx.bridge.getPracticalDesignSnapshot(applied.followUp.evaluationId);
 assert.ok(repairedFoundation.reinforcement.bottomB.spacing<.5);assert.ok(repairedFoundation.reinforcement.bottomL.spacing<.5);
 const minimum=after.checks.find(c=>c.entityId==='foundation:A'&&c.checkId==='foundation-reinforcement');assert.ok(minimum.axisChecks.every(c=>c.status==='OK'),JSON.stringify(minimum));
 const transfer=after.checks.find(c=>c.entityId==='foundation:A'&&c.checkId==='foundation-column-transfer');
 let development=transfer;for(let i=0;i<3&&development?.requiredBelow===undefined;i++)development=development?.normalTransfer;
 assert.ok(repairedFoundation.columnEmbedmentLength>=development.requiredBelow-1e-10);assert.ok(repairedFoundation.columnDevelopmentAbove>=development.requiredAbove-1e-10);
 assert.ok(transfer.incompleteReasons.includes('COLUMN_TRANSFER_TORSION_UNSUPPORTED'));
 assert.equal(outcome.pendingCheckCount,after.checks.filter(c=>c.status!=='N_A'&&(c.status==='NG'||checkIncomplete(c))).length);
 const artifact=await ctx.call('export_design_drawings',{evaluationId:applied.followUp.evaluationId,format:'json'});
 assert.deepEqual(artifact.designComparison.repairOutcome,outcome);
 console.log('PASS member automatic connected proposal -> joint repair -> same-engine follow-up and provenance');
}finally{await ctx.dispose();}
