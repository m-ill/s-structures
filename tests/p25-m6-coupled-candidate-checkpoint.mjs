import assert from 'node:assert/strict';
import {designContext} from './fixtures/p24/context.js';
import {createModel} from '../src/core/model.js';
import {stagePracticalDesignInput} from '../src/modeling/practicalDesignInputs.js';
import {stableHash} from '../src/core/stableHash.js';
const data=new Map(),storage={get:async k=>structuredClone(data.get(k)),put:async(k,v)=>data.set(k,structuredClone(v)),delete:async k=>data.delete(k)};
const options={SStructuresCheckpointStorage:storage,SStructuresBuildIdentity:{version:'synthetic-coupled-checkpoint'}};
const ctx=designContext(options);
try{
 const m=createModel();m.meta={...m.meta,projectId:'P24-SYNTHETIC'};
 m.nodes=[{id:'A',x:0,y:0,z:0,support:'fixed'},{id:'B',x:3,y:0,z:0}];m.members=[{id:'AB',type:'frame',n1:'A',n2:'B',matId:'concrete',secId:'rc3060'}];
 m.loadCases=[{id:'D',name:'D',type:'dead'}];m.loadCombinations=[{id:'SERVICE',name:'SERVICE',type:'service',factors:{D:1}}];m.loads=[{id:'N',type:'nodal',node:'B',dir:'-x',P:50,case:'D'}];m.analysisSettings.pDeltaMethod='off';
 stagePracticalDesignInput(m,{type:'reinforcement-record',id:'R',name:'R',version:1,memberId:'AB',start:0,end:1,cover:.04,barMaterialId:'steel@1',bars:[-.2,.2].flatMap(y=>[-.09,.09].map(z=>({y,z,diameter:20}))),sourceNote:'synthetic',concreteWeight:'normal',stirrupDiameter:10,stirrupLegs:2,stirrupSpacing:100},[]);
 Object.assign(ctx.model,m);
 const inputHash=ctx.bridge.getWorkflowInputIdentity().inputHash;
 const original=await ctx.call('run_rc_service_iteration',{inputHash,stiffnessMode:'fully-cracked-elastic',comboIds:['SERVICE'],spatialTolerance:.001,maxRefinements:1});assert.equal(original.converged,true);
 const review=await ctx.call('evaluate_practical_design',{inputHash,sources:[{rcIterationId:original.iterationId,comboId:'SERVICE'}]});assert.equal(review.ok,true);
 const plan=await ctx.call('plan_design_candidates',{evaluationId:review.evaluationId,memberId:'AB',diameters:[25],barsPerFace:[2],spacings:[100],maxCandidates:1,maxMillis:10000});
 const started=await ctx.call('start_design_candidates',{planId:plan.planId,requestId:'coupled-candidate'});let job;
 for(let i=0;i<800;i++){job=await ctx.call('get_design_candidates',{jobId:started.jobId});if(job.status!=='running')break;await new Promise(r=>setTimeout(r,10));}
 assert.ok(job.best,JSON.stringify(job));assert.equal(job.best.impact,'REANALYSIS_REQUIRED');
 let text='',offset=0;do{const chunk=await ctx.call('get_design_candidate_detail',{jobId:job.jobId,candidateId:job.best.candidateId,offset});text+=chunk.chunk;offset=chunk.nextOffset;}while(offset!==null);
 const candidate=JSON.parse(text);assert.ok(candidate.analysisProof[0].profileHash);assert.equal(candidate.analysisProof[0].globalMethodQualified,false);
 const applied=await ctx.call('apply_design_candidate_and_review',{jobId:job.jobId,candidateId:job.best.candidateId,requestId:'coupled-apply'});
 assert.equal(applied.ok,true,JSON.stringify(applied));assert.equal(applied.followUp.status,'completed');assert.equal(applied.followUp.summary.complete,false);
 const newId=applied.followUp.sources[0].rcIterationId;assert.notEqual(newId,original.iterationId);
 const meta=ctx.bridge.getRcServiceIterationMetadata(newId);assert.equal(meta.policySettings.stiffnessMode,'fully-cracked-elastic');assert.equal(meta.policySettings.spatialTolerance,.001);assert.equal(meta.policySettings.maxRefinements,1);assert.equal(meta.spatialConverged,true);
 await ctx.bridge.saveWorkflowCheckpoint({projectId:'P24-SYNTHETIC'});
 await assert.rejects(ctx.bridge.restoreWorkflowCheckpoint({projectId:'P24-SYNTHETIC'}),{code:'CHECKPOINT_RESTORE_REQUIRES_EMPTY_RUNTIME'});
 assert.equal(ctx.bridge.getRcServiceIterationMetadata(newId).resultHash,meta.resultHash,'restore guard must preserve live coupled results');
 const restored=designContext(options);
 try{
  await restored.bridge.restoreWorkflowCheckpoint({projectId:'P24-SYNTHETIC'});
  const after=restored.bridge.getRcServiceIterationMetadata(newId);assert.equal(after.stale,false);assert.equal(after.resultHash,meta.resultHash);assert.equal(stableHash(after.policySettings),stableHash(meta.policySettings));
  const nextReview=await restored.call('evaluate_practical_design',{inputHash:after.inputHash,sources:[{rcIterationId:newId,comboId:'SERVICE'}]});assert.equal(nextReview.ok,true);assert.equal(nextReview.summary.complete,false);
 }finally{await restored.dispose();}
 console.log('PASS actual coupled candidate -> apply/reanalysis -> spatial policy preservation -> checkpoint restore/review');
}finally{await ctx.dispose();}
