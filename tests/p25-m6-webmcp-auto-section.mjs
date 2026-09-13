import assert from 'node:assert/strict';
import {designContext} from './fixtures/p24/context.js';
import {stagePracticalDesignInput} from '../src/modeling/practicalDesignInputs.js';
const spliceMode=process.env.P25_SECTION_SPLICES==='1',cancelMode=process.env.P25_SECTION_CANCEL==='1',restoreMode=process.env.P25_SECTION_RESTORE==='1',combined=process.env.P25_SECTION_COMBINED==='1'||restoreMode||cancelMode||spliceMode,barCount=combined?2:20;
const saved=new Map(),options={SStructuresCheckpointStorage:{get:async k=>structuredClone(saved.get(k)),put:async(k,v)=>saved.set(k,structuredClone(v)),delete:async k=>saved.delete(k)},SStructuresBuildIdentity:{version:'p25-continuation-test'}};
let ctx=designContext(options),m=ctx.model;
m.nodes=[{id:'A',x:0,y:0,z:0,support:'fixed'},{id:'B',x:0,y:0,z:3}];
m.members=[{id:'AB',n1:'A',n2:'B',type:'frame',matId:'concrete',secId:'rc3060'}];
m.loadCases=[{id:'D',type:'dead',name:'D'}];m.loads=[{id:'F',type:'nodal',node:'B',P:1000,dir:'-x',case:'D'}];
m.loadCombinations=[{id:'U',name:'U',type:'strength',factors:{D:1.4}}];
m.analysisCases=[{id:'E',name:'E',kind:'static',settings:{comboId:'U',pDeltaMethod:process.env.P24_PDELTA_METHOD||'off'}}];
stagePracticalDesignInput(m,{type:'section-record',id:'BASE',version:1,name:'1000x600 synthetic',shape:'RECT',dimensionUnit:'mm',B:1000,H:600,sourceNote:'bounded count-limit test'},[]);m.members[0].secId='BASE@1';
stagePracticalDesignInput(m,{type:'reinforcement-record',id:'R',name:'R',version:1,memberId:'AB',start:0,end:1,cover:0.04,barMaterialId:'steel@1',bars:[-1,1].flatMap(sign=>Array.from({length:barCount},(_,i)=>({y:sign*.2,z:-.44+.88*i/(barCount-1),diameter:20}))),stirrupDiameter:10,stirrupSpacing:150,stirrupLegs:2,sourceNote:'synthetic',strengthStandard:'KDS-142020-2022',reinforcementForm:'single-deformed'},[]);
if(spliceMode)for(const [i,indices] of [['1'],['2'],['3'],['4']].entries())stagePracticalDesignInput(m,{type:'splice-record',id:'SP'+i,name:'staggered synthetic',version:1,sourceNote:'synthetic',memberId:'AB',reinforcementId:'R@1',barIndices:indices,start:i%2?.7:.1,end:i%2?.9:.3,offsetY:i<2?.02:-.02,offsetZ:0,spliceType:'tension-B',spliceSystem:'ordinary-no-seismic-detail'},[]);
try {
 const plan=ctx.bridge.planElasticWorkflow({caseIds:['E']});
 const run=await ctx.bridge.runElasticWorkflow({plan,requestId:'auto-section-source'});assert.equal(run.ok,true);
 const inputHash=ctx.bridge.getWorkflowInputIdentity().inputHash;
 const evaluated=await ctx.call('evaluate_practical_design',{inputHash,sources:[{analysisRunId:run.steps[0].analysisRunId,comboId:'U'}]});
 const before=JSON.stringify(m);
 const cp=await ctx.call('plan_design_candidates',{evaluationId:evaluated.evaluationId,memberId:'AB',maxCandidates:1,maxMillis:10000});
 assert.ok(cp.generation.sectionCandidates?.length,JSON.stringify(cp));if(combined){assert.equal(cp.generation.sectionCandidates[0],null);assert.ok(cp.generation.regionConstraints.length);}else{assert.equal(cp.generation.architecturalFitVerified,false);assert.equal(cp.generation.longitudinalProposalUnavailable,'LONGITUDINAL_COUNT_LIMIT');}
 const started=await ctx.call('start_design_candidates',{planId:cp.planId,requestId:'auto-section-job'});
 if(cancelMode)await ctx.call('cancel_design_candidates',{jobId:started.jobId});
 let job;for(let i=0;i<100;i++){job=await ctx.call('get_design_candidates',{jobId:started.jobId});if(job.status!=='running')break;await new Promise(r=>setTimeout(r,10));}
 if(restoreMode){
  await ctx.bridge.saveWorkflowCheckpoint({projectId:'P24-SYNTHETIC'});await ctx.dispose();ctx=designContext(options);await ctx.bridge.restoreWorkflowCheckpoint({projectId:'P24-SYNTHETIC'});m=ctx.model;
  const restored=await ctx.call('get_design_candidates',{jobId:job.jobId});assert.equal(restored.nextCursor,job.nextCursor);assert.equal(restored.stale,false);
 }
 if(combined){
  const prior=job;const next=await ctx.call('resume_design_candidates',{jobId:prior.jobId,requestId:'continue-section',maxCandidates:cancelMode?4:3,maxMillis:10000});
  assert.notEqual(next.jobId,prior.jobId);assert.equal(next.previousJobId,prior.jobId);
  assert.equal((await ctx.call('resume_design_candidates',{jobId:prior.jobId,requestId:'continue-section',maxCandidates:cancelMode?4:3,maxMillis:10000})).jobId,next.jobId);
  for(let i=0;i<700;i++){job=await ctx.call('get_design_candidates',{jobId:next.jobId});if(job.status!=='running')break;await new Promise(r=>setTimeout(r,10));}
  assert.ok(job.candidates.every(c=>!prior.candidates.some(p=>p.candidateId===c.candidateId)));assert.equal(job.candidateCount,cancelMode?4:3);
 }
 const selected=combined?job.candidates.find(c=>c.changes?.section):job.best;assert.ok(selected,JSON.stringify(job));if(combined)assert.equal(selected.analysisProofCount,1);
 assert.equal(job.status,'BUDGET_EXHAUSTED',JSON.stringify(job));assert.equal(selected.impact,'REANALYSIS_REQUIRED');
 if(!combined){
 assert.equal(job.best.analysisProof.length,1);assert.equal(job.best.analysisProof[0].isolated,true);
 assert.equal(job.best.analysisProof[0].method,process.env.P24_PDELTA_METHOD||'off');
 assert.notEqual(job.best.analysisProof[0].candidateInputHash,inputHash);
 }
 assert.equal(JSON.stringify(m),before,'isolated candidate solve does not modify active model');
 if(spliceMode){
  assert.equal(selected.spliceChangeCount,4);let offset=0,content='',hash;
  do{const part=await ctx.call('get_design_candidate_detail',{jobId:job.jobId,candidateId:selected.candidateId,offset,limit:4096});assert.ok(!hash||hash===part.detailHash);hash=part.detailHash;content+=part.chunk;offset=part.nextOffset;}while(offset!==null);
  const cache=(await ctx.call('get_practical_design_context')).candidateDetailCache;assert.ok(cache.hits>0);assert.equal(cache.serializedRecords,1);
  const detail=JSON.parse(content);console.log('CANDIDATE_CLOSURE '+JSON.stringify(detail.completionBlockers));assert.ok(detail.completionBlockers.rows.some(r=>r.requiredInputRecords?.some(t=>t.type==='foundation-record'&&t.nodeId==='A')));assert.ok(detail.completionBlockers.rows.some(r=>r.inputTargets?.some(t=>t.id==='R'&&t.version===2)&&r.requiredInputFields.includes('anchorageStandard')));assert.equal(detail.affectedScope.supported,true);assert.equal(detail.affectedScope.complete,false);assert.ok(detail.affectedScope.entityIds.includes('AB'));assert.equal(detail.spliceChanges.length,4);assert.ok(detail.spliceChanges.every(s=>s.before.reinforcementId==='R@1'&&s.after.reinforcementId==='R@2'&&!s.geometryQualified));assert.deepEqual(detail.spliceChanges.flatMap(s=>s.after.barIndices).map(Number).sort((a,b)=>a-b),[1,2,3,4,5,6]);
 }
 const basis=await ctx.call('get_design_candidate_basis',{jobId:job.jobId,candidateId:selected.candidateId});
 assert.ok(basis.rows.some(x=>x.applied.some(r=>r.code==='KDS 14 20 20')));
 const applied=await ctx.call('apply_design_candidate_and_review',{jobId:job.jobId,candidateId:selected.candidateId,requestId:'section-apply'});
 assert.equal(applied.ok,true);assert.equal(applied.followUp.status,'completed');assert.notEqual(applied.followUp.sources[0].analysisRunId,run.steps[0].analysisRunId);assert.equal(applied.followUp.summary.complete,false);
 if(combined)await assert.rejects(ctx.call('resume_design_candidates',{jobId:job.jobId,requestId:'stale-continuation'}),{code:'STALE_INPUT'});
 if(spliceMode){const rows=m.designDetails.splices.filter(s=>s.version===2);assert.equal(rows.length,4);assert.ok(rows.every(s=>s.reinforcementId==='R@2'));assert.deepEqual(rows.flatMap(s=>s.barIndices).map(Number).sort((a,b)=>a-b),[1,2,3,4,5,6]);assert.deepEqual(rows.map(s=>[s.start,s.end]),[[.1,.3],[.7,.9],[.1,.3],[.7,.9]]);}
 assert.notEqual(m.members[0].secId,'BASE@1');assert.equal(m.designDetails.reinforcement.length,2);
 assert.equal((await ctx.call('get_practical_design_result',{evaluationId:evaluated.evaluationId})).stale,true);
 console.log('PASS actual isolated section candidate CPU/Direct reanalysis, KDS trace, atomic apply and stale source');
}finally{await ctx.dispose();}
