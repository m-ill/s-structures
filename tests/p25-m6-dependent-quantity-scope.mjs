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


 const {evaluateColumnTransfer}=await import('../src/design/foundation/columnTransfer.js');
 const {deriveJointProbableForces}=await import('../src/design/connection/jointProbableForces.js');
 for(const extra of [{endOffset:{i:.1}},{insertionPoint:'top-center'}]){
  const shifted=structuredClone(m);Object.assign(shifted.members.find(v=>v.id==='AB'),extra);
  const transfer=evaluateColumnTransfer(shifted,shifted.designDetails.foundations[0],{rx:0,ry:0,rmx:0,rmy:0,rmz:0},{ok:true,columnN:100});
  assert.equal(transfer.reason,'SINGLE_COLUMN_TRANSFER_MAPPING_REQUIRED');assert.equal(transfer.status,'NOT_CHECKED');assert.ok(transfer.codeReferences.length);
  Object.assign(shifted.members.find(v=>v.id==='BC'),extra);
  assert.equal(deriveJointProbableForces(shifted,shifted.designDetails.connections[0]).reason,'CENTERED_ORTHOGONAL_BEAM_PROBABLE_FORCE_REQUIRED');
 }
 const plan=await ctx.call('plan_design_candidates',{evaluationId:evaluation.evaluationId,memberId:'AB',spacings:[100],dependentCandidates:[{connectionId:'J',detailCandidates:[{tieSpacing:150},{tieSpacing:100}]}],maxCandidates:2,maxMillis:10000});
 const start=await ctx.call('start_design_candidates',{planId:plan.planId,requestId:'quantity-scope'});
 let job;for(let i=0;i<500;i++){job=await ctx.call('get_design_candidates',{jobId:start.jobId});if(job.status!=='running')break;await new Promise(r=>setTimeout(r,10));}
 assert.equal(job.candidates.length,2);assert.ok(job.candidates.every(c=>c.summary),JSON.stringify(job));
 for(const c of job.candidates)assert.equal(c.objective.dependentQuantities?.length,1,'all requested targets remain in cost scope');
 const unchanged=job.candidates.find(c=>c.changes.dependentDetails.length===0),changed=job.candidates.find(c=>c.changes.dependentDetails.length===1);
 assert.ok(unchanged&&changed);
 const a=unchanged.objective.dependentQuantities[0],b=changed.objective.dependentQuantities[0];
 assert.equal(a.quantityBasis,explicitShape?'prepared-nominal-centerline':'panel-perimeter-proxy');assert.equal(b.quantityBasis,a.quantityBasis);assert.equal(a.nominalGeometryAvailable,explicitShape);assert.equal(b.nominalGeometryAvailable,explicitShape);assert.equal(a.quantityComplete,false);
 assert.equal(a.version,1);assert.equal(a.changed,false);assert.equal(b.version,2);assert.equal(b.changed,true);
 assert.ok(Math.abs((unchanged.objective.value-a.steelVolume)-(changed.objective.value-b.steelVolume))<1e-12);
 assert.ok(b.steelVolume>a.steelVolume);
 assert.equal((await ctx.call('get_design_records',{channel:'connections',id:'J'})).rows[0].version,1);
 const sectionPlan=await ctx.call('plan_design_candidates',{evaluationId:evaluation.evaluationId,memberId:'AB',sectionCandidates:[{B:350,H:650}],spacings:[150],maxCandidates:1,maxMillis:10000});
 assert.ok(sectionPlan.affectedDetailIds.includes('F'));assert.ok(sectionPlan.affectedDetailIds.includes('J'));
 const sectionStart=await ctx.call('start_design_candidates',{planId:sectionPlan.planId,requestId:'section-footing'});
 let sj;for(let i=0;i<500;i++){sj=await ctx.call('get_design_candidates',{jobId:sectionStart.jobId});if(sj.status!=='running')break;await new Promise(r=>setTimeout(r,10));}
 assert.ok(sj.best,JSON.stringify(sj)); const queried=await readJsonRecord(args=>ctx.call('get_design_candidate_detail',{jobId:sectionStart.jobId,candidateId:sj.best.candidateId,...args}),{hashKey:'detailHash',totalKey:'total',encoding:'json-text'});
 const jointChange=queried.value.connectionChanges.find(c=>c.after.id==='J');
 assert.equal(jointChange.before.jointWidth,.3);assert.equal(jointChange.after.jointWidth,.35);assert.ok(jointChange.changedFields.includes('jointWidth'));
 assert.equal(jointChange.units.jointWidth,'m');
assert.ok(sj.best.changes.dependentDetails.some(d=>d.id==='F'));
 assert.ok(sj.best.objective.dependentQuantities.some(d=>d.id==='F'&&d.changed));
 const applied=await ctx.call('apply_design_candidate_and_review',{jobId:sectionStart.jobId,candidateId:sj.best.candidateId,requestId:'section-footing-apply'});assert.equal(applied.ok,true);
 const comparison=await readJsonRecord(args=>ctx.call('get_practical_design_check',{evaluationId:applied.followUp.evaluationId,checkId:applied.followUp.comparison.detailHash,...args}));
 const recorded=comparison.value.connectedGeometryChanges.records;
 const jc=recorded.find(r=>r.id==='J'),fc=recorded.find(r=>r.id==='F');
 assert.deepEqual(jc.fields.find(f=>f.key==='jointWidth'),{key:'jointWidth',before:.3,after:.35,unit:'m'});
 assert.deepEqual(fc.fields.find(f=>f.key==='columnWidth'),{key:'columnWidth',before:.6,after:.65,unit:'m'});
 assert.equal((await ctx.call('release_design_candidates',{jobId:sectionStart.jobId})).ok,true);
 const retained=await readJsonRecord(args=>ctx.call('get_practical_design_check',{evaluationId:applied.followUp.evaluationId,checkId:applied.followUp.comparison.detailHash,...args}));
 assert.deepEqual(retained.value.connectedGeometryChanges,comparison.value.connectedGeometryChanges);
 assert.equal(jc.beforeVersion,1);assert.equal(jc.afterVersion,2);assert.ok(!fc.fields.some(f=>f.key==='B'));

 const final=(await ctx.call('get_design_records',{channel:'foundations',id:'F'})).rows[0];
 const finalJoint=(await ctx.call('get_design_records',{channel:'connections',id:'J'})).rows[0];
 assert.equal(finalJoint.jointWidth,.35);assert.equal(finalJoint.jointDepth,.65);assert.equal(finalJoint.version,2);
 const jointQuantity=sj.best.objective.dependentQuantities.find(q=>q.id==='J');assert.equal(jointQuantity.changed,true);
 if(!explicitShape){assert.equal(jointQuantity.quantityBasis,'panel-perimeter-proxy');assert.ok(jointQuantity.steelVolume>0);}
 assert.equal(final.columnWidth,.65);assert.equal(final.columnDepth,.35);assert.equal(final.version,2);assert.equal(final.B,2);assert.equal(final.L,2);
 console.log('PASS stable requested quantity scope across changed/unchanged dependent variants');
}finally{await ctx.dispose();}
