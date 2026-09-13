import assert from 'node:assert/strict';
import {designContext} from './fixtures/p24/context.js';
import {stagePracticalDesignInput} from '../src/modeling/practicalDesignInputs.js';
import {memberSpliceLengthProposal} from '../src/compute/product/memberSpliceLengthProposal.js';
import {evaluateMemberSplices} from '../src/design/rc/spliceGeometry.js';
const noncontact=process.env.P25_CLASS_A_NONCONTACT==='1';
const noRefine=process.env.P25_CLASS_A_NO_REFINE==='1',freshMode=process.env.P25_CLASS_A_FRESH==='1'||noRefine||noncontact,ctx=designContext(),m=ctx.model;
try{
 m.nodes=[{id:'A',x:0,y:0,z:0,support:'fixed'},{id:'B',x:4,y:0,z:0}];m.members=[{id:'AB',type:'frame',n1:'A',n2:'B',matId:'concrete',secId:'rc3060'}];
 const bars={type:'reinforcement-record',id:'R',name:'test',version:1,memberId:'AB',start:0,end:1,cover:.04,strengthStandard:'KDS-142020-2022',barMaterialId:'steel@1',sourceNote:'synthetic',bars:[{y:-.2,z:-.06,diameter:20},{y:-.2,z:.06,diameter:20}],reinforcementForm:'single-deformed',concreteWeight:'normal',barPosition:'other',barCoating:'uncoated',lapRequired:true,aggregateMaxSize:.02,stirrupDiameter:10,stirrupSpacing:150,stirrupLegs:2,startFabricationShape:'straight',endFabricationShape:'straight',endSetbackStart:.04,endSetbackEnd:.04};
 const splice={type:'splice-record',id:'SP',name:'test',version:1,sourceNote:'synthetic',memberId:'AB',reinforcementId:'R@1',barIndices:['1'],start:.48,end:.52,offsetY:0,offsetZ:.02,continuationSide:'offset-toward-end',spliceType:'tension-A',spliceSystem:'ordinary-no-seismic-detail'};
 if(noncontact)splice.offsetZ=.06;
 for(const c of [bars,splice])stagePracticalDesignInput(m,c,[]);
 const tuples=[0,2,4].map(x=>({x,N:0,My:0,Mz:1,T:0})),row={...evaluateMemberSplices(m,m.members[0],tuples),id:'CHECK',entityId:'AB',checkId:'rc-splices'};
 assert.equal(row.status,'NG');assert.equal(row.checks[0].classAProof.status,'OK');
 const before=JSON.stringify(m),proposal=memberSpliceLengthProposal(m,[bars],[row]);assert.equal(proposal.ok,true,JSON.stringify(proposal));assert.equal(JSON.stringify(m),before);
 for(const field of ['classAProof','calculation'])assert.equal(memberSpliceLengthProposal(m,[bars],[{...row,checks:row.checks.map(r=>({...r,[field]:undefined}))}]).ok,false);
 assert.equal(memberSpliceLengthProposal(m,[bars],[{...row,checks:row.checks.map(r=>({...r,spliceVersion:99}))}]).ok,false);
 const repaired={...m,designDetails:{...m.designDetails,splices:[{...m.designDetails.splices[0],...proposal.spliceRepairs[0]}]}};assert.equal(evaluateMemberSplices(repaired,m.members[0],tuples).status,'OK');
 if(!freshMode){const separated={...m,designDetails:{...m.designDetails,splices:[{...m.designDetails.splices[0],id:'LEFT',start:.1,end:.12},{...m.designDetails.splices[0],id:'RIGHT',barIndices:['2'],start:.88,end:.9}]}};
 const separatedCheck={...evaluateMemberSplices(separated,m.members[0],tuples),id:'SEPARATED',entityId:'AB',checkId:'rc-splices'};assert.ok(separatedCheck.checks.every(r=>r.classAProof?.status==='OK'));
 const widened=memberSpliceLengthProposal(separated,[bars],[separatedCheck]);if(!freshMode){assert.equal(widened.ok,false,JSON.stringify(widened));assert.equal(widened.unavailable.length,2);assert.ok(widened.unavailable.every(r=>r.reason==='CLASS_A_EXTENDED_WINDOW_NOT_QUALIFIED'&&r.splicedFraction===1));}
 }
 assert.equal(memberSpliceLengthProposal(m,[{...bars,locked:true}],[row]).ok,false);
 if(noncontact){
  const {memberCandidateCommands}=await import('../src/design/rc/memberCandidateCommands.js');
  const edge=structuredClone(m),edgeBars={...bars,bars:bars.bars.map((b,i)=>({...b,z:i?.065:b.z}))};
  edge.designDetails.reinforcement[0].bars[1].z=.065;Object.assign(edge.designDetails.splices[0],{barIndices:['2'],offsetZ:.02});
  const next=memberCandidateCommands(edge,[edgeBars],{diameter:25});
  assert.throws(()=>{for(const c of next.commands)stagePracticalDesignInput(edge,c,[]);},/SPLICE_BAR_OUTSIDE_SECTION/);
 }
 m.loadCases=[{id:'D',type:'dead',name:'D'}];m.loads=[{id:'F',type:'nodal',node:'B',dir:'-z',P:1,case:'D'}];m.loadCombinations=[{id:'U',type:'strength',name:'U',factors:{D:1.4}}];m.analysisCases=[{id:'E',name:'E',kind:'static',status:'not-run',settings:{comboId:'U',pDeltaMethod:'off'}}];
 const run=await ctx.bridge.runElasticWorkflow({plan:ctx.bridge.planElasticWorkflow({caseIds:['E']}),requestId:'source'});assert.equal(run.ok,true);
 const evaluated=await ctx.call('evaluate_practical_design',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,sources:[{analysisRunId:run.steps[0].analysisRunId,comboId:'U'}]});
 const plan=await ctx.call('plan_design_candidates',{evaluationId:evaluated.evaluationId,memberId:'AB',maxCandidates:1,maxMillis:10000,...(freshMode?{diameters:[25],repairSpliceLengths:!noRefine}:{})});if(!freshMode)assert.equal(plan.generation.spliceRepairs.length,1);
 const start=await ctx.call('start_design_candidates',{planId:plan.planId,requestId:'search'});let job;for(let i=0;i<500;i++){job=await ctx.call('get_design_candidates',{jobId:start.jobId});if(job.status!=='running')break;await new Promise(r=>setTimeout(r,10));}assert.ok(job.best,JSON.stringify(job));if(noRefine)assert.equal(job.best.changes.spliceRefinement.length,0);else if(freshMode){assert.equal(job.best.changes.spliceRefinement.length,1);assert.equal(job.best.changes.spliceRefinement[0].ok,true);assert.equal(job.best.changes.spliceRefinement[0].changes,undefined);assert.equal(job.best.changes.spliceRefinement[0].changeCount,1);assert.equal(job.best.changes.spliceRefinementState.status,'RESOLVED_LENGTH_ONLY');}else{assert.equal(job.best.changes.spliceDevelopment[0].requiresAnalysisProof,true);assert.equal(job.best.changes.spliceDevelopment[0].incomplete,true);}
 if(freshMode){
  let text='',offset=0;for(;;){const part=await ctx.call('get_design_candidate_detail',{jobId:job.jobId,candidateId:job.best.candidateId,offset,limit:4096});text+=part.chunk;if(part.nextOffset===null)break;offset=part.nextOffset;}
  const packet=JSON.parse(text);if(!noRefine)assert.ok(packet.changes.spliceRefinement[0].changes[0].requiredLength>proposal.spliceRepairs[0].requiredLength);assert.equal(packet.spliceChanges[0].after.version,2);assert.equal(packet.spliceChanges[0].after.reinforcementId,'R@2');if(noncontact){assert.ok(Math.abs(packet.spliceChanges[0].after.offsetZ-.065)<1e-12);assert.ok(Math.abs(packet.spliceChanges[0].after.offsetZ-.025-(splice.offsetZ-.02))<1e-12);}
  const {renderSpliceChanges}=await import('../src/ui/spliceChangeView.js'),{createFakeIndexDocument}=await import('./helpers/fakeIndexDom.mjs');const doc=createFakeIndexDocument(),view=doc.createElement('div');renderSpliceChanges(doc,view,packet.spliceChanges,packet.changes);assert.equal(view.querySelectorAll('td').some(n=>n.textContent==='해석 후 보완'),!noRefine);if(noRefine){assert.equal(packet.spliceChanges[0].after.start,splice.start);assert.equal(packet.spliceChanges[0].after.end,splice.end);}
 }
 const applied=await ctx.call('apply_design_candidate_and_review',{jobId:job.jobId,candidateId:job.best.candidateId,requestId:'repair'});assert.equal(applied.ok,true,JSON.stringify(applied));
 const after=ctx.bridge.getPracticalDesignSnapshot(applied.followUp.evaluationId),check=after.checks.find(c=>c.checkId==='rc-splices');assert.equal(check.status,noRefine?'NG':'OK',JSON.stringify(check));assert.equal(check.checks[0].classAProof.actualPieceEnvelope.layoutCount,2);assert.equal(check.checks[0].calculation.spliceClass,'A');assert.ok(check.codeReferences.length);assert.equal(after.summary.complete,false);
 assert.equal(m.designDetails.reinforcement.length,freshMode?2:1);assert.equal(m.designDetails.splices.at(-1).version,2);assert.equal((await ctx.call('undo_design_input',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash})).ok,true);
 if(freshMode){const released=await ctx.call('release_design_candidates',{jobId:job.jobId});assert.equal(released.releasedJobs,1);assert.ok(released.releasedManagedBytes>0);assert.ok(released.releasedCacheEntries>0);assert.equal((await ctx.call('release_design_candidates',{jobId:job.jobId})).releasedJobs,0);assert.deepEqual(ctx.bridge.getPracticalDesignSnapshot(applied.followUp.evaluationId).summary,after.summary);}
 console.log('PASS proven Class A length deficit -> bounded proposal -> actual WebMCP review/KDS/undo; no whole-design completion');
}finally{await ctx.dispose();}
