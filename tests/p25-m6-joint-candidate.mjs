import {REBAR_CATALOG_ID} from '../src/materials/rebarProductCatalog.js';
import {prepareDetailGeometry} from '../src/design/rc/preparedDetailGeometry.js';
import {buildDetailDrawings} from '../src/report/phase24/detailDrawings.js';
import {buildVectorDetailPdf} from '../src/report/phase24/vectorPdf.js';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {jointStrengthBound,evaluateJointStrengthRelation} from '../src/design/connection/jointStrengthRelation.js';
import {REQUIRED_JOINT_CHECKS} from '../src/design/evaluation/practicalEvaluation.js';
import {jointHookAnchorageProposal} from '../src/compute/product/jointHookAnchorageProposal.js';
import {evaluateJointCongestion} from '../src/design/connection/jointCongestion.js';
import {evaluateJointHookAnchorage} from '../src/design/connection/jointHookAnchorage.js';
import {deriveJointProbableForces} from '../src/design/connection/jointProbableForces.js';
import assert from 'node:assert/strict';
import {designContext} from './fixtures/p24/context.js';
assert.equal(jointStrengthBound([[100,120]],[[80,90]]).ratio,1.08);
assert.equal(jointStrengthBound([[150,130]],[[80,90]]).status,'OK');
for(const catalog of [false,true]){
const ctx=designContext(),m=ctx.model;
try{
 m.nodes=[{id:'A',x:0,y:0,z:0,support:'fixed'},{id:'B',x:0,y:0,z:3},{id:'C',x:3,y:0,z:3}];m.members=[{id:'AB',type:'frame',n1:'A',n2:'B',matId:'concrete',secId:'rc3060'},{id:'BC',type:'frame',n1:'B',n2:'C',matId:'concrete',secId:'rc3060'}];m.loadCases=[{id:'D',type:'dead',name:'D'}];m.loads=[{id:'F',type:'nodal',node:'C',P:10,dir:'-z',case:'D'}];m.loadCombinations=[{id:'U',type:'strength',name:'U',factors:{D:1.4}}];m.analysisCases=[{id:'E',name:'E',kind:'static',status:'not-run',settings:{comboId:'U',pDeltaMethod:'off'}}];
 m.members.forEach(v=>Object.assign(v,{endOffset:{i:0,j:0},insertionPoint:'centroid'}));
 const reinforcement={strengthStandard:'KDS-142020-2022',type:'reinforcement-record',id:'R',name:'column bars',version:1,sourceNote:'fixture',memberId:'AB',start:0,end:1,cover:.04,barMaterialId:'steel@1',bars:[-1,1].flatMap(y=>[-1,1].map(z=>({y:y*.2,z:z*.08,diameter:20})))};
 const beamBars={...reinforcement,id:'RB',memberId:'BC',reinforcementForm:'single-deformed',barCoating:'uncoated',startExtension:catalog?.29047:.29,startFabricationShape:'L90',endFabricationShape:'straight',startBendInsideRadius:.06,startHookTailLength:.24,endSetbackStart:.04,endSetbackEnd:.04};
 const joint={jointFirstStart:.025,jointFirstEnd:.025,jointColumnContinuity:'aligned-through-bars',jointCongestionMode:'longitudinal-paths',jointMinimumClearance:0,jointStrengthMode:'conservative-column-design-beam-nominal',jointAnchorageMode:'special-frame-beam-90-hooks',jointPanelHeight:.6,capacityDemandBasis:'derived-1.25fy-no-column-shear-credit',capacityBeamScope:'rectangular-no-slab-participation',jointHoopForm:'closed-rectangular-two-leg',jointCover:.04,jointDesignStandard:'KDS-142080-2021-special-frame',columnMemberId:'AB',jointMaterialId:'concrete@1',concreteWeight:'normal',type:'connection-record',id:'J',name:'synthetic joint',version:1,sourceNote:'test',nodeId:'B',memberIds:['AB','BC'],connectionType:'rc-joint',restraint:'rigid',jointWidth:.3,jointDepth:.6,barMaterialId:'steel@1',tieDiameter:10,tieSpacing:150,tieLegs:2};
 const preview=await ctx.call('preview_design_changes',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,requestId:'joint-preview',commands:[...(catalog?[{type:'material-record',id:'SD400',version:1,name:'catalog steel',kind:'steel',E:200000,nu:.3,density:7.85,Fy:400,Fu:460,product:'rebar',grade:'SD400',sourceReference:'synthetic',edition:'fixture',sourceNote:'not certified',basisStatus:'assumed'}]:[]),reinforcement,beamBars,{...joint,...(catalog?{barMaterialId:'SD400@1',barCatalogId:REBAR_CATALOG_ID,barProductGrade:'SD400'}:{})}]});assert.equal((await ctx.call('apply_design_changes',{handle:preview.handle,requestId:'joint-input'})).ok,true);
 const run=await ctx.bridge.runElasticWorkflow({plan:ctx.bridge.planElasticWorkflow({caseIds:['E']}),requestId:'joint-source'});assert.equal(run.ok,true);
 const evaluation=await ctx.call('evaluate_practical_design',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,sources:[{analysisRunId:run.steps[0].analysisRunId,comboId:'U'}]});
 let offset=0,hoop,probable,shear,anchorage,strengthRelation,congestion;do{const page=await ctx.call('get_practical_design_result',{evaluationId:evaluation.evaluationId,offset});congestion||=page.checks.find(c=>c.checkId==='joint-bar-congestion');strengthRelation||=page.checks.find(c=>c.checkId==='joint-member-strength-ratio');anchorage||=page.checks.find(c=>c.checkId==='joint-anchorage');hoop||=page.checks.find(c=>c.checkId==='joint-confinement');probable||=page.checks.find(c=>c.checkId==='joint-probable-forces');shear||=page.checks.find(c=>c.checkId==='joint-shear');offset=page.nextOffset;}while(offset!==null);
 assert.equal(congestion.status,'NG');assert.ok(congestion.failedPairs.length>0);
 const paired=structuredClone(m);paired.nodes.push({id:'D',x:0,y:0,z:6});paired.members.push({...paired.members[0],id:'BD',n1:'B',n2:'D'});paired.designDetails.reinforcement.push({...structuredClone(paired.designDetails.reinforcement[0]),id:'RU',memberId:'BD'});
 const pairedJoint={...paired.designDetails.connections[0],jointColumnContinuity:undefined,memberIds:['AB','BD','BC']};
 assert.equal(evaluateJointCongestion(paired,pairedJoint).reason,'PAIRED_COLUMN_BAR_CONTINUITY_REQUIRED');
 pairedJoint.jointColumnContinuity='aligned-through-bars';
 const continuous=evaluateJointCongestion(paired,pairedJoint);assert.equal(continuous.barCount,congestion.barCount);assert.equal(continuous.failedPairs.length,congestion.failedPairs.length);assert.equal(continuous.columnContinuity.pairCount,4);
 paired.designDetails.reinforcement.at(-1).bars[0].y+=.01;assert.equal(evaluateJointCongestion(paired,pairedJoint).reason,'COLUMN_CONTINUITY_BAR_MATCH_REQUIRED');
 paired.designDetails.reinforcement.at(-1).bars[0].y-=.01;paired.designDetails.reinforcement.at(-1).barMaterialId='different@1';assert.equal(evaluateJointCongestion(paired,pairedJoint).reason,'COLUMN_CONTINUITY_BAR_MATCH_REQUIRED');
 const drawings=buildDetailDrawings(ctx.bridge.getPracticalDesignSnapshot(evaluation.evaluationId));const jointPage=drawings.pages.find(p=>p.detailId==='J');assert.ok(jointPage.commands.filter(c=>c.kind==='line').length>20);mkdirSync('output/pdf/phase25',{recursive:true});writeFileSync('output/pdf/phase25/joint-paths.pdf',buildVectorDetailPdf([jointPage],new Uint8Array(readFileSync('assets/fonts/phase24/SStructuresSans.ttf'))));
 assert.ok(['OK','NG'].includes(strengthRelation.status),JSON.stringify(strengthRelation));assert.ok(strengthRelation.columnLowerBound>0&&strengthRelation.beamUpperBound>0);
 assert.equal(anchorage.status,'OK',JSON.stringify(anchorage));assert.equal(anchorage.codeBasis.status,'CLAUSE_APPLIED');
 const strengthSet={memberResults:{AB:{xs:[0,3],N:[-100,-100]},BC:{xs:[0,3],N:[0,0]}}};
 if(!catalog){
  const record=m.designDetails.connections[0];
  for(const xs of [[1,3],[0,2],[3,0],[0,2,1,3],[0,1,1,3],[-1,3],[0,4,3]]){
   const malformed=structuredClone(strengthSet);malformed.memberResults.AB={xs,N:xs.map(()=>-100)};
   const check=evaluateJointStrengthRelation(m,record,malformed);
   assert.equal(check.status,'NOT_CHECKED',JSON.stringify(xs));
   assert.equal(check.reason,'JOINT_AXIAL_STATION_GRID_INVALID');
  }
  const sided=structuredClone(strengthSet);sided.memberResults.AB={xs:[0,1,1,3],N:[-100,-100,-120,-120],stationSides:['point','left','right','point']};
  const accepted=evaluateJointStrengthRelation(m,record,sided);
  assert.ok(['OK','NG'].includes(accepted.status),JSON.stringify(accepted));
  assert.deepEqual(accepted.axesChecks[0].members.find(r=>r.memberId==='AB').axialValues,[-100,-120]);
  sided.memberResults.AB.stationSides=['point','right','left','point'];
  assert.equal(evaluateJointStrengthRelation(m,record,sided).reason,'JOINT_AXIAL_STATION_GRID_INVALID');
 }
 const jointRecord=m.designDetails.connections[0],baselineOwners=[evaluateJointHookAnchorage(m,jointRecord),evaluateJointCongestion(m,jointRecord),evaluateJointStrengthRelation(m,jointRecord,strengthSet)];
 for(const extra of [{endOffset:{i:0,j:0}},{endOffset:{frame:'global',i:{dx:0,dy:0,dz:0},j:{dx:0}},insertionPoint:'centroid'},{insertionPoint:{position:'centroid'}}]){
  const equivalent=structuredClone(m);equivalent.members.forEach(v=>Object.assign(v,extra));
  const actual=[evaluateJointHookAnchorage(equivalent,jointRecord),evaluateJointCongestion(equivalent,jointRecord),evaluateJointStrengthRelation(equivalent,jointRecord,strengthSet)];
  assert.deepEqual(actual,baselineOwners,'explicit zero offsets and centroid must retain numerical joint checks');
 }
 for(const target of ['AB','BC'])for(const extra of [{endOffset:{i:.1}},{insertionPoint:'top-center'},{taper:{profile:'linear',sectionIdJ:'rc3060'}}]){
  const unsupported=structuredClone(m);Object.assign(unsupported.members.find(v=>v.id===target),extra);
  for(const value of [evaluateJointHookAnchorage(unsupported,jointRecord),evaluateJointCongestion(unsupported,jointRecord),evaluateJointStrengthRelation(unsupported,jointRecord,strengthSet)]){assert.equal(value.status,'NOT_CHECKED');assert.ok(value.codeReferences.length);}
 }
 const shortHook=structuredClone(m);shortHook.designDetails.reinforcement.find(d=>d.id==='RB').startExtension=0;assert.equal(evaluateJointHookAnchorage(shortHook,shortHook.designDetails.connections[0]).reason,'HOOK_NOT_EXTENDED_TO_OPPOSITE_CORE_FACE');
 const outsideHook=structuredClone(m);outsideHook.designDetails.reinforcement.find(d=>d.id==='RB').startExtension=.5;assert.equal(evaluateJointHookAnchorage(outsideHook,outsideHook.designDetails.connections[0]).reason,'HOOK_OUTSIDE_CONFINED_CORE');
 assert.equal(probable.status,'OK');assert.ok(Math.abs(probable.axes.X-2*Math.PI*.02**2/4*235*1.25*1000)<1e-8);
 if(!catalog){
  const disconnected=structuredClone(m);disconnected.nodes.push({...disconnected.nodes.find(n=>n.id==='B'),id:'UNCONNECTED'});disconnected.members.find(r=>r.id==='BC').n1='UNCONNECTED';
  assert.equal(deriveJointProbableForces(disconnected,joint).reason,'JOINT_MEMBER_CONNECTIVITY_REQUIRED');
  assert.equal(deriveJointProbableForces(m,{...joint,memberIds:[...joint.memberIds,'missing']}).reason,'JOINT_MEMBER_CONNECTIVITY_REQUIRED');
  const tapered=structuredClone(m);tapered.members.find(r=>r.id==='BC').taper={profile:'linear',sectionIdJ:'rc3060'};
  assert.equal(deriveJointProbableForces(tapered,joint).reason,'JOINT_PRISMATIC_MEMBERS_REQUIRED');
 }
 const increased=structuredClone(m);increased.designDetails.reinforcement.find(r=>r.id==='RB').bars.forEach(b=>b.area*=1.5);
 assert.ok(Math.abs(deriveJointProbableForces(increased,joint).axes.X/probable.axes.X-1.5)<1e-10);
 assert.equal(shear.methodReviewRequired,true);assert.equal(shear.codeBasis.status,'NOT_ESTABLISHED');
 assert.equal(hoop.status,'NG');assert.ok(hoop.requiredArea>0);assert.equal(hoop.codeBasis.status,'CLAUSE_APPLIED');
 if(catalog)await assert.rejects(ctx.call('plan_design_candidates',{evaluationId:evaluation.evaluationId,connectionId:'J',detailCandidates:[{tieDiameter:14}],maxCandidates:1,maxMillis:10000}),/REBAR_CATALOG_SIZE_MISMATCH/);
 if(catalog){
  const beforeInvalid=await ctx.call('get_practical_design_context');
  await assert.rejects(ctx.call('plan_design_candidates',{evaluationId:evaluation.evaluationId,memberId:'AB',spacings:[100],dependentCandidates:[{connectionId:'J',detailCandidates:[{tieDiameter:14}]}],maxCandidates:1,maxMillis:10000}),{code:'REBAR_CATALOG_SIZE_MISMATCH'});
  const afterInvalid=await ctx.call('get_practical_design_context');
  assert.deepEqual(afterInvalid.plans,beforeInvalid.plans);assert.deepEqual(afterInvalid.jobs,beforeInvalid.jobs);assert.equal(afterInvalid.memory.totalBytes,beforeInvalid.memory.totalBytes);
 }

 const plan=await ctx.call('plan_design_candidates',{evaluationId:evaluation.evaluationId,connectionId:'J',detailCandidates:[{tieSpacing:100,...(catalog?{tieDiameter:13}:{})}],maxCandidates:1,maxMillis:10000});
 const started=await ctx.call('start_design_candidates',{planId:plan.planId,requestId:'joint-candidate'});let job;for(let i=0;i<300;i++){job=await ctx.call('get_design_candidates',{jobId:started.jobId});if(job.status!=='running')break;await new Promise(r=>setTimeout(r,10));}
 assert.ok(job.best,JSON.stringify(job));assert.equal(job.best.objective.quantityComplete,false);assert.equal(job.best.objective.quantityBasis,'panel-perimeter-proxy');assert.equal(job.best.changes.kind,'connection-record');assert.equal(job.best.summary.complete,false);
 const applied=await ctx.call('apply_design_candidate',{jobId:started.jobId,candidateId:job.best.candidateId,requestId:'joint-apply'});assert.equal(applied.ok,true);
 const reviewed=await ctx.call('apply_design_candidate_and_review',{jobId:started.jobId,candidateId:job.best.candidateId,requestId:'joint-apply'});
 assert.equal(reviewed.followUp.status,'completed',JSON.stringify(reviewed));
 const jointAudit=snapshot=>snapshot.checks.filter(c=>c.entityId==='joint:B').map(c=>({checkId:c.checkId,status:c.status,reason:c.reason??null,ratio:c.ratio,codeBasis:c.codeBasis}));
 const before=jointAudit(ctx.bridge.getPracticalDesignSnapshot(evaluation.evaluationId));
 const after=jointAudit(ctx.bridge.getPracticalDesignSnapshot(reviewed.followUp.evaluationId));
 for(const rows of [before,after])assert.deepEqual(rows.map(c=>c.checkId).sort(),[...REQUIRED_JOINT_CHECKS].sort());
 assert.equal(after.find(c=>c.checkId==='joint-anchorage').status,catalog?'NG':'OK');
 if(catalog)assert.equal(after.find(c=>c.checkId==='joint-anchorage').reason,'HOOK_OUTSIDE_CONFINED_CORE','larger hoop reduces the usable hook core; post-apply review must retain the new failure');
 assert.equal(reviewed.followUp.summary.complete,false);
 mkdirSync('output/phase25',{recursive:true});
 writeFileSync(`output/phase25/joint-profile-${catalog?'catalog':'geometric'}-audit.json`,JSON.stringify({scope:'synthetic external joint; all required checks retained; not whole-design qualification',evaluationId:evaluation.evaluationId,appliedEvaluationId:reviewed.followUp.evaluationId,before,after},null,2));
 const stored=(await ctx.call('get_design_records',{channel:'connections',id:'J'})).rows[0];assert.equal(stored.reinforcement.spacing,.1);assert.equal(stored.version,2);if(catalog){assert.equal(stored.reinforcement.diameter,.0127);assert.equal(stored.reinforcement.area,126.7e-6);assert.equal(stored.reinforcement.unitMassKgPerM,.995);assert.equal(stored.reinforcement.designation,'D13');}assert.equal(stored.jointColumnContinuity,'aligned-through-bars');
 const preparedQuantity=prepareDetailGeometry(m).connections['J@2'].reinforcementQuantity;assert.equal(job.best.objective.value,preparedQuantity.steelVolume);if(catalog)assert.ok(Math.abs(preparedQuantity.steelVolume-126.7e-6*1.8*preparedQuantity.count)<1e-15);
 assert.equal(drawings.quantities.find(q=>q.kind==='joint-hoop').quantityEstimate.quantityComplete,false);
 if(catalog){
  const locked=structuredClone(m);locked.designDetails.reinforcement.find(r=>r.id==='RB').locked=true;
  assert.equal(jointHookAnchorageProposal(locked,stored).reason,'DETAIL_LOCKED');
  const repair=await ctx.call('plan_design_candidates',{evaluationId:reviewed.followUp.evaluationId,connectionId:'J',maxCandidates:1,maxMillis:10000});
  assert.equal(repair.relatedReinforcementCount,1,'joint repair must include the beam hook affected by the enlarged hoop');
  assert.equal(repair.generation.hookProposal.ok,true);
  const repairStart=await ctx.call('start_design_candidates',{planId:repair.planId,requestId:'joint-hook-repair'});
  let repairedJob;for(let i=0;i<300;i++){repairedJob=await ctx.call('get_design_candidates',{jobId:repairStart.jobId});if(repairedJob.status!=='running')break;await new Promise(r=>setTimeout(r,10));}
  assert.ok(repairedJob.best,JSON.stringify(repairedJob));
  const receipt=await ctx.call('apply_design_candidate_and_review',{jobId:repairStart.jobId,candidateId:repairedJob.best.candidateId,requestId:'joint-hook-repair-apply'});
  assert.equal(receipt.followUp.status,'completed',JSON.stringify(receipt));
  const fixed=jointAudit(ctx.bridge.getPracticalDesignSnapshot(receipt.followUp.evaluationId));
  assert.equal(fixed.find(c=>c.checkId==='joint-anchorage').status,'OK');
  assert.equal(fixed.length,9);assert.equal(receipt.followUp.summary.complete,false);
  const beam=(await ctx.call('get_design_records',{channel:'reinforcement',id:'RB'})).rows[0];
  assert.ok(Math.abs(beam.startExtension-(.29047-(.0127-.00953)))<1e-8,'use actual catalogue D10/D13 diameters, not designation numbers');
  writeFileSync('output/phase25/joint-hook-repair-audit.json',JSON.stringify({generation:repair.generation,evaluationId:receipt.followUp.evaluationId,checks:fixed,startExtension:beam.startExtension,complete:false},null,2));
 }
 console.log('PASS actual WebMCP joint candidate -> isolated reanalysis/review -> explicit typed apply; missing joint rules stay incomplete');
}finally{await ctx.dispose();}

}
