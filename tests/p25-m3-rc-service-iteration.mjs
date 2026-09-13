import assert from 'node:assert/strict';
import {runRcServiceIteration} from '../src/compute/product/rcServiceIteration.js';
import {createModel} from '../src/core/model.js';
import {stagePracticalDesignInput} from '../src/modeling/practicalDesignInputs.js';
import {stableHash} from '../src/core/stableHash.js';
const m=createModel();m.nodes=[{id:'A',x:0,y:0,z:0,support:'fixed'},{id:'B',x:3,y:0,z:0}];
m.members=[{id:'AB',type:'frame',n1:'A',n2:'B',matId:'concrete',secId:'rc3060'}];
m.loadCases=[{id:'D',name:'D',type:'dead'},{id:'L',name:'L',type:'live'}];
m.loadCombinations=[{id:'LIVE',name:'LIVE',type:'service',factors:{L:1}},{id:'TOTAL',name:'TOTAL',type:'service',factors:{D:1,L:1}}];
m.loads=[{id:'D1',type:'nodal',node:'B',dir:'-z',P:35,case:'D'},{id:'L1',type:'nodal',node:'B',dir:'-z',P:5,case:'L'}];
m.analysisSettings.pDeltaMethod='off';
stagePracticalDesignInput(m,{type:'reinforcement-record',id:'R',name:'R',version:1,memberId:'AB',start:0,end:1,cover:.04,barMaterialId:'steel@1',bars:[{y:-.2,z:0,diameter:20},{y:.2,z:0,diameter:20}],sourceNote:'synthetic',concreteWeight:'normal',serviceabilityMode:'instant-live-curvature',serviceBoundary:'cantilever-start',serviceDeflectionLimit:'live-floor',serviceCrackingComboId:'TOTAL',nonstructuralDamageSensitive:false},[]);
const hash=stableHash(m),result=await runRcServiceIteration(m,{liveComboId:'LIVE'});
assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.converged,true);
assert.ok(result.profiles[0].segments[0].Iz<.3*.6**3/12);
assert.ok(result.trace.at(-1).maxDisplacement>result.trace[0].maxDisplacement);
assert.ok(result.codeReferences.some(r=>r.code==='KDS 14 20 30'&&r.clause));
assert.equal(result.designTransferAllowed,false);assert.equal(result.globalMethodQualified,false);
assert.equal(stableHash(m),hash);
const axial=structuredClone(m);axial.loads.push({id:'N1',type:'nodal',node:'B',dir:'+x',P:5,case:'L'});
const rejected=await runRcServiceIteration(axial,{liveComboId:'LIVE'});
assert.equal(rejected.ok,false);assert.equal(rejected.reason,'UNIAXIAL_FLEXURE_WITHOUT_AXIAL_FORCE_REQUIRED');
assert.equal(rejected.analysis,undefined);
console.log('PASS RC effective-inertia policy -> real repeated analysis, KDS section references and unsupported axial rejection');

const redundant=structuredClone(m);redundant.nodes[1].support='fixed';
redundant.loads=[{id:'D1',type:'udl',member:'AB',dir:'-z',w:80,case:'D'},{id:'L1',type:'udl',member:'AB',dir:'-z',w:10,case:'L'}];
const left=redundant.designDetails.reinforcement[0];left.end=.5;left.serviceBoundary='chord';
redundant.designDetails.reinforcement.push({...structuredClone(left),id:'R2',start:.5,end:1,bars:left.bars.map(b=>({...b,area:b.area*2.56,diameter:b.diameter*1.6}))});
const redistributed=await runRcServiceIteration(redundant,{liveComboId:'LIVE'});
assert.equal(redistributed.ok,true,JSON.stringify(redistributed));
assert.ok(redistributed.trace.length>3,'indeterminate frame needs updated moment-dependent profiles');
const end=redistributed.analysis.byCombo.TOTAL.memberResults.AB.end;
assert.ok(Math.abs(Math.abs(end[5])-Math.abs(end[11]))>1,'unequal reinforcement redistributes the fixed-end moments');
assert.ok(redistributed.trace.at(-1).profileResidual<=1e-6);
console.log('PASS actual indeterminate beam redistribution across unequal RC regions');

const {designContext}=await import('./fixtures/p24/context.js');
const checkpointData=new Map(),checkpointStorage={get:async k=>structuredClone(checkpointData.get(k)),put:async(k,v)=>checkpointData.set(k,structuredClone(v)),delete:async k=>checkpointData.delete(k)};
const ctx=designContext({SStructuresCheckpointStorage:checkpointStorage,SStructuresBuildIdentity:{version:'synthetic-rc-checkpoint'}});
try{
 Object.assign(ctx.model,structuredClone(m));ctx.model.meta={...ctx.model.meta,projectId:'P24-SYNTHETIC'};
 const inputHash=ctx.bridge.getWorkflowInputIdentity().inputHash;
 const started=await ctx.call('run_rc_service_iteration',{inputHash,liveComboId:'LIVE',maxIterations:10});
 assert.equal(started.ok,true,JSON.stringify(started));assert.equal(started.converged,true);
 const stored=await ctx.call('get_rc_service_iteration',{iterationId:started.iterationId});
 assert.equal(stored.stale,false);assert.ok(stored.codeReferences.length);
 assert.equal(stored.stiffnessByCombo.LIVE.appliedProfileHash.length,64);
 assert.equal(stored.stiffnessByCombo.LIVE.stiffnessMode,'effective-inertia');
 assert.equal(stored.stiffnessByCombo.LIVE.timeEffect,'instantaneous');
 const detail=await ctx.call('get_rc_service_iteration_detail',{iterationId:started.iterationId,limit:256});
 assert.equal(detail.ok,true);assert.equal(detail.chunk.length,256);assert.equal(detail.resultHash.length,64);
 const review=await ctx.call('evaluate_practical_design',{inputHash,sources:['LIVE','TOTAL'].map(comboId=>({rcIterationId:started.iterationId,comboId}))});
 assert.equal(review.ok,true);assert.equal(review.summary.complete,false);
 const designSnapshot=ctx.bridge.getPracticalDesignSnapshot(review.evaluationId);
 assert.deepEqual(designSnapshot.sets.find(r=>r.source.comboId==='LIVE').set.stiffnessProvenance,stored.stiffnessByCombo.LIVE);
 assert.ok(review.checks.some(c=>c.rcIterationId===started.iterationId&&c.incomplete===true));
 const drawing=await ctx.call('export_design_drawings',{evaluationId:review.evaluationId,format:'svg',page:0});
 assert.equal(drawing.ok,true,JSON.stringify(drawing));
 assert.ok(drawing.artifactId);assert.deepEqual(drawing.analysisSources.find(s=>s.source.comboId==='LIVE').stiffnessProvenance,stored.stiffnessByCombo.LIVE);
 const artifact=await ctx.call('get_design_drawing_artifact',{artifactId:drawing.artifactId,offset:0,limit:128});assert.equal(artifact.ok,true);assert.equal(artifact.stale,false);
 await ctx.bridge.saveWorkflowCheckpoint({projectId:'P24-SYNTHETIC'});
 const restoredContext=designContext({SStructuresCheckpointStorage:checkpointStorage,SStructuresBuildIdentity:{version:'synthetic-rc-checkpoint'}});
 try{
  await restoredContext.bridge.restoreWorkflowCheckpoint({projectId:'P24-SYNTHETIC'});
  const restored=await restoredContext.call('get_rc_service_iteration',{iterationId:started.iterationId});
  assert.equal(restored.stale,false);assert.equal(restored.converged,true);assert.deepEqual(restored.stiffnessByCombo,stored.stiffnessByCombo);
  const restoredReview=await restoredContext.call('get_practical_design_result',{evaluationId:review.evaluationId});
  assert.equal(restoredReview.stale,false);assert.equal(restoredReview.summary.complete,false);
 }finally{await restoredContext.dispose();}
 const differentBuild=designContext({SStructuresCheckpointStorage:checkpointStorage,SStructuresBuildIdentity:{version:'different-build'}});
 try{await assert.rejects(differentBuild.bridge.restoreWorkflowCheckpoint({projectId:'P24-SYNTHETIC'}),{code:'INPUT_HISTORY_INVALID'});assert.throws(()=>differentBuild.bridge.getRcServiceIteration({iterationId:started.iterationId}),{code:'RC_ITERATION_REQUIRED'});}finally{await differentBuild.dispose();}

 const pending=ctx.call('run_rc_service_iteration',{inputHash,liveComboId:'LIVE'}).then(()=>assert.fail('cancelled operation resolved'),error=>error);
 assert.equal((await ctx.call('cancel_rc_service_iteration',{})).cancelled,true);
 const cancelled=await pending;assert.equal(cancelled.code,'CANCELLED');
 const memory=ctx.bridge.getResourceState();assert.ok(!Object.keys(memory.owners).some(key=>key.startsWith('rc-iteration-transient')));
 ctx.model.loads[0].P++;
 assert.equal((await ctx.call('get_rc_service_iteration',{iterationId:started.iterationId})).stale,true);
 assert.equal((await ctx.call('cancel_rc_service_iteration',{})).cancelled,false);
 assert.equal((await ctx.call('release_rc_service_iteration',{iterationId:started.iterationId})).released,true);
 assert.equal((await ctx.call('get_practical_design_result',{evaluationId:review.evaluationId})).stale,true);
 assert.ok(!Object.keys(ctx.bridge.getResourceState().owners).some(key=>key.startsWith('rc-service-iterations'))||Object.entries(ctx.bridge.getResourceState().owners).filter(([key])=>key.startsWith('rc-service-iterations')).every(([,value])=>value===0));
 console.log('PASS actual WebMCP -> bounded Worker -> stored RC iteration, chunk read and stale status');
}finally{await ctx.dispose();}

const candidates=designContext();
try{
 Object.assign(candidates.model,structuredClone(m));
 candidates.model.designDetails.reinforcement[0].stirrups={diameter:.01,spacing:.1,legs:2};
 const iteration=await candidates.call('run_rc_service_iteration',{inputHash:candidates.bridge.getWorkflowInputIdentity().inputHash,liveComboId:'LIVE'});
 const evaluation=await candidates.call('evaluate_practical_design',{inputHash:candidates.bridge.getWorkflowInputIdentity().inputHash,sources:['LIVE','TOTAL'].map(comboId=>({rcIterationId:iteration.iterationId,comboId}))});
 const plan=await candidates.call('plan_design_candidates',{evaluationId:evaluation.evaluationId,memberId:'AB',diameters:[25],spacings:[100],maxCandidates:1,maxMillis:10000});
 const started=await candidates.call('start_design_candidates',{planId:plan.planId,requestId:'rc-candidate'});let job;
 for(let i=0;i<800;i++){job=await candidates.call('get_design_candidates',{jobId:started.jobId});if(job.status!=='running')break;await new Promise(r=>setTimeout(r,10));}
 assert.ok(job.best,JSON.stringify(job));assert.equal(job.best.impact,'REANALYSIS_REQUIRED');
 let candidateText='',candidateOffset=0;
 do{const chunk=await candidates.call('get_design_candidate_detail',{jobId:job.jobId,candidateId:job.best.candidateId,offset:candidateOffset});candidateText+=chunk.chunk;candidateOffset=chunk.nextOffset;}while(candidateOffset!==null);
 const proof=JSON.parse(candidateText).analysisProof;assert.equal(proof.length,2);assert.ok(proof.every(p=>p.method==='rc-service-iteration'&&p.converged&&p.globalMethodQualified===false));
 for(const p of proof){assert.equal(p.stiffnessProvenance.appliedProfileHash.length,64);assert.equal(p.stiffnessProvenance.stiffnessMode,'effective-inertia');assert.notEqual(p.stiffnessProvenance.sourceModelHash,iteration.stiffnessByCombo[p.comboId].sourceModelHash,'candidate proof must bind the changed model');}
 const applied=await candidates.call('apply_design_candidate_and_review',{jobId:job.jobId,candidateId:job.best.candidateId,requestId:'rc-apply'});
 assert.equal(applied.ok,true,JSON.stringify(applied));assert.equal(applied.followUp.status,'completed');
 assert.ok(applied.followUp.sources.every(s=>s.rcIterationId&&s.rcIterationId!==iteration.iterationId));
 assert.equal(applied.followUp.summary.complete,false);
 console.log('PASS actual RC candidate exploration -> apply -> fresh RC iteration -> qualified-scope review');
}finally{await candidates.dispose();}
