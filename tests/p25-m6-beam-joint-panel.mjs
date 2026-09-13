import {readJsonRecord} from '../src/ui/jsonRecordReader.js';
import {checkIncomplete} from '../src/metadata/checkCompleteness.js';
import assert from 'node:assert/strict';
import {designContext} from './fixtures/p24/context.js';
const explicitShape=process.env.P25_DEPENDENT_SHAPE==='1',ctx=designContext(),m=ctx.model;
try{
 m.nodes=[{id:'A',x:0,y:0,z:0,support:'fixed'},{id:'B',x:0,y:0,z:3},{id:'C',x:3,y:0,z:3}];m.members=[{id:'AB',type:'frame',n1:'A',n2:'B',matId:'concrete',secId:'rc3060'},{id:'BC',type:'frame',n1:'B',n2:'C',matId:'concrete',secId:'rc3060'}];m.loadCases=[{id:'D',type:'dead',name:'D'}];m.loads=[{id:'F',type:'nodal',node:'C',P:10,dir:'-z',case:'D'}];m.loadCombinations=[{id:'U',type:'strength',name:'U',factors:{D:1.4}}];m.analysisCases=[{id:'E',name:'E',kind:'static',status:'not-run',settings:{comboId:'U',pDeltaMethod:'off'}}];
 m.loads.push({id:'T',type:'nmoment',node:'C',M:.2,dir:'+z',case:'D'});
 const reinforcement={reinforcementForm:'single-deformed',barCoating:'uncoated',lapRequired:false,strengthStandard:'KDS-142020-2022',type:'reinforcement-record',id:'R',name:'column bars',version:1,sourceNote:'fixture',memberId:'AB',start:0,end:1,cover:.04,stirrupDiameter:10,stirrupSpacing:150,stirrupLegs:2,barMaterialId:'steel@1',bars:[-1,1].flatMap(y=>[-1,1].map(z=>({y:y*.2,z:z*.08,diameter:20})))};
 const beamBars={...reinforcement,id:'RB',memberId:'BC',reinforcementForm:'single-deformed',barCoating:'uncoated',startExtension:.29,startFabricationShape:'L90',endFabricationShape:'straight',startBendInsideRadius:.06,startHookTailLength:.24,endSetbackStart:.04,endSetbackEnd:.04};
 const joint={jointFirstStart:.025,jointFirstEnd:.025,jointColumnContinuity:'aligned-through-bars',jointCongestionMode:'longitudinal-paths',jointMinimumClearance:0,jointStrengthMode:'conservative-column-design-beam-nominal',jointAnchorageMode:'special-frame-beam-90-hooks',jointPanelHeight:.6,capacityDemandBasis:'derived-1.25fy-no-column-shear-credit',capacityBeamScope:'rectangular-no-slab-participation',jointHoopForm:'closed-rectangular-two-leg',jointCover:.04,jointDesignStandard:'KDS-142080-2021-special-frame',columnMemberId:'AB',jointMaterialId:'concrete@1',concreteWeight:'normal',type:'connection-record',id:'J',name:'synthetic joint',version:1,sourceNote:'test',nodeId:'B',memberIds:['AB','BC'],connectionType:'rc-joint',restraint:'rigid',jointWidth:.3,jointDepth:.6,barMaterialId:'steel@1',tieDiameter:16,tieSpacing:150,tieLegs:2};
 if(explicitShape)Object.assign(joint,{jointTieClosure:'seismic-135',jointHookTail:.096,jointBendInsideRadius:.032,jointClosureCorner:'+y+z',jointClosureSeparation:.04});
 const ground={type:'ground-record',id:'G',name:'synthetic',version:1,sourceNote:'test',sourceReference:'fixture',basisStatus:'specified',allowableBearing:150,bearingBasis:'gross'};
 const footing={reactionVerticalReference:'footing-top',columnInterfaceSurface:'roughened-6mm',columnInterfaceClean:true,columnInterfacePreparationReference:'synthetic roughness specification',columnTransferType:'cast-in-place-continuous-straight-bars',columnMemberId:'AB',columnEmbedmentLength:.05,columnDevelopmentAbove:.05,barShape:'straight',shrinkageRestraint:'ordinary-not-severely-restrained',type:'foundation-record',id:'F',name:'synthetic',version:1,sourceNote:'test',nodeId:'A',foundationType:'isolated',B:2,L:2,thickness:.5,cover:.05,materialId:'concrete@1',groundId:'G@1',barMaterialId:'steel@1',bottomDiameterB:16,bottomDiameterL:16,bottomSpacingB:150,bottomSpacingL:150,topDiameterB:16,topDiameterL:16,topSpacingB:150,topSpacingL:150,footingWeightCaseId:'D',reactionBasis:'superstructure-only',columnWidth:.6,columnDepth:.3,flexureStandard:'KDS-142020-2022',concreteWeight:'normal',barCoating:'uncoated',punchingStandard:'KDS-142022-2022',punchingMomentMethod:'conservative-perimeter-shear',punchingPerimeterScope:'interior-solid-no-openings'};
 const preview=await ctx.call('preview_design_changes',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,requestId:'joint-preview',commands:[reinforcement,beamBars,joint,ground,footing]});assert.equal((await ctx.call('apply_design_changes',{handle:preview.handle,requestId:'joint-input'})).ok,true);
 const run=await ctx.bridge.runElasticWorkflow({plan:ctx.bridge.planElasticWorkflow({caseIds:['E']}),requestId:'joint-source'});assert.equal(run.ok,true);
 const evaluation=await ctx.call('evaluate_practical_design',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,sources:[{analysisRunId:run.steps[0].analysisRunId,comboId:'U'}]});


 const plan=await ctx.call('plan_design_candidates',{evaluationId:evaluation.evaluationId,memberId:'BC',sectionCandidates:[{B:350,H:700}],spacings:[150],maxCandidates:1,maxMillis:10000});
 assert.ok(plan.affectedDetailIds.includes('J'));
 const started=await ctx.call('start_design_candidates',{planId:plan.planId,requestId:'beam-panel'});
 let job;for(let i=0;i<500;i++){job=await ctx.call('get_design_candidates',{jobId:started.jobId});if(job.status!=='running')break;await new Promise(r=>setTimeout(r,10));}
 assert.ok(job.best,JSON.stringify(job));assert.ok(job.best.changes.dependentDetails.some(d=>d.id==='J'));
 const detail=await readJsonRecord(args=>ctx.call('get_design_candidate_detail',{jobId:started.jobId,candidateId:job.best.candidateId,...args}),{hashKey:'detailHash',totalKey:'total',encoding:'json-text'});
 assert.equal(detail.value.connectionChanges[0].after.jointPanelHeight,.7);
 const applied=await ctx.call('apply_design_candidate_and_review',{jobId:started.jobId,candidateId:job.best.candidateId,requestId:'beam-panel-apply'});assert.equal(applied.ok,true,JSON.stringify(applied));
 const final=(await ctx.call('get_design_records',{channel:'connections',id:'J'})).rows[0];
 assert.equal(final.jointPanelHeight,.7);assert.equal(final.jointWidth,.3);assert.equal(final.jointDepth,.6);assert.equal(final.version,2);
 const {prepareDetailGeometry}=await import('../src/design/rc/preparedDetailGeometry.js');
 const prepared=prepareDetailGeometry(m).connections['J@2'];assert.equal(prepared.hoops.height,.7);assert.equal(prepared.hoops.end,.6749999999999999);
 assert.equal(prepared.hoops.count,6);
 console.log('PASS WebMCP beam section -> joint panel update -> candidate reanalysis -> apply/review -> new hoop extent and count');
}finally{await ctx.dispose();}
