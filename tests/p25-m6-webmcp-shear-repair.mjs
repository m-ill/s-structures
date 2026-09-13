import assert from 'node:assert/strict';
import {stagePracticalDesignInput} from '../src/modeling/practicalDesignInputs.js';
import {designContext} from './fixtures/p24/context.js';
const data=new Map(),storage={get:async k=>structuredClone(data.get(k)),put:async(k,v)=>data.set(k,structuredClone(v)),delete:async k=>data.delete(k)};
const options={SStructuresCheckpointStorage:storage,SStructuresBuildIdentity:{version:'synthetic-shear-provenance'}};
const ctx=designContext(options),m=ctx.model;
try{
 m.nodes=[{id:'A',x:0,y:0,z:0,support:'fixed'},{id:'B',x:3,y:0,z:0}];m.members=[{id:'AB',type:'frame',n1:'A',n2:'B',matId:'concrete',secId:'C@1'}];
 m.loadCases=[{id:'D',type:'dead',name:'D'}];m.loads=[{id:'F',type:'nodal',node:'B',dir:'-z',P:85,case:'D'}];m.loadCombinations=[{id:'U',type:'strength',name:'U',factors:{D:1.4}}];m.analysisCases=[{id:'E',name:'E',kind:'static',status:'not-run',settings:{comboId:'U',pDeltaMethod:'off'}}];
 const c=.05+.01/Math.sqrt(2),bars=[-1,1].flatMap(y=>[-1,1].map(z=>({y:y*.18,z:z*.08,diameter:20})));
 const detail={type:'reinforcement-record',id:'R',name:'synthetic anchor column',version:1,sourceNote:'synthetic',memberId:'AB',start:0,end:1,cover:.04,barMaterialId:'steel@1',bars,stirrupDiameter:10,stirrupSpacing:400,stirrupLegs:2,concreteWeight:'normal',shearStandard:'KDS-142022-2022',shearScope:'ordinary-prismatic-no-opening',memberRole:'flexural-member',reinforcementForm:'single-deformed',stirrupForm:'closed-rectangular-two-leg',confinementStandard:'KDS-142050-2022',confinementSystem:'ordinary-flexural-member',tieClosure:'standard-135',tieClosureCorner:'+y+z',tieClosureSeparation:.03,tieHookTail:.06,tieBendInsideRadius:.02,tieFirstStart:.18,tieFirstEnd:.18,topAnchorBolts:false,anchorBoltTieEnd:'end'};
 stagePracticalDesignInput(m,{type:'section-record',id:'C',name:'240 square',version:1,shape:'RECT',dimensionUnit:'mm',B:300,H:500,sourceNote:'synthetic'},[]);
 const preview=await ctx.call('preview_design_changes',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,requestId:'anchor-preview',commands:[{...detail,end:.5},{...detail,id:'R2',start:.5}]});
 assert.equal((await ctx.call('apply_design_changes',{handle:preview.handle,requestId:'anchor-apply'})).ok,true);
 const run=await ctx.bridge.runElasticWorkflow({plan:ctx.bridge.planElasticWorkflow({caseIds:['E']}),requestId:'anchor-run'});
 const result=await ctx.call('evaluate_practical_design',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,sources:[{analysisRunId:run.steps[0].analysisRunId,comboId:'U'}]});
 const check=ctx.bridge.getPracticalDesignSnapshot(result.evaluationId).checks.find(c=>c.checkId==='rc-shear-y');
 assert.equal(check.status,'NG',JSON.stringify(check));
 const plan=await ctx.call('plan_design_candidates',{evaluationId:result.evaluationId,memberId:'AB',maxCandidates:1,maxMillis:10000});
 assert.equal(plan.generation.ok,true,JSON.stringify(plan));assert.equal(plan.generation.regionConstraints.length,2,JSON.stringify(plan));assert.ok(plan.generation.regionConstraints.every(r=>r.tieFirstStarts?.[0]<.18&&r.tieFirstEnds?.[0]<.18),JSON.stringify(plan));
 const start=await ctx.call('start_design_candidates',{planId:plan.planId,requestId:'shear-start'});let job;
 for(let i=0;i<500;i++){job=await ctx.call('get_design_candidates',{jobId:start.jobId});if(job.status!=='running')break;await new Promise(r=>setTimeout(r,10));}
 assert.ok(job.best,JSON.stringify(job));
 const applied=await ctx.call('apply_design_candidate_and_review',{jobId:start.jobId,candidateId:job.best.candidateId,requestId:'shear-apply'});
 assert.equal(applied.followUp.status,'completed',JSON.stringify(applied));
 const repaired=ctx.bridge.getPracticalDesignSnapshot(applied.followUp.evaluationId).checks.find(c=>c.checkId==='rc-shear-y');
 assert.equal(repaired.status,'OK',JSON.stringify(repaired));assert.ok(repaired.codeReferences.length);
 const ties=ctx.bridge.getPracticalDesignSnapshot(applied.followUp.evaluationId).checks.find(c=>c.checkId==='rc-confinement');
 assert.ok(ties.tieSpacingRequirements.length===2);assert.ok(ties.tieSpacingRequirements.every(r=>!r.needsRepair),JSON.stringify(ties));
 assert.ok(ctx.bridge.getPracticalDesignSnapshot(applied.followUp.evaluationId).checks.some(c=>c.status==='NOT_CHECKED'||c.incomplete),'unrelated incomplete checks must remain visible');
 const fullComparison=ctx.bridge.getPracticalDesignSnapshot(applied.followUp.evaluationId).designComparisonDetails;
 const provenance=fullComparison.proposalProvenance;
 assert.equal(applied.followUp.comparison.proposalProvenance.proposalHash,provenance.proposalHash);
 assert.ok(provenance.proposalHash);assert.equal(provenance.missingBasisCheckCount,0);assert.ok(provenance.codeReferences.some(r=>r.code==='KDS 14 20 22'),JSON.stringify(provenance));
 const artifact=await ctx.call('export_design_drawings',{evaluationId:applied.followUp.evaluationId,format:'json'});
 assert.deepEqual(artifact.designComparison.proposalProvenance,provenance);
 await ctx.bridge.saveWorkflowCheckpoint({projectId:'P24-SYNTHETIC'});
 const restored=designContext(options);try{
  await restored.bridge.restoreWorkflowCheckpoint({projectId:'P24-SYNTHETIC'});
  assert.deepEqual(restored.bridge.getPracticalDesignSnapshot(applied.followUp.evaluationId).designComparisonDetails.proposalProvenance,provenance);
 }finally{await restored.dispose();}
 console.log('PASS actual WebMCP shear NG -> generated spacing -> applied candidate -> KDS recheck');
}finally{await ctx.dispose();}
