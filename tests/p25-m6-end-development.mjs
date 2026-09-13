import assert from 'node:assert/strict';
import {memberEndDevelopmentProposal} from '../src/compute/product/memberEndDevelopmentProposal.js';
const command={type:'reinforcement-record',id:'R',version:1,memberId:'M',anchorageStandard:'KDS-142052-2024',anchorageMode:'straight-tension',anchorageStartCriticalX:0,anchorageEndCriticalX:3,startExtension:0,endExtension:.1};
const check={id:'C',entityId:'M',checkId:'rc-anchorage',status:'NG',calculations:[{detailId:'R',detailVersion:1,bar:0,end:'start',kind:'development',requiredMm:420,providedMm:-40,source:{clause:'fixture'}},{detailId:'R',detailVersion:1,bar:1,end:'start',kind:'development',requiredMm:500,providedMm:-40,source:{clause:'fixture'}},{detailId:'R',detailVersion:1,bar:0,end:'end',kind:'development',requiredMm:420,providedMm:60,source:{clause:'fixture'}}]};
const proposal=memberEndDevelopmentProposal([command],[check]);assert.equal(proposal.ok,true);assert.deepEqual(proposal.regionConstraints,[{detailId:'R',startExtensions:[.55],endExtensions:[.475]}]);assert.equal(command.startExtension,0);assert.equal(proposal.siteFitVerified,false);
assert.equal(memberEndDevelopmentProposal([{...command,version:2}],[check]).ok,false);assert.equal(memberEndDevelopmentProposal([{...command,locked:true}],[check]).ok,false);
assert.equal(memberEndDevelopmentProposal([command],[{...check,calculations:[{...check.calculations[0],requiredMm:6000}]}]).ok,false);
console.log('PASS end-development candidates use maximum recorded deficits, version and bounded extensions');

import {designContext} from './fixtures/p24/context.js';
const ctx=designContext(),m=ctx.model;
try{
 m.nodes=[{id:'A',x:0,y:0,z:0,support:'fixed'},{id:'B',x:3,y:0,z:0}];m.members=[{id:'AB',type:'frame',n1:'A',n2:'B',matId:'concrete',secId:'rc3060'}];m.loadCases=[{id:'D',type:'dead',name:'D'}];m.loads=[{id:'P',type:'nodal',node:'B',P:1,dir:'-z',case:'D'}];m.loadCombinations=[{id:'U',type:'strength',name:'U',factors:{D:1.4}}];m.analysisCases=[{id:'E',name:'E',kind:'static',status:'not-run',settings:{comboId:'U',pDeltaMethod:'off'}}];
 const detail={type:'reinforcement-record',id:'R',name:'synthetic',version:1,memberId:'AB',start:0,end:1,cover:.04,barMaterialId:'steel@1',sourceNote:'test',bars:[{y:-.2,z:0,diameter:20}],reinforcementForm:'single-deformed',anchorageStandard:'KDS-142052-2024',anchorageMode:'straight-tension',concreteWeight:'normal',barPosition:'other',barCoating:'uncoated',lapRequired:false,startFabricationShape:'straight',endFabricationShape:'straight',endSetbackStart:.04,endSetbackEnd:.04,anchorageStartCriticalX:0,anchorageEndCriticalX:3,startExtension:0,endExtension:0};
 const preview=await ctx.call('preview_design_changes',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,requestId:'preview',commands:[detail]});assert.equal((await ctx.call('apply_design_changes',{handle:preview.handle,requestId:'input'})).ok,true);
 const run=await ctx.bridge.runElasticWorkflow({plan:ctx.bridge.planElasticWorkflow({caseIds:['E']}),requestId:'source'});assert.equal(run.ok,true);
 const evaluated=await ctx.call('evaluate_practical_design',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,sources:[{analysisRunId:run.steps[0].analysisRunId,comboId:'U'}]});
 const before=ctx.bridge.getPracticalDesignSnapshot(evaluated.evaluationId).checks.find(c=>c.checkId==='rc-anchorage');assert.equal(before.status,'NG');assert.ok(before.calculations.every(r=>r.providedMm<0));
 const {memberCandidateCommands}=await import('../src/design/rc/memberCandidateCommands.js');
 const {practicalCommandFromRecord}=await import('../src/modeling/practicalInputContract.js');
 const sourceCommand=practicalCommandFromRecord('reinforcement-record',m.designDetails.reinforcement[0]);
 const {coupleMemberCandidateDevelopment}=await import('../src/compute/product/memberCandidateDevelopment.js');
 const coupled=coupleMemberCandidateDevelopment(m,memberCandidateCommands(m,[sourceCommand],{diameter:25}));
 assert.equal(coupled.endDevelopment[0].status,'ADJUSTED');assert.ok(coupled.commands[0].startExtension>0);assert.equal(coupled.endDevelopment[0].anchorageStatus,'OK');assert.equal(m.designDetails.reinforcement[0].startExtension,0);
 const {runCandidateGeometry}=await import('../src/compute/product/candidateAnalysisClient.js');
 const {createResourceBudget}=await import('../src/core/resourceBudget.js');
 const geometryBudget=createResourceBudget({maxBytes:128*1024*1024});
 const workerCoupled=await runCandidateGeometry({model:m,settings:{originalCommands:[sourceCommand],options:{diameter:25,coupleEndDevelopment:true}},budget:geometryBudget,workerReservationBytes:32*1024*1024,timeoutMs:5000});
 assert.deepEqual(workerCoupled,coupled);assert.equal(geometryBudget.snapshot().totalBytes,0);
 const fourBars={...sourceCommand,stirrupDiameter:10,stirrupSpacing:200,stirrupLegs:2,bars:[-1,1].flatMap(y=>[-1,1].map(z=>({y:y*.2,z:z*.08,diameter:20})))};
 const resized=coupleMemberCandidateDevelopment(m,memberCandidateCommands(m,[fourBars],{diameter:25,section:{B:400,H:700}}),{section:{B:400,H:700}});assert.equal(resized.endDevelopment[0].anchorageStatus,'OK');assert.equal(m.members[0].secId,'rc3060');
 const explicit=memberCandidateCommands(m,[sourceCommand],{diameter:25,regionEdits:{R:{startExtension:.1,endExtension:.1}}});assert.equal(explicit.commands[0].startExtension,.1,'explicit candidate values are not silently repaired');
 const plan=await ctx.call('plan_design_candidates',{evaluationId:evaluated.evaluationId,memberId:'AB',maxCandidates:1,maxMillis:10000});assert.equal(plan.generation.ok,true);
 const started=await ctx.call('start_design_candidates',{planId:plan.planId,requestId:'search'});let job;for(let i=0;i<500;i++){job=await ctx.call('get_design_candidates',{jobId:started.jobId});if(job.status!=='running')break;await new Promise(r=>setTimeout(r,10));}assert.ok(job.best,JSON.stringify(job));assert.ok(job.best.changes.endDevelopment.length>0);assert.equal(job.best.changes.endDevelopment[0].codeReferences,undefined);assert.equal(job.best.objective.quantityComplete,false);assert.equal(job.best.objective.secondaryFallback,null);
 let candidateText='',candidateOffset=0;for(;;){const part=await ctx.call('get_design_candidate_detail',{jobId:job.jobId,candidateId:job.best.candidateId,offset:candidateOffset,limit:4096});candidateText+=part.chunk;if(part.nextOffset===null)break;candidateOffset=part.nextOffset;}
 const candidateDetail=JSON.parse(candidateText),endChange=candidateDetail.reinforcementChanges[0];assert.ok(endChange.changedFields.includes('startExtension'));assert.ok(endChange.changedFields.includes('endExtension'));assert.equal(endChange.units.startExtension,'m');assert.equal(candidateDetail.changes.endDevelopment[0].codeReferences.length>0,true);
 const applied=await ctx.call('apply_design_candidate_and_review',{jobId:job.jobId,candidateId:job.best.candidateId,requestId:'repair'});assert.equal(applied.ok,true,JSON.stringify(applied));
 const after=ctx.bridge.getPracticalDesignSnapshot(applied.followUp.evaluationId),anchorage=after.checks.find(c=>c.checkId==='rc-anchorage');assert.equal(anchorage.status,'OK',JSON.stringify(anchorage));assert.ok(anchorage.calculations.every(c=>c.requiredMm<=c.providedMm&&c.source));assert.equal(after.summary.complete,false);
 const records=await ctx.call('get_design_records',{channel:'reinforcement',id:'R'}),stored=records.rows[0];assert.ok(stored.startExtension>0&&stored.endExtension>0);assert.equal(stored.anchorageStartCriticalX,0);assert.equal(stored.anchorageEndCriticalX,3);assert.equal(stored.bars[0].diameter,.02);
 const quantity=after.preparedDetails.reinforcement[stored.id+'@'+stored.version].longitudinalQuantity;
 const expectedLength=3+stored.startExtension+stored.endExtension-stored.endSetbackStart-stored.endSetbackEnd;
 assert.equal(quantity.status,'OK');assert.ok(Math.abs(quantity.totalLength-expectedLength)<1e-10);assert.ok(Math.abs(quantity.volume-expectedLength*stored.bars[0].area)<1e-12);
 assert.ok(Math.abs(job.best.objective.longitudinalVolume-quantity.volume)<1e-12);
 assert.equal((await ctx.call('undo_design_input',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash})).ok,true);
 console.log('PASS actual WebMCP unreachable ends -> automatic extension -> both-end KDS OK -> undo; whole design incomplete');
}finally{await ctx.dispose();}

const startOnly=memberEndDevelopmentProposal([{...command,endExtension:.113}],[{...check,calculations:[check.calculations[0]]}]);assert.equal(startOnly.regionConstraints[0].endExtensions,undefined,'preserve an adequate non-grid end');
