import assert from 'node:assert/strict';
import {designContext} from './fixtures/p24/context.js';
import {evaluateProvidedJointHoops,evaluateProvidedJointHoopDetail} from '../src/design/connection/kdsJointHoops.js';
const pairRepair=process.env.P25_JOINT_PAIR_REPAIR==='1',alternating=pairRepair||process.env.P25_JOINT_ALTERNATING==='1';
const ctx=designContext(),m=ctx.model;
try{
 m.nodes=[{id:'A',x:0,y:0,z:0,support:'fixed'},{id:'B',x:0,y:0,z:3},{id:'C',x:3,y:0,z:3}];m.members=[{id:'AB',type:'frame',n1:'A',n2:'B',matId:'concrete',secId:'rc3060'},{id:'BC',type:'frame',n1:'B',n2:'C',matId:'concrete',secId:'rc3060'}];m.loadCases=[{id:'D',type:'dead',name:'D'}];m.loads=[{id:'F',type:'nodal',node:'C',P:10,dir:'-z',case:'D'}];m.loadCombinations=[{id:'U',type:'strength',name:'U',factors:{D:1.4}}];m.analysisCases=[{id:'E',name:'E',kind:'static',status:'not-run',settings:{comboId:'U',pDeltaMethod:'off'}}];
 const reinforcement={strengthStandard:'KDS-142020-2022',type:'reinforcement-record',id:'R',name:'column bars',version:1,sourceNote:'fixture',memberId:'AB',start:0,end:1,cover:.04,barMaterialId:'steel@1',bars:[-1,1].flatMap(y=>[-1,1].map(z=>({y:y*.2,z:z*.08,diameter:20})))};
 if(pairRepair)reinforcement.bars.push(...[-1,1].map(y=>({y:y*.2,z:0,diameter:20})));
 const beamBars={...reinforcement,id:'RB',memberId:'BC',reinforcementForm:'single-deformed',barCoating:'uncoated',startExtension:.29,startFabricationShape:'L90',endFabricationShape:'straight',startBendInsideRadius:.06,startHookTailLength:.24,endSetbackStart:.04,endSetbackEnd:.04};
 const joint={...(alternating?{jointCrossTiePattern:'alternating-hook-side'}:{}),jointCrossTieBarPairs:['1:3'],jointCrossTieHookSides:['left'],jointCrossTiePlaneOffsets:['0.02'],jointClosureCorner:'+y+z',jointClosureSeparation:.04,jointTieClosure:'seismic-135',jointHookTail:.04,jointBendInsideRadius:.02,jointFirstStart:.1,jointFirstEnd:.1,jointColumnContinuity:'aligned-through-bars',jointCongestionMode:'longitudinal-paths',jointMinimumClearance:0,jointStrengthMode:'conservative-column-design-beam-nominal',jointAnchorageMode:'special-frame-beam-90-hooks',jointPanelHeight:.6,capacityDemandBasis:'derived-1.25fy-no-column-shear-credit',capacityBeamScope:'rectangular-no-slab-participation',jointHoopForm:'closed-rectangular-two-leg',jointCover:.04,jointDesignStandard:'KDS-142080-2021-special-frame',columnMemberId:'AB',jointMaterialId:'concrete@1',concreteWeight:'normal',type:'connection-record',id:'J',name:'synthetic joint',version:1,sourceNote:'test',nodeId:'B',memberIds:['AB','BC'],connectionType:'rc-joint',restraint:'rigid',jointWidth:.3,jointDepth:.6,barMaterialId:'steel@1',tieDiameter:16,tieSpacing:150,tieLegs:2};
 const preview=await ctx.call('preview_design_changes',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,requestId:'joint-preview',commands:[reinforcement,beamBars,joint]});assert.equal((await ctx.call('apply_design_changes',{handle:preview.handle,requestId:'joint-input'})).ok,true);
 const run=await ctx.bridge.runElasticWorkflow({plan:ctx.bridge.planElasticWorkflow({caseIds:['E']}),requestId:'joint-source'});assert.equal(run.ok,true);
 const evaluation=await ctx.call('evaluate_practical_design',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,sources:[{analysisRunId:run.steps[0].analysisRunId,comboId:'U'}]});

 const zeroPlan=await ctx.call('plan_design_candidates',{evaluationId:evaluation.evaluationId,connectionId:'J',detailCandidates:[{jointFirstStart:0,jointFirstEnd:0}]});assert.equal(zeroPlan.ok,true);
 await assert.rejects(()=>ctx.call('plan_design_candidates',{evaluationId:evaluation.evaluationId,connectionId:'J',detailCandidates:[{jointFirstStart:-.01}]}));
 const before=evaluateProvidedJointHoops(m,m.designDetails.connections[0]);
 assert.equal(before.status,'NG');assert.ok(before.requiredArea>before.providedArea);
 const samePlan=await ctx.call('plan_design_candidates',{evaluationId:evaluation.evaluationId,connectionId:'J',detailCandidates:[{tieSpacing:150}],maxCandidates:1,maxMillis:10000});
 const sameStart=await ctx.call('start_design_candidates',{planId:samePlan.planId,requestId:'unchanged-joint'});
 let same;for(let i=0;i<300;i++){same=await ctx.call('get_design_candidates',{jobId:sameStart.jobId});if(same.status!=='running')break;await new Promise(r=>setTimeout(r,10));}
 assert.equal(same.best,null);assert.equal(same.candidates[0].reason,'CANDIDATE_NO_CHANGE');
 assert.equal((await ctx.call('get_design_records',{channel:'connections',id:'J'})).rows[0].version,1);
 const plan=await ctx.call('plan_design_candidates',{evaluationId:evaluation.evaluationId,connectionId:'J',maxCandidates:1,maxMillis:10000});
 assert.equal(plan.generation.ok,true);assert.ok(plan.generation.basisCheckIds.length>0);
 const started=await ctx.call('start_design_candidates',{planId:plan.planId,requestId:'joint-auto'});
 let job;for(let i=0;i<300;i++){job=await ctx.call('get_design_candidates',{jobId:started.jobId});if(job.status!=='running')break;await new Promise(r=>setTimeout(r,10));}
 assert.ok(job.best,JSON.stringify(job));assert.equal(job.best.summary.complete,false);
 assert.equal(job.best.objective.quantityBasis,'prepared-nominal-centerline');assert.equal(job.best.objective.nominalGeometryAvailable,true);assert.equal(job.best.objective.quantityComplete,false);
 const applied=await ctx.call('apply_design_candidate_and_review',{jobId:started.jobId,candidateId:job.best.candidateId,requestId:'joint-auto-apply'});assert.equal(applied.ok,true);
 const stored=(await ctx.call('get_design_records',{channel:'connections',id:'J'})).rows[0];
 assert.equal(stored.reinforcement.spacing,plan.generation.edits[0].tieSpacing/1000);
 assert.ok(stored.jointHookTail>=.096);assert.ok(stored.jointBendInsideRadius>.02);
 assert.equal(stored.jointFirstStart,stored.reinforcement.spacing/2);assert.equal(stored.jointFirstEnd,stored.reinforcement.spacing/2);
 const after=evaluateProvidedJointHoops(m,stored);
 assert.ok(after.requiredArea<=after.providedArea*(1+1e-10));assert.ok(after.spacing<=after.spacingLimit);
 const detailed=evaluateProvidedJointHoopDetail(m,stored);
 for(const kind of ['135-hook-tail','inside-bend-radius','start-first-tie','end-first-tie'])assert.ok(detailed.checks.find(c=>c.kind===kind).ratio<=1+1e-10,kind);
 assert.ok(stored.jointHookTail>=detailed.requiredSeismicTail);
 assert.equal(after.status,'NG','core geometry failure must remain');assert.equal(after.hx,before.hx);
 assert.ok(after.codeReferences.length>0);assert.equal(stored.reinforcement.diameter,.016);
 const artifact=await ctx.call('export_design_drawings',{evaluationId:applied.followUp.evaluationId,format:'json'});
 const chunks=[];let offset=0;do{const row=await ctx.call('get_design_drawing_artifact',{artifactId:artifact.artifactId,offset});chunks.push(Buffer.from(row.content,'base64'));offset=row.nextOffset;}while(offset!==null);
 const document=JSON.parse(Buffer.concat(chunks).toString());
 const confinement=document.checks.find(c=>c.entityId==='joint:B'&&c.checkId==='joint-confinement');
 if(alternating&&!pairRepair){
  assert.equal(confinement.crossTieTopology.reason,'JOINT_CROSS_TIE_BODY_OUTSIDE_CORE');
  assert.ok(Math.abs(confinement.crossTieTopology.witness.position)>=confinement.crossTieTopology.witness.halfCore);
 }else assert.equal(confinement.crossTieTopology.phases.length,alternating?2:1);
 if(pairRepair){assert.equal(confinement.crossTieTopology.status,'OK');assert.deepEqual(plan.generation.edits[0].jointCrossTieBarPairs,['5:6']);}
 assert.ok(confinement.crossTieTopology.supportAndAssembly.some(c=>c.status==='NG'));
 assert.equal(confinement.crossTieTopology.creditApplied,false);
 assert.equal(confinement.transverseCredit.status,'NOT_CHECKED');
 if(pairRepair)assert.equal(confinement.transverseCredit.reason,'JOINT_CROSS_TIE_SUPPORT_AND_ASSEMBLY_REQUIRED');
 assert.deepEqual(confinement.directions,after.directions);
 assert.equal(confinement.areaGoverningDirection,after.areaGoverningDirection);
 assert.ok(confinement.directions.every(d=>d.status==='OK'&&d.additionalAreaCredited===0));
 assert.ok(confinement.codeReferences.some(r=>r.clause.includes('4.5.4')));

 const hoopCheck=document.checks.find(c=>c.entityId==='joint:B'&&c.checkId==='joint-hoop-detail');assert.ok(hoopCheck.spatialClosure.selfAssembly);assert.ok(hoopCheck.spatialClosure.crossTieAssembly.segmentPairs>0);assert.equal(hoopCheck.incomplete,true);assert.ok(hoopCheck.transverseLongitudinalAssembly.segmentPairs>0);assert.ok(hoopCheck.transverseLongitudinalAssembly.checks.length>0);assert.equal(hoopCheck.outerHoopSupport.columnDetailId,'R');assert.ok(Array.isArray(hoopCheck.outerHoopSupport.missingPerimeterBarIndices));assert.equal(hoopCheck.outerHoopSupport.status,'NOT_CHECKED');assert.equal(hoopCheck.crossTieSupport.checks.length,alternating?4:2);assert.equal(hoopCheck.crossTieSupport.status,'OK',JSON.stringify(hoopCheck.crossTieSupport));assert.ok(hoopCheck.crossTieSupport.checks.every(c=>c.coverage.coveredCount===c.coverage.totalCount));
 const quantity=document.quantities.find(q=>q.detailId==='J'&&q.kind==='joint-hoop').quantityEstimate;
 assert.equal(stored.jointClosureCorner,'+y+z');assert.equal(stored.jointClosureSeparation,.04);
 assert.deepEqual(stored.jointCrossTieBarPairs,pairRepair?['5:6']:['1:3']);assert.deepEqual(stored.jointCrossTieHookSides,['left']);assert.deepEqual(stored.jointCrossTiePlaneOffsets,plan.generation.edits[0].jointCrossTiePlaneOffsets);assert.ok(Number(stored.jointCrossTiePlaneOffsets[0])<.02);assert.equal(quantity.rows.length,alternating?3:2);if(alternating){assert.equal(stored.jointCrossTiePattern,'alternating-hook-side');assert.equal(quantity.rows.filter(r=>r.kind==='cross-tie').reduce((n,r)=>n+r.count,0),quantity.count);}assert.equal(quantity.rows[1].kind,'cross-tie');assert.equal(quantity.rows[1].planeOffset,Number(stored.jointCrossTiePlaneOffsets[0]));
 assert.equal(quantity.basis,'prepared-nominal-centerline');assert.equal(quantity.rows[0].bends.length,5);assert.ok(quantity.steelVolume>0);// The objective covers the whole proposal while this quantity is explicitly
 // incomplete, so it is the part that could be quantified rather than the same
 // number. Requiring equality contradicts quantityComplete being false.
 assert.ok(job.best.objective.value>0);assert.ok(quantity.steelVolume<=job.best.objective.value+1e-12);assert.equal(quantity.quantityComplete,false);
 console.log('PASS WebMCP joint automatic spacing -> candidate reevaluation -> apply; geometry NG retained');
}finally{await ctx.dispose();}
