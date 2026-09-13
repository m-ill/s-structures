import {evaluateColumnTransfer} from '../src/design/foundation/columnTransfer.js';
import {resolveFootingLoadLedger} from '../src/design/foundation/footingLoadLedger.js';
import assert from 'node:assert/strict';
import {stagePracticalDesignInput} from '../src/modeling/practicalDesignInputs.js';
import {validateModel} from '../src/core/validation.js';
import {designContext} from './fixtures/p24/context.js';
import {buildDetailDrawings} from '../src/report/phase24/detailDrawings.js';
import {validateStoredDesignDetails} from '../src/modeling/designDetailValidation.js';
for(const withShear of [false,true]){
const ctx=designContext(),m=ctx.model;
try{
 m.nodes=[{id:'A',x:0,y:0,z:0,support:'fixed'},{id:'B',x:0,y:0,z:3}];m.members=[{id:'AB',type:'frame',n1:'A',n2:'B',matId:'concrete',secId:'rc3060'}];m.loadCases=[{id:'D',type:'dead',name:'D'}];m.loads=[{id:'F',type:'nodal',node:'B',P:10,dir:'+z',case:'D'}];m.loads.push({id:'H',type:'nodal',node:'B',P:2,dir:'+x',case:'D'});m.loads.push({id:'CANCEL-M',type:'nmoment',node:'B',M:6,dir:'-y',case:'D'});m.loadCombinations=[{id:'U',type:'strength',name:'U',factors:{D:1.4}}];m.analysisCases=[{id:'E',name:'E',kind:'static',status:'not-run',settings:{comboId:'U',pDeltaMethod:'off'}}];
 if(!withShear)m.loads=m.loads.filter(r=>!['H','CANCEL-M'].includes(r.id));
 const ground={type:'ground-record',id:'G',name:'synthetic',version:1,sourceNote:'test',sourceReference:'fixture',basisStatus:'specified',allowableBearing:150,bearingBasis:'gross'};
 const columnBars={type:'reinforcement-record',id:'R',name:'continuous column bars',version:1,sourceNote:'synthetic',memberId:'AB',start:0,end:1,cover:.04,barMaterialId:'steel@1',reinforcementForm:'single-deformed',barCoating:'uncoated',lapRequired:false,bars:[-1,1].flatMap(y=>[-1,1].map(z=>({y:y*.2,z:z*.08,diameter:20})))};
 const footing={reactionVerticalReference:'footing-top',columnInterfaceSurface:'roughened-6mm',columnInterfaceClean:true,columnInterfacePreparationReference:'synthetic roughness specification',columnOffsetX:0,columnOffsetY:0,reactionMomentReference:'column-center',columnTransferType:'cast-in-place-continuous-straight-bars',columnMemberId:'AB',columnEmbedmentLength:.3,columnDevelopmentAbove:.3,barShape:'straight',shrinkageRestraint:'ordinary-not-severely-restrained',type:'foundation-record',id:'F',name:'synthetic',version:1,sourceNote:'test',nodeId:'A',foundationType:'isolated',B:2,L:2,thickness:.5,cover:.05,materialId:'concrete@1',groundId:'G@1',barMaterialId:'steel@1',bottomDiameterB:16,bottomDiameterL:16,bottomSpacingB:150,bottomSpacingL:150,topDiameterB:16,topDiameterL:16,topSpacingB:150,topSpacingL:150,footingWeightCaseId:'D',reactionBasis:'superstructure-only',columnWidth:.6,columnDepth:.3,flexureStandard:'KDS-142020-2022',concreteWeight:'normal',barCoating:'uncoated',punchingStandard:'KDS-142022-2022',punchingMomentMethod:'conservative-perimeter-shear',punchingPerimeterScope:'interior-solid-no-openings'};
 assert.ok((await ctx.call('get_design_input_schema',{type:'foundation-record'})).schema.properties.topDiameterB);
 const staging=structuredClone(m);for(const c of [ground,columnBars,footing])stagePracticalDesignInput(staging,c,[]);assert.equal(validateModel(staging).ok,true,JSON.stringify(validateModel(staging)));
 const preview=await ctx.call('preview_design_changes',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,requestId:'footing-preview',commands:[ground,columnBars,footing]});
 assert.equal((await ctx.call('apply_design_changes',{handle:preview.handle,requestId:'footing-apply'})).ok,true);
 const stored=(await ctx.call('get_design_records',{channel:'foundations',id:'F'})).rows[0];assert.equal(stored.reinforcement.topB.diameter,.016);assert.deepEqual(validateStoredDesignDetails(m),[]);
 const run=await ctx.bridge.runElasticWorkflow({plan:ctx.bridge.planElasticWorkflow({caseIds:['E']}),requestId:'footing-source'});assert.equal(run.ok,true,JSON.stringify({run,error:ctx.bridge.getAnalysisLatestAttempt('E')?.error}));
 const result=await ctx.call('evaluate_practical_design',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,sources:[{analysisRunId:run.steps[0].analysisRunId,comboId:'U'}]});
 const first=ctx.bridge.getPracticalDesignSnapshot(result.evaluationId).checks.find(r=>r.checkId==='foundation-column-transfer');
 assert.ok(Math.abs(first.ratio-first.demand/first.capacity)<1e-10,'governing ratio and displayed demand/capacity must agree');
 assert.equal(first.status,'NG',JSON.stringify(first));assert.equal(first.reason,'COLUMN_INTERFACE_TENSION_DEVELOPMENT_INSUFFICIENT');assert.ok(first.columnTensionDemand>0);assert.equal(!!first.interfaceShear,withShear);assert.equal(first.development[0].mode,withShear?'tension-for-interface-axial-and-shear':'tension-for-interface-axial');
 const plan=await ctx.call('plan_design_candidates',{evaluationId:result.evaluationId,foundationId:'F',detailCandidates:[{thickness:.8,columnEmbedmentLength:.65,columnDevelopmentAbove:.65}],maxCandidates:1,maxMillis:10000});
 const started=await ctx.call('start_design_candidates',{planId:plan.planId,requestId:'shear-anchor-candidate'});let job;
 for(let i=0;i<500;i++){job=await ctx.call('get_design_candidates',{jobId:started.jobId});if(job.status!=='running')break;await new Promise(r=>setTimeout(r,10));}assert.ok(job.best,JSON.stringify(job));
 const receipt=await ctx.call('apply_design_candidate_and_review',{jobId:job.jobId,candidateId:job.best.candidateId,requestId:'shear-anchor-apply'});assert.equal(receipt.followUp.status,'completed');
 const snapshot=ctx.bridge.getPracticalDesignSnapshot(receipt.followUp.evaluationId),after=snapshot.checks.find(r=>r.checkId==='foundation-column-transfer');
 assert.ok(Math.abs(after.ratio-after.demand/after.capacity)<1e-10);
 assert.equal(after.status,'OK',JSON.stringify(after));assert.equal(after.providedBelow,.65);assert.equal(after.providedAbove,.65);assert.equal(after.steelAllocation.permanentCompressionCredit,0);assert.ok(after.steelAllocation.tensionRequiredArea>0);assert.equal(after.steelAllocation.shearRequiredArea>0,withShear);assert.ok(after.codeReferences.some(r=>r.id==='142022'&&r.clause.includes('4.6')));
 let text='',offset=0;do{const row=await ctx.call('get_practical_design_check',{evaluationId:receipt.followUp.evaluationId,checkId:after.id,offset,limit:4096});text+=row.chunk;offset=row.nextOffset;}while(offset!==null);assert.deepEqual(JSON.parse(text),after);
 const row=(await ctx.call('get_design_records',{channel:'foundations',id:'F'})).rows.find(r=>r.version===2);assert.equal(row.columnInterfaceSurface,'roughened-6mm');assert.equal(row.columnEmbedmentLength,.65);
 const drawing=buildDetailDrawings(snapshot);assert.ok(drawing.quantities.filter(q=>q.kind==='column-bar-extension').every(q=>q.bodyLength===.65));
 if(withShear){
  m.loads.find(r=>r.id==='F').P=1000;
  const upliftRun=await ctx.bridge.runElasticWorkflow({plan:ctx.bridge.planElasticWorkflow({caseIds:['E']}),requestId:'uplift-run'});assert.equal(upliftRun.ok,true);
  const uplift=await ctx.call('evaluate_practical_design',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,sources:[{analysisRunId:upliftRun.steps[0].analysisRunId,comboId:'U'}]});
  const checks=ctx.bridge.getPracticalDesignSnapshot(uplift.evaluationId).checks;
  assert.equal(checks.find(r=>r.checkId==='foundation-bearing').status,'N_A');
  assert.equal(checks.find(r=>r.checkId==='foundation-overturning').status,'NG');assert.equal(checks.find(r=>r.checkId==='foundation-overturning').reason,'NO_COMPRESSION_CONTACT');
  const transfer=checks.find(r=>r.checkId==='foundation-column-transfer');assert.equal(transfer.status,'NG');assert.equal(transfer.reason,'COLUMN_COMBINED_STEEL_AREA_INSUFFICIENT');assert.ok(transfer.steelAllocation.ratio>1);
 }
 console.log(`PASS actual WebMCP ${withShear?'combined tension/shear':'pure tension'} input, anchorage NG, candidate apply/review OK and separate footing contact gate`);
}finally{await ctx.dispose();}
}
