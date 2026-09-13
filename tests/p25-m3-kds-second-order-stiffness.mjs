import assert from 'node:assert/strict';
import {createModel} from '../src/core/model.js';
import {stagePracticalDesignInput} from '../src/modeling/practicalDesignInputs.js';
import {sectionOf} from '../src/core/catalogs.js';
import {prepareKdsSecondOrderProfiles} from '../src/design/rc/kdsSecondOrderStiffness.js';
import {designContext} from './fixtures/p24/context.js';
import {runSecondOrderPDelta} from '../src/solver/pdelta/secondOrder.js';
import {prepareProvidedStability} from '../src/design/rc/kdsStability.js';
import {evaluateFrameServiceability} from '../src/design/rc/frameServiceability.js';
import {createRcServiceWorkflow} from '../src/compute/product/rcServiceWorkflow.js';
import {createResourceBudget} from '../src/core/resourceBudget.js';
import {stableHash} from '../src/core/stableHash.js';
const m=createModel();m.nodes=[{id:'A',x:0,y:0,z:0},{id:'B',x:3,y:0,z:0}];m.members=[{id:'AB',type:'frame',n1:'A',n2:'B',matId:'concrete',secId:'rc3060'}];
const input={type:'reinforcement-record',id:'R',name:'synthetic',version:1,memberId:'AB',sourceNote:'test',start:0,end:1,cover:.04,barMaterialId:'steel@1',bars:[{y:.2,z:.08,diameter:20},{y:-.2,z:-.08,diameter:20}],memberRole:'compression-member',secondOrderStiffnessStandard:'KDS-142020-2022',lateralSustainedRatio:.5,lateralSustainedReference:'specified story shear ratio for test'};
stagePracticalDesignInput(m,input,[]);
const before=JSON.stringify(m),r=prepareKdsSecondOrderProfiles(m),gross=sectionOf(m,'rc3060');
assert.ok(Math.abs(r.profiles[0].segments[0].Iy/gross.Iy-.7/1.5)<1e-12);
assert.equal(r.members[0].axialAreaFactor,1);assert.equal(JSON.stringify(m),before);
m.designDetails.reinforcement[0].memberRole='flexural-member';
assert.equal(prepareKdsSecondOrderProfiles(m).profiles[0].segments[0].Iz,gross.Iz*.35);
m.designDetails.reinforcement[0].memberRole='compression-member';
delete m.designDetails.reinforcement[0].lateralSustainedReference;
assert.throws(()=>prepareKdsSecondOrderProfiles(m),/KDS_LATERAL_SUSTAINED_BASIS_REQUIRED/);
console.log('PASS KDS beam/column modifiers, explicit sustained ratio and source immutability');
const saved=new Map(),storage={get:async k=>structuredClone(saved.get(k)),put:async(k,v)=>saved.set(k,structuredClone(v)),delete:async k=>saved.delete(k)};
const options={SStructuresCheckpointStorage:storage,SStructuresBuildIdentity:{version:'kds-second-order-test'}};
const ctx=designContext(options);
try{
 m.designDetails.reinforcement[0].lateralSustainedReference='synthetic story ratio';
 m.designDetails.reinforcement[0].stabilityStandard='KDS-142020-2022';
 Object.assign(m.designDetails.reinforcement[0],{serviceabilityMode:'instant-live-frame',serviceCrackingComboId:'TOTAL',serviceBaselineComboId:'BASE',serviceDeflectionAxis:'w',serviceBoundary:'cantilever-start',serviceDeflectionLimit:'live-floor',nonstructuralDamageSensitive:false});
 m.analysisSettings.shearDeformation=false;m.analysisSettings.includeShearDeformation=false;
 m.nodes[0].support='fixed';m.analysisSettings.pDeltaMethod='direct';m.analysisSettings.selfWeight=false;
 m.loadCases=[{id:'D',name:'D',type:'dead'}];m.loads=[{id:'N',type:'nodal',node:'B',P:20,dir:'-x',case:'D'},{id:'V',type:'nodal',node:'B',P:1,dir:'-y',case:'D'}];
 m.loadCombinations=[{id:'U',name:'U',type:'strength',factors:{D:1.4}}];
 m.loadCases.push({id:'L',name:'L',type:'live'});m.loads.push({id:'VL',type:'nodal',node:'B',P:.5,dir:'-y',case:'L'});
 m.loadCombinations.push({id:'TOTAL',name:'TOTAL',type:'service',factors:{D:1,L:1}},{id:'BASE',name:'BASE',type:'service',factors:{D:1}});
 Object.assign(ctx.model,structuredClone(m));
 const hash=ctx.bridge.getWorkflowInputIdentity().inputHash;
 const run=await ctx.call('run_rc_service_iteration',{inputHash:hash,stiffnessMode:'kds-elastic-second-order',comboIds:['U']});
 assert.equal(run.converged,true,JSON.stringify(run));assert.equal(run.stale,false);assert.equal(run.globalMethodQualified,false);
 const proof=run.stiffnessByCombo.U;
 assert.equal(proof.stiffnessMode,'kds-elastic-second-order');assert.equal(proof.memberFactors[0].inertiaFactor,.7/1.5);assert.ok(proof.appliedProfileHash);
 assert.equal(proof.localMagnifierApplied,false);assert.equal(run.secondOrderByCombo.U.converged,true);
 assert.equal(run.spatialConverged,true);assert.ok(run.spatialTrace.U.length>=2);
 assert.equal(proof.frameRefinement.converged,true);assert.ok(proof.frameRefinement.maximumNormalizedChange<=1);
 assert.equal(ctx.bridge.getWorkflowInputIdentity().inputHash,hash);
 const review=await ctx.call('evaluate_practical_design',{inputHash:hash,sources:[{rcIterationId:run.iterationId,comboId:'U'}]});
 assert.equal(review.ok,true);const snapshot=ctx.bridge.getPracticalDesignSnapshot(review.evaluationId);assert.ok(snapshot.checks.length);
 const stability=snapshot.checks.find(c=>c.entityId==='AB'&&c.checkId==='rc-stability');
 assert.equal(stability.status,'OK',JSON.stringify(stability));
 assert.equal(stability.method,'refined-direct-elastic-second-order');assert.equal(stability.localMagnifierApplied,false);
 assert.equal(stability.codeBasis.status,'NOT_ESTABLISHED');assert.equal(stability.methodReviewRequired,true);
 const set=snapshot.sets[0].set,tuples=[{N:-28,My:1,Mz:0}];
 const bad=structuredClone(set);delete bad.stiffnessProvenance.frameRefinement;
 const blocked=prepareProvidedStability(ctx.model,ctx.model.members[0],ctx.model.designDetails.reinforcement,tuples,'direct',bad);
 assert.equal(blocked.check.status,'NOT_CHECKED');assert.ok(blocked.check.incompleteReasons.includes('DIRECT_FRAME_REFINEMENT_PROOF_REQUIRED'));assert.equal(blocked.strengthTuples,tuples);
 for(const [mutate,reason] of [
  [s=>{s.stiffnessProvenance.sourceModelHash='outdated';},'KDS_APPLIED_STIFFNESS_PROOF_REQUIRED'],
  [s=>{s.secondOrderTrace.limitationCodes=['TIMOSHENKO_GEOMETRIC_STIFFNESS_UNQUALIFIED'];},'DIRECT_FORMULATION_LIMITATIONS_REMAIN'],
  [s=>{s.memberResults.AB.refinement.cutEquilibriumVerified=false;},'DIRECT_FRAME_REFINEMENT_PROOF_REQUIRED'],
  [s=>{s.firstOrderMomentComparison.version='outdated';s.firstOrderMomentComparison.members.AB.status='EXCEEDS_IN_RECOVERY_INTERVALS';},'FULL_MEMBER_MOMENT_COMPARISON_REQUIRED']
 ]){
  const invalid=structuredClone(set);mutate(invalid);
  const result=prepareProvidedStability(ctx.model,ctx.model.members[0],ctx.model.designDetails.reinforcement,tuples,'direct',invalid);
  assert.equal(result.check.status,'NOT_CHECKED',reason);assert.ok(result.check.incompleteReasons.includes(reason));assert.equal(result.strengthTuples,tuples);
 }
 const exceeded=structuredClone(set);exceeded.firstOrderMomentComparison.members.AB.status='EXCEEDS_IN_RECOVERY_INTERVALS';
 exceeded.firstOrderMomentComparison.members.AB.axes.My.maximumFiniteRatio=1.1;
 const excess=prepareProvidedStability(ctx.model,ctx.model.members[0],ctx.model.designDetails.reinforcement,tuples,'direct',exceeded);
 assert.equal(excess.check.status,'NG');assert.equal(excess.check.ratio,1.1);assert.equal(excess.check.incomplete,false);assert.equal(excess.check.designTransferAllowed,false);
 exceeded.firstOrderMomentComparison.members.AB.axes.My.zeroReferenceExceedance=true;
 assert.equal(prepareProvidedStability(ctx.model,ctx.model.members[0],ctx.model.designDetails.reinforcement,tuples,'direct',exceeded).check.ratio,null);
 const grossRun=runSecondOrderPDelta(ctx.model,{D:1.4});assert.equal(grossRun.ok,true);
 const baseMoment=r=>Math.hypot(r.My[0],r.Mz[0]);
 const reducedMoment=baseMoment(snapshot.sets[0].set.memberResults.AB),grossMoment=baseMoment(grossRun.result.memberResults.AB);
 assert.ok(reducedMoment>grossMoment+1e-6,JSON.stringify({reducedMoment,grossMoment}));
 console.log(JSON.stringify({reducedMoment,grossMoment,inertiaFactor:proof.memberFactors[0].inertiaFactor,units:'kN.m'}));
 await ctx.bridge.saveWorkflowCheckpoint({projectId:'KDS-SECOND-ORDER'});
 const manifest=JSON.parse(saved.get('KDS-SECOND-ORDER').content),state={records:[]};
 for(const segment of manifest.segments.filter(s=>s.path[0]==='rcService')){
  const value=JSON.parse(saved.get(segment.key).content);
  if(segment.path.length===3)state[segment.path[1]][segment.path[2]]=value;else state[segment.path[1]]=value;
 }
 for(const corrupt of [s=>{delete s.memberServiceResponses;},s=>{s.memberServiceResponses.AB.chord.v.maxAbs+=1;}]){
  const broken=structuredClone(state),row=broken.records[0][1];corrupt(row.result.analysis.byCombo.U);row.resultHash=stableHash(row.result);
  const {checksum,...body}=broken;broken.checksum=stableHash(body);
  const restoreBudget=createResourceBudget(),invalidRuntime=createRcServiceWorkflow({bridge:ctx.bridge,budget:restoreBudget});
  assert.throws(()=>invalidRuntime.restoreState(broken),/RC_CHECKPOINT_INVALID/);
  assert.equal(invalidRuntime.context().iterations.length,0);assert.equal(restoreBudget.snapshot().totalBytes,0);invalidRuntime.dispose();
 }
 const restored=designContext(options);
 try{
  await restored.bridge.restoreWorkflowCheckpoint({projectId:'KDS-SECOND-ORDER'});
  const record=await restored.call('get_rc_service_iteration',{iterationId:run.iterationId});
  assert.equal(record.stale,false);assert.deepEqual(record.stiffnessByCombo.U,run.stiffnessByCombo.U);
  const restoredReview=await restored.call('evaluate_practical_design',{inputHash:restored.bridge.getWorkflowInputIdentity().inputHash,sources:[{rcIterationId:run.iterationId,comboId:'U'}]});
  assert.equal(restoredReview.ok,true);
  const restoredStability=restored.bridge.getPracticalDesignSnapshot(restoredReview.evaluationId).checks.find(c=>c.entityId==='AB'&&c.checkId==='rc-stability');
  assert.equal(restoredStability.status,'OK',JSON.stringify(restoredStability));assert.equal(restoredStability.methodReviewRequired,true);
 }finally{await restored.dispose();}
 await assert.rejects(()=>ctx.call('run_rc_service_iteration',{inputHash:hash,stiffnessMode:'kds-elastic-second-order',comboIds:['U'],timeEffect:'instantaneous'}),/RC_TIME_EFFECT_MODE_CONFLICT/);
 const pending=ctx.call('run_rc_service_iteration',{inputHash:hash,stiffnessMode:'kds-elastic-second-order',comboIds:['U']}).then(()=>assert.fail('cancelled job completed'),error=>error);
 assert.equal((await ctx.call('cancel_rc_service_iteration',{})).cancelled,true);assert.equal((await pending).code,'CANCELLED');
 assert.ok(!Object.keys(ctx.bridge.getResourceState().owners).some(k=>k.startsWith('rc-iteration-transient')));
 const service=await ctx.call('run_rc_service_iteration',{inputHash:hash,stiffnessMode:'kds-elastic-second-order',comboIds:['TOTAL','BASE']});
 assert.equal(service.converged,true);
 const stageArgs={inputHash:hash,memberId:'AB',stages:[{iterationId:service.iterationId,comboId:'TOTAL',factor:1},{iterationId:service.iterationId,comboId:'BASE',factor:-1}]};
 const memoryBefore=(await ctx.call('get_practical_design_context')).memory.totalBytes;
 const composed=await ctx.call('compose_rc_service_stages',stageArgs);
 assert.equal(composed.ok,true);assert.equal(composed.timeHistoryQualified,false);assert.equal(composed.designTransferAllowed,false);assert.equal(composed.sources.length,2);assert.ok(composed.sources.every(s=>s.resultHash));
 assert.equal((await ctx.call('get_practical_design_context')).memory.totalBytes,memoryBefore);assert.ok(composed.codeReferences.length);
 const twice=await ctx.call('compose_rc_service_stages',stageArgs);assert.equal(twice.resultHash,composed.resultHash);
 await assert.rejects(ctx.call('compose_rc_service_stages',{...stageArgs,inputHash:'0'.repeat(64)}),{code:'STALE_INPUT'});
 const serviceReview=await ctx.call('evaluate_practical_design',{inputHash:hash,sources:['TOTAL','BASE'].map(comboId=>({rcIterationId:service.iterationId,comboId}))});
 assert.equal(serviceReview.ok,true);
 const serviceSnapshot=ctx.bridge.getPracticalDesignSnapshot(serviceReview.evaluationId),deflections=serviceSnapshot.checks.filter(c=>c.entityId==='AB'&&c.checkId==='rc-deflection');
 assert.ok(deflections.some(c=>c.status==='OK'&&c.demand>0),JSON.stringify(deflections));
 assert.ok(deflections.some(c=>c.status==='N_A'),JSON.stringify(deflections));
 assert.ok(deflections.every(c=>c.codeBasis.status!=='ESTABLISHED'));
 const deflection=deflections.find(c=>c.status==='OK');
 assert.ok(Math.abs(deflection.demand-composed.response['cantilever-start'].w.maxAbs)<1e-12);
 assert.equal(deflection.frameSourceMethod,'refined-direct-specified-inertia');assert.equal(deflection.methodReviewRequired,true);assert.equal(deflection.incomplete,true);
 const serviceSets=Object.fromEntries(serviceSnapshot.sets.map(s=>[s.set.combo.id,s.set]));
 const invalidService=structuredClone(serviceSets);delete invalidService.BASE.memberResults.AB.refinement;
 const invalidDeflection=evaluateFrameServiceability(ctx.model,ctx.model.members[0],ctx.model.designDetails.reinforcement,invalidService.TOTAL,invalidService);
 assert.equal(invalidDeflection.status,'NOT_CHECKED');assert.equal(invalidDeflection.reason,'REFINED_FRAME_SERVICE_PROOF_REQUIRED');
 console.log(JSON.stringify({incrementalTransverseDeflection:deflection.demand,capacity:deflection.capacity,units:'m',methodReviewRequired:deflection.methodReviewRequired}));
 console.log('PASS public Worker Direct run with KDS profile -> practical review, unchanged model and incompatible settings rejected');
}finally{await ctx.dispose();}
