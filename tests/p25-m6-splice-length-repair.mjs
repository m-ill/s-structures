import assert from 'node:assert/strict';
import {designContext} from './fixtures/p24/context.js';
import {stagePracticalDesignInput} from '../src/modeling/practicalDesignInputs.js';
import {practicalCommandFromRecord} from '../src/modeling/practicalInputContract.js';
import {evaluateMemberSplices} from '../src/design/rc/spliceGeometry.js';
import {memberSpliceLengthProposal} from '../src/compute/product/memberSpliceLengthProposal.js';
const ctx=designContext(),m=ctx.model;
try{
 m.nodes=[{id:'A',x:0,y:0,z:0,support:'fixed'},{id:'B',x:4,y:0,z:0}];m.members=[{id:'AB',type:'frame',n1:'A',n2:'B',matId:'concrete',secId:'rc3060'}];
 const bars={type:'reinforcement-record',id:'R',name:'test',version:1,memberId:'AB',start:0,end:1,cover:.04,barMaterialId:'steel@1',sourceNote:'synthetic',bars:[{y:-.2,z:-.08,diameter:20},{y:-.2,z:.08,diameter:20}],reinforcementForm:'single-deformed',concreteWeight:'normal',barPosition:'other',barCoating:'uncoated',lapRequired:true,aggregateMaxSize:.02,stirrupDiameter:10,stirrupSpacing:150,stirrupLegs:2};
 const splice={type:'splice-record',id:'SP',name:'test',version:1,sourceNote:'synthetic',memberId:'AB',reinforcementId:'R@1',barIndices:['1','2'],start:.48,end:.52,offsetY:.02,offsetZ:0,spliceType:'tension-B',spliceSystem:'ordinary-no-seismic-detail'};
 if(process.env.P25_SPLICE_EDGE)Object.assign(splice,{start:.01,end:.05});
 for(const c of [bars,splice])stagePracticalDesignInput(m,c,[]);
 for(const [start,end] of [[.01,.05],[.95,.99]]){
 const edgeModel={...m,designDetails:{...m.designDetails,splices:[{...m.designDetails.splices[0],start,end}]}};
 const edgeCheck={...evaluateMemberSplices(edgeModel,m.members[0]),id:'EDGE',entityId:'AB',checkId:'rc-splices'};
 const edgeProposal=memberSpliceLengthProposal(edgeModel,[bars],[edgeCheck]);assert.equal(edgeProposal.ok,true);const r=edgeProposal.spliceRepairs[0];assert.ok(r.start>=0&&r.end<=1&&r.start<=start&&r.end>=end);assert.equal(r.positionStrategy,'boundary-shift-preserving-overlap');
 const fixed={...edgeModel,designDetails:{...edgeModel.designDetails,splices:[{...edgeModel.designDetails.splices[0],start:r.start,end:r.end}]}};assert.equal(evaluateMemberSplices(fixed,m.members[0]).status,'OK');
 }
 const row={...evaluateMemberSplices(m,m.members[0]),id:'CHECK',entityId:'AB',checkId:'rc-splices'};assert.equal(row.status,'NG');
 const command=practicalCommandFromRecord('reinforcement-record',m.designDetails.reinforcement[0]);
 const proposal=memberSpliceLengthProposal(m,[command],[row]);assert.equal(proposal.ok,true);const repair=proposal.spliceRepairs[0];assert.ok(repair.start<splice.start&&repair.end>splice.end);if(process.env.P25_SPLICE_EDGE)assert.equal(repair.positionStrategy,'boundary-shift-preserving-overlap');else assert.ok(Math.abs((repair.start+repair.end)/2-.5)<1e-12);assert.equal(m.designDetails.splices[0].start,splice.start);
 const staged={...m,designDetails:{...m.designDetails,splices:[{...m.designDetails.splices[0],start:repair.start,end:repair.end}]}};assert.equal(evaluateMemberSplices(staged,m.members[0]).status,'OK');
 assert.equal(memberSpliceLengthProposal(m,[command],[{...row,checks:row.checks.map(c=>({...c,spliceVersion:2}))}]).ok,false);

 const {memberCandidateCommands}=await import('../src/design/rc/memberCandidateCommands.js');
 const {coupleMemberCandidateDevelopment}=await import('../src/compute/product/memberCandidateDevelopment.js');
 const diameterCandidate=memberCandidateCommands(m,[command],{diameter:25});
 const fresh=coupleMemberCandidateDevelopment(m,diameterCandidate);
 assert.equal(fresh.spliceDevelopment[0].status,'ADJUSTED');assert.equal(fresh.spliceDevelopment[0].spliceStatus,'OK');
 assert.ok(fresh.spliceDevelopment[0].changes[0].requiredLength>repair.requiredLength,'larger candidate bars use their fresh lap requirement');
 const {runCandidateGeometry}=await import('../src/compute/product/candidateAnalysisClient.js');const {createResourceBudget}=await import('../src/core/resourceBudget.js');
 const geometryBudget=createResourceBudget({maxBytes:128*1024*1024});
 const worker=await runCandidateGeometry({model:m,settings:{originalCommands:[command],options:{diameter:25,coupleEndDevelopment:true}},budget:geometryBudget,workerReservationBytes:32*1024*1024,timeoutMs:5000});assert.deepEqual(worker,fresh);assert.equal(geometryBudget.snapshot().totalBytes,0);
 const changedSplice=fresh.commands.find(c=>c.type==='splice-record');assert.equal(changedSplice.version,2);assert.equal(changedSplice.reinforcementId,'R@2');assert.ok(changedSplice.start<splice.start&&changedSplice.end>splice.end);assert.equal(diameterCandidate.commands.find(c=>c.type==='splice-record').start,splice.start);
 const locked={...m,designDetails:{...m.designDetails,splices:[{...m.designDetails.splices[0],locked:true}]}};assert.equal(memberSpliceLengthProposal(locked,[command],[row]).ok,false);
 const peerStart=(splice.end+repair.end)/2,neighbor={...m.designDetails.splices[0],id:'NEIGHBOR',barIndices:['1'],start:peerStart,end:peerStart+.01};
 const nearby={...m,designDetails:{...m.designDetails,splices:[...m.designDetails.splices,neighbor]}};const avoided=memberSpliceLengthProposal(nearby,[command],[row]);if(process.env.P25_SPLICE_EDGE)assert.equal(avoided.ok,false);else{assert.equal(avoided.ok,true);assert.equal(avoided.spliceRepairs[0].positionStrategy,'neighbor-shift-preserving-overlap');assert.ok(avoided.spliceRepairs[0].end<=peerStart);}
 const blocked={...m,designDetails:{...m.designDetails,splices:[...m.designDetails.splices,{...neighbor,id:'LEFT',start:Math.max(0,splice.start-.1),end:splice.start-.001},{...neighbor,id:'RIGHT',start:splice.end+.001,end:Math.min(1,splice.end+.1)}]}};assert.equal(memberSpliceLengthProposal(blocked,[command],[row]).ok,false);
 const {searchSplicePosition}=await import('../src/compute/product/splicePositionSearch.js');
 const params={span:.6,lower:0,upper:.4,centre:.5,initialStart:.2},spent={remaining:0,used:0};assert.equal(searchSplicePosition(nearby,m.designDetails.splices[0],params,spent).reason,'SPLICE_POSITION_SEARCH_LIMIT');assert.equal(spent.used,0);
 const manyPeers={...m,designDetails:{...m.designDetails,splices:[...m.designDetails.splices,...Array.from({length:129},(_,i)=>({...neighbor,id:'P'+i}))]}};assert.equal(searchSplicePosition(manyPeers,m.designDetails.splices[0],params,{remaining:64,used:0}).reason,'SPLICE_POSITION_PEER_LIMIT');
 const tooLong={...row,checks:row.checks.map(c=>({...c,requiredLength:10}))};assert.equal(memberSpliceLengthProposal(m,[command],[tooLong]).reason,'SPLICE_EXTENSION_OUTSIDE_REINFORCEMENT');
 let neighborBaseline;
 if(process.env.P25_SPLICE_NEIGHBOR){stagePracticalDesignInput(m,{...splice,id:'FIXED_NEIGHBOR',start:peerStart,end:1,barIndices:['1'],locked:true},[]);const checked=evaluateMemberSplices(m,m.members[0]).checks.filter(c=>c.spliceId==='FIXED_NEIGHBOR');assert.ok(checked.length&&checked.every(c=>c.status==='NG'));neighborBaseline=checked[0];}
 m.loadCases=[{id:'D',type:'dead',name:'D'}];m.loads=[{id:'F',type:'nodal',node:'B',dir:'-z',P:1,case:'D'}];m.loadCombinations=[{id:'U',type:'strength',name:'U',factors:{D:1.4}}];m.analysisCases=[{id:'E',name:'E',kind:'static',status:'not-run',settings:{comboId:'U',pDeltaMethod:'off'}}];
 const run=await ctx.bridge.runElasticWorkflow({plan:ctx.bridge.planElasticWorkflow({caseIds:['E']}),requestId:'source'});assert.equal(run.ok,true,JSON.stringify(run));
 const evaluation=await ctx.call('evaluate_practical_design',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,sources:[{analysisRunId:run.steps[0].analysisRunId,comboId:'U'}]});
 const plan=await ctx.call('plan_design_candidates',{evaluationId:evaluation.evaluationId,memberId:'AB',maxCandidates:1,maxMillis:10000});assert.equal(plan.generation.ok,true);assert.equal(plan.generation.spliceRepairs.length,1);
 const started=await ctx.call('start_design_candidates',{planId:plan.planId,requestId:'search'});let job;for(let i=0;i<500;i++){job=await ctx.call('get_design_candidates',{jobId:started.jobId});if(job.status!=='running')break;await new Promise(r=>setTimeout(r,10));}assert.ok(job.best,JSON.stringify(job));
 assert.ok(job.best.changes.spliceDevelopment.length>0);assert.equal(job.best.changes.spliceDevelopment[0].codeReferences,undefined);assert.ok(job.best.changes.spliceDevelopment[0].codeReferenceCount>0);assert.equal(job.best.spliceChangeCount,1);assert.equal(job.best.reinforcementChangeCount,0);assert.equal(job.best.changes.spliceLengthChanges.length,1);if(process.env.P25_SPLICE_NEIGHBOR){assert.equal(job.best.changes.spliceLengthChanges[0].positionStrategy,'neighbor-shift-preserving-overlap');assert.ok(job.best.changes.spliceLengthChanges[0].centreShiftM<0);}if(process.env.P25_SPLICE_EDGE){assert.equal(job.best.changes.spliceLengthChanges[0].positionStrategy,'boundary-shift-preserving-overlap');assert.ok(job.best.changes.spliceLengthChanges[0].centreShiftM>0);}
 let detailText='',offset=0;for(;;){const part=await ctx.call('get_design_candidate_detail',{jobId:job.jobId,candidateId:job.best.candidateId,offset,limit:4096});detailText+=part.chunk;if(part.nextOffset===null)break;offset=part.nextOffset;}
 const queried=JSON.parse(detailText);assert.equal(queried.reinforcementChanges,undefined);assert.equal(queried.spliceChanges[0].before.version,1);assert.equal(queried.spliceChanges[0].after.version,2);
 const {renderSpliceChanges}=await import('../src/ui/spliceChangeView.js');const {createFakeIndexDocument}=await import('./helpers/fakeIndexDom.mjs');const doc=createFakeIndexDocument(),view=doc.createElement('div');assert.equal(renderSpliceChanges(doc,view,queried.spliceChanges,queried.changes),true);assert.ok(view.querySelectorAll('h4').some(n=>n.textContent==='이음 변경 전후'));assert.ok(view.querySelectorAll('td').some(n=>n.textContent==='R@1'));
 const applied=await ctx.call('apply_design_candidate_and_review',{jobId:job.jobId,candidateId:job.best.candidateId,requestId:'repair'});assert.equal(applied.ok,true,JSON.stringify(applied));
 const after=ctx.bridge.getPracticalDesignSnapshot(applied.followUp.evaluationId),spliceCheck=after.checks.find(c=>c.checkId==='rc-splices');if(process.env.P25_SPLICE_NEIGHBOR){assert.equal(spliceCheck.status,'NG');assert.ok(spliceCheck.checks.filter(c=>c.spliceId==='SP').every(c=>c.status==='OK'));const peer=spliceCheck.checks.find(c=>c.spliceId==='FIXED_NEIGHBOR');assert.equal(peer.status,'NG');assert.equal(peer.requiredLength,neighborBaseline.requiredLength);assert.equal(peer.providedLength,neighborBaseline.providedLength);}else assert.equal(spliceCheck.status,'OK',JSON.stringify(spliceCheck));assert.ok(spliceCheck.codeReferences.length>0);assert.equal(after.summary.complete,false);
 const stored=(await ctx.call('get_design_records',{channel:'splices',id:'SP'})).rows[0];assert.equal(stored.version,2);assert.equal(stored.reinforcementId,'R@1');if(process.env.P25_SPLICE_NEIGHBOR){assert.ok(stored.end<=peerStart);const fixed=m.designDetails.splices.filter(s=>s.id==='FIXED_NEIGHBOR');assert.equal(fixed.length,1);assert.equal(fixed[0].version,1);assert.equal(fixed[0].start,peerStart);}assert.equal(m.designDetails.reinforcement.length,1);assert.ok(stored.start<splice.start&&stored.end>splice.end);
 assert.equal((await ctx.call('undo_design_input',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash})).ok,true);
 console.log(process.env.P25_SPLICE_NEIGHBOR?'PASS actual WebMCP target splice repaired around locked neighbor; original neighbor NG preserved; undo':'PASS actual WebMCP splice-only automatic extension -> same-owner OK -> undo without redundant reinforcement version');
 console.log('PASS recorded splice length repair preserves centre, validates geometry and rejects stale demands');
}finally{await ctx.dispose();}
