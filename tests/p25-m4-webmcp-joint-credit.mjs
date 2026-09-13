import assert from 'node:assert/strict';
import {designContext} from './fixtures/p24/context.js';
import {fitSpatialHoopBars} from '../src/design/rc/fitSpatialHoopBars.js';
const stagger=process.env.P25_JOINT_STAGGER_SPLICES==='1',spliceLayout=stagger||process.env.P25_JOINT_SPLICE_LAYOUT==='1',supportSplices=spliceLayout||process.env.P25_JOINT_SUPPORT_SPLICES==='1',supportBars=supportSplices||process.env.P25_JOINT_SUPPORT_BARS==='1',planeRepair=supportBars||process.env.P25_JOINT_PLANE_REPAIR==='1',small=planeRepair||process.env.P25_JOINT_SMALL==='1',size=small?.4:.6,ctx=designContext(),m=ctx.model;
try{
 m.nodes=[{id:'A',x:0,y:0,z:0,support:'fixed'},{id:'B',x:0,y:0,z:3},{id:'C',x:0,y:0,z:6}];
 m.members=[{id:'AB',type:'frame',n1:'A',n2:'B',matId:'concrete',secId:'SEC@1'},{id:'BC',type:'frame',n1:'B',n2:'C',matId:'concrete',secId:'SEC@1'}];
 m.loadCases=[{id:'D',type:'dead',name:'D'}];m.loads=[{id:'F',type:'nodal',node:'C',P:10,dir:'+x',case:'D'}];m.loadCombinations=[{id:'U',type:'strength',name:'U',factors:{D:1.4}}];m.analysisCases=[{id:'E',name:'E',kind:'static',status:'not-run',settings:{comboId:'U',pDeltaMethod:'off'}}];
 const q=size/2-.07+.01/Math.sqrt(2),mid=size/2-.06,bars=[[-q,-q],[-mid,0],[-q,q],[0,mid],[q,q],[mid,0],[q,-q],[0,-mid]].map(([y,z])=>({y,z,diameter:.02}));
 const fit=fitSpatialHoopBars({bars:supportBars?bars.filter((_,i)=>i%2===0):bars,cover:.04,stirrups:{diameter:.01},tieBendInsideRadius:.02,tieHookTail:.075,tieClosure:'standard-135',tieClosureCorner:'+y+z',tieClosureSeparation:.03},{B:size,H:size});assert.equal(fit.status,'OK');
 const r={type:'reinforcement-record',id:'R',name:'column bars',version:1,sourceNote:'synthetic continuity test',memberId:'AB',start:0,end:1,cover:.04,barMaterialId:'steel@1',strengthStandard:'KDS-142020-2022',bars:fit.bars.map(b=>({...b,diameter:b.diameter*1000}))};
 const joint={type:'connection-record',id:'J',version:1,name:'synthetic continuity panel',sourceNote:'geometry and WebMCP only; no beam-joint qualification',nodeId:'B',memberIds:['AB','BC'],connectionType:'rc-joint',restraint:'rigid',columnMemberId:'AB',jointWidth:size,jointDepth:size,jointPanelHeight:.6,jointMaterialId:'concrete@1',concreteWeight:'normal',jointDesignStandard:'KDS-142080-2021-special-frame',jointHoopForm:'closed-rectangular-two-leg',jointTieClosure:'seismic-135',jointColumnContinuity:'aligned-through-bars',jointCongestionMode:'longitudinal-paths',jointMinimumClearance:0,jointCover:.04,jointHookTail:.075,jointBendInsideRadius:.02,jointClosureCorner:'+y+z',jointClosureSeparation:.03,jointFirstStart:.1,jointFirstEnd:.1,barMaterialId:'steel@1',tieDiameter:10,tieSpacing:200,tieLegs:2,jointCrossTiePattern:'alternating-hook-side',jointCrossTieBarPairs:['2:6','4:8'],jointCrossTieHookSides:['left','left'],jointCrossTiePlaneOffsets:['0.05','0.08']};
 if(supportBars)Object.assign(joint,{jointCrossTieBarPairs:['1:4'],jointCrossTieHookSides:['left'],jointCrossTiePlaneOffsets:['0.05']});
 if(planeRepair){r.barMaterialId='TEST-SD500@1';joint.barMaterialId='TEST-SD500@1';}
 const commands=[{type:'section-record',id:'SEC',version:1,name:'RC600',sourceNote:'synthetic',shape:'RECT',dimensionUnit:'mm',B:size*1000,H:size*1000},r,{...r,id:'R2',memberId:'BC'},joint];
 if(planeRepair)commands.unshift({type:'material-record',id:'TEST-SD500',version:1,name:'Synthetic 500 MPa rebar',kind:'steel',E:200000,nu:.3,density:7.85,Fy:500,Fu:600,sourceReference:'synthetic design input',edition:'fixture',sourceNote:'not a mill certificate',basisStatus:'assumed',product:'rebar',grade:'SD500'});
 if(spliceLayout)for(const c of commands.filter(c=>c.type==='reinforcement-record'))Object.assign(c,{fabricationShape:'straight',endSetbackStart:.03,endSetbackEnd:.03,startExtension:.03,endExtension:.03});
 if(supportSplices){r.cover=.03;commands.find(c=>c.id==='R2').cover=.03;commands.push({type:'splice-record',id:'SP',version:1,name:'synthetic all-bar splice',sourceNote:'input mapping and follow-up test',memberId:'AB',reinforcementId:'R@1',barIndices:['1','2','3','4'],start:.2,end:.5,offsetY:.0142,offsetZ:.0142,spliceType:'tension-B',spliceSystem:'ordinary-no-seismic-detail',continuationSide:'offset-toward-start'});}
 if(stagger){const sp=commands.find(c=>c.id==='SP');Object.assign(sp,{barIndices:['1','4'],start:.2,end:.4});commands.push({...sp,id:'SP2',barIndices:['2','3'],start:.5,end:.7});}
 const preview=await ctx.call('preview_design_changes',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,requestId:'credit-preview',commands});
 assert.equal((await ctx.call('apply_design_changes',{handle:preview.handle,requestId:'credit-input'})).ok,true);
 const run=await ctx.bridge.runElasticWorkflow({plan:ctx.bridge.planElasticWorkflow({caseIds:['E']}),requestId:'credit-source'});assert.equal(run.ok,true);
 const evaluation=await ctx.call('evaluate_practical_design',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,sources:[{analysisRunId:run.steps[0].analysisRunId,comboId:'U'}]});
 let document;
 if(stagger)document=ctx.bridge.getPracticalDesignSnapshot(evaluation.evaluationId);
 else{
 const artifact=await ctx.call('export_design_drawings',{evaluationId:evaluation.evaluationId,format:'json'}),chunks=[];let offset=0;
 do{const row=await ctx.call('get_design_drawing_artifact',{artifactId:artifact.artifactId,offset});chunks.push(Buffer.from(row.content,'base64'));offset=row.nextOffset;}while(offset!==null);
 document=JSON.parse(Buffer.concat(chunks).toString());
 }
 const check=document.checks.find(c=>c.checkId==='joint-confinement'&&c.entityId==='joint:B');
 const detail=document.checks.find(c=>c.checkId==='joint-hoop-detail'&&c.entityId==='joint:B');
 if(supportBars){assert.ok(check.transverseCredit,JSON.stringify(check));assert.equal(check.transverseCredit.status,'NOT_CHECKED');assert.equal(check.crossTieTopology.creditApplied,false);assert.equal(detail.status,'NG');assert.equal(evaluation.summary.complete,false);}
 else{
 assert.equal(check.transverseCredit.status,'OK',JSON.stringify(check.transverseCredit));assert.equal(check.crossTieTopology.creditApplied,true);
 assert.ok(check.directions.every(d=>d.additionalAreaCredited>0));assert.ok(check.hx<Math.max(check.hcB,check.hcH));
 assert.equal(check.status,'NG');assert.equal(evaluation.summary.complete,false);
 assert.ok(check.codeReferences.some(r=>r.clause.includes('4.5.4')));
 assert.equal(detail.transverseLongitudinalAssembly.status,'OK');assert.ok(detail.transverseLongitudinalAssembly.arcRefinements>0);
 assert.equal(detail.longitudinalSupport.status,small?'OK':'NG',JSON.stringify(detail.longitudinalSupport));
 assert.equal(detail.status,small?'OK':'NG',JSON.stringify(detail.readiness));
 assert.equal(detail.incomplete,false);assert.equal(detail.methodReviewRequired,true);
 assert.ok(!detail.incompleteReasons.includes('JOINT_HOOP_CAGE_ASSEMBLY_REQUIRED'));
 assert.equal(detail.outerHoopSupport.perimeterLayout.positions.length,8);
 }
 if(planeRepair){
  const plan=await ctx.call('plan_design_candidates',{evaluationId:evaluation.evaluationId,connectionId:'J',maxCandidates:1,maxMillis:10000});
  assert.equal(plan.generation.planeProposal.ok,true,JSON.stringify(plan.generation));
  assert.ok(plan.generation.basisCheckIds.includes(detail.id));
  if(supportBars){assert.equal(plan.relatedReinforcementCount,2);assert.deepEqual(new Set(plan.affectedDetailIds),new Set(stagger?['J','R','R2','SP','SP2']:supportSplices?['J','R','R2','SP']:['J','R','R2']));assert.ok(plan.generation.supportBarChanges.every(c=>c.addedBarIndices.length===4));assert.equal(m.designDetails.reinforcement.find(c=>c.id==='R'&&c.version===1).bars.length,4);}
  if(supportSplices){assert.equal(plan.relatedSpliceCount,stagger?2:1);assert.equal(plan.generation.spliceChanges[0].toReinforcementId,'R@2');}
  const started=await ctx.call('start_design_candidates',{planId:plan.planId,requestId:'plane-fit'});let job;
  for(let i=0;i<300;i++){job=await ctx.call('get_design_candidates',{jobId:started.jobId});if(job.status!=='running')break;await new Promise(r=>setTimeout(r,10));}
  assert.ok(job.best,JSON.stringify(job));
  if(supportBars){assert.equal(job.best.impact,'REANALYSIS_REQUIRED');assert.ok(job.best.analysisProof.length>0);assert.equal(job.best.objective.relatedReinforcementQuantities.length,2);assert.ok(job.best.objective.relatedReinforcementQuantities.every(q=>q.steelVolume>0));}
  const applied=await ctx.call('apply_design_candidate_and_review',{jobId:started.jobId,candidateId:job.best.candidateId,requestId:'plane-fit-apply'});assert.equal(applied.ok,true);
  if(supportBars){
   assert.equal(applied.followUp.status,'completed');assert.equal(applied.followUp.sources.length,1);
   assert.ok(applied.followUp.sources[0].analysisRunId);assert.notEqual(applied.followUp.sources[0].analysisRunId,run.steps[0].analysisRunId);
   assert.notEqual(applied.followUp.evaluationId,evaluation.evaluationId);
   const replay=await ctx.call('apply_design_candidate_and_review',{jobId:started.jobId,candidateId:job.best.candidateId,requestId:'plane-fit-apply'});
   assert.equal(replay.replayed,true);assert.deepEqual(replay.followUp.sources,applied.followUp.sources);
  }
  const saved=(await ctx.call('get_design_records',{channel:'connections',id:'J'})).rows[0];
  if(supportBars)for(const id of ['R','R2']){const record=(await ctx.call('get_design_records',{channel:'reinforcement',id})).rows[0];assert.equal(record.version,2);assert.equal(record.bars.length,8);assert.deepEqual(record.bars.slice(0,4).map(b=>[b.y,b.z,b.diameter]),fit.bars.map(b=>[b.y,b.z,b.diameter]));}
  if(supportSplices){const sp=(await ctx.call('get_design_records',{channel:'splices',id:'SP'})).rows[0];assert.equal(sp.version,2);assert.equal(sp.reinforcementId,'R@2');assert.equal(sp.barIndices.length,stagger?4:8);if(stagger){const other=(await ctx.call('get_design_records',{channel:'splices',id:'SP2'})).rows[0];assert.equal(other.version,2);assert.equal(other.reinforcementId,'R@2');assert.equal(other.barIndices.length,4);assert.equal(other.start,.5);assert.equal(other.end,.7);assert.equal(new Set([...sp.barIndices,...other.barIndices]).size,8);assert.ok(plan.generation.spliceChanges.every(c=>c.mappingStrategy==='balanced-existing-partition'));}}
  assert.deepEqual(saved.jointCrossTiePlaneOffsets,plan.generation.edits[0].jointCrossTiePlaneOffsets);
  const output=await ctx.call('export_design_drawings',{evaluationId:applied.followUp.evaluationId,format:'json'}),parts=[];let next=0;
  do{const row=await ctx.call('get_design_drawing_artifact',{artifactId:output.artifactId,offset:next});parts.push(Buffer.from(row.content,'base64'));next=row.nextOffset;}while(next!==null);
  const repaired=JSON.parse(Buffer.concat(parts).toString()),quantity=repaired.checks.find(c=>c.entityId==='joint:B'&&c.checkId==='joint-confinement'),hoop=repaired.checks.find(c=>c.entityId==='joint:B'&&c.checkId==='joint-hoop-detail');
  if(supportSplices&&!spliceLayout){assert.equal(quantity.status,'NOT_CHECKED');assert.equal(hoop.status,'NOT_CHECKED');assert.equal(quantity.referenceLayoutResult.status,'OK');assert.equal(hoop.referenceLayoutResult.status,'OK');assert.ok(quantity.incompleteReasons.includes('SPLICE_PIECE_STATION_LAYOUT_REVIEW_REQUIRED'));assert.equal(applied.followUp.summary.complete,false);}
  else {assert.equal(quantity.status,'OK',JSON.stringify(quantity));assert.equal(hoop.status,'OK',JSON.stringify(hoop.readiness));}
  if(spliceLayout){assert.equal(quantity.spliceLayoutProof.status,'OK');assert.equal(hoop.spliceLayoutProof.status,'OK');assert.equal(quantity.spliceLayoutProof.rows.length,8);assert.equal(quantity.spliceLayoutProof.strengthTransferQualified,false);assert.equal(applied.followUp.summary.complete,false);assert.ok(repaired.checks.some(c=>c.entityId==='joint:B'&&c.incompleteReasons?.includes('SPLICE_PIECE_STATION_LAYOUT_REVIEW_REQUIRED')));}
  assert.equal(quantity.transverseCredit.status,'OK');assert.equal(quantity.crossTieTopology.creditApplied,true);
  if(supportBars){
   let total=repaired.quantities.find(q=>q.kind==='joint-hoop'&&q.detailId==='J'&&q.version===saved.version).quantityEstimate.steelVolume;
   for(const related of job.best.objective.relatedReinforcementQuantities){
    const rows=repaired.quantities.filter(q=>q.kind==='longitudinal'&&q.detailId===related.id&&q.version===related.version);
    assert.equal(rows.length,8);assert.equal(related.unit,'m3');
    const volume=rows.reduce((n,q)=>n+(related.nominalGeometryAvailable?q.geometricQuantity.volume:q.bodyVolume),0);
    assert.ok(Math.abs(volume-related.steelVolume)<1e-12);total+=volume;
   }
   assert.ok(Math.abs(total-job.best.objective.value)<1e-12);
  }
  console.log('PASS automatic 75 mm spacing and separated planes preserve contact and complete scoped joint checks');
 }
 console.log('PASS actual WebMCP source/evaluation/JSON directional credit, refined contacts and unresolved full design');
}finally{await ctx.dispose();}
