import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {buildVectorDetailPdf} from '../src/report/phase24/vectorPdf.js';
import {evaluateColumnTransfer} from '../src/design/foundation/columnTransfer.js';
import {resolveFootingLoadLedger} from '../src/design/foundation/footingLoadLedger.js';
import assert from 'node:assert/strict';
import {stagePracticalDesignInput} from '../src/modeling/practicalDesignInputs.js';
import {validateModel} from '../src/core/validation.js';
import {designContext} from './fixtures/p24/context.js';
import {buildDetailDrawings} from '../src/report/phase24/detailDrawings.js';
import {validateStoredDesignDetails} from '../src/modeling/designDetailValidation.js';
const ctx=designContext(),m=ctx.model;
try{
 m.nodes=[{id:'A',x:0,y:0,z:0,support:'fixed'},{id:'B',x:0,y:0,z:3}];m.members=[{id:'AB',type:'frame',n1:'A',n2:'B',matId:'concrete',secId:'rc3060'}];m.loadCases=[{id:'D',type:'dead',name:'D'}];m.loads=[{id:'F',type:'nodal',node:'B',P:10,dir:'-z',case:'D'},{id:'T',type:'nmoment',node:'B',M:.5,dir:'+z',case:'D'}];m.loadCombinations=[{id:'U',type:'strength',name:'U',factors:{D:1.4}}];m.analysisCases=[{id:'E',name:'E',kind:'static',status:'not-run',settings:{comboId:'U',pDeltaMethod:'off'}}];
 const ground={type:'ground-record',id:'G',name:'synthetic',version:1,sourceNote:'test',sourceReference:'fixture',basisStatus:'specified',allowableBearing:150,bearingBasis:'gross'};
 const columnBars={type:'reinforcement-record',id:'R',name:'continuous column bars',version:1,sourceNote:'synthetic',memberId:'AB',start:0,end:1,cover:.04,barMaterialId:'steel@1',reinforcementForm:'single-deformed',barCoating:'uncoated',lapRequired:false,bars:[-1,1].flatMap(y=>[-1,1].map(z=>({y:y*.2,z:z*.08,diameter:20})))};
 const footing={columnInterfaceSurface:'monolithic',columnInterfacePreparationReference:'synthetic interface',columnTransferType:'cast-in-place-continuous-straight-bars',columnMemberId:'AB',columnEmbedmentLength:.3,columnDevelopmentAbove:.3,barShape:'straight',shrinkageRestraint:'ordinary-not-severely-restrained',type:'foundation-record',id:'F',name:'synthetic',version:1,sourceNote:'test',nodeId:'A',foundationType:'isolated',B:2,L:2,thickness:.5,cover:.05,materialId:'concrete@1',groundId:'G@1',barMaterialId:'steel@1',bottomDiameterB:16,bottomDiameterL:16,bottomSpacingB:150,bottomSpacingL:150,topDiameterB:16,topDiameterL:16,topSpacingB:150,topSpacingL:150,footingWeightCaseId:'D',reactionBasis:'superstructure-only',columnWidth:.6,columnDepth:.3,flexureStandard:'KDS-142020-2022',concreteWeight:'normal',barCoating:'uncoated',punchingStandard:'KDS-142022-2022',punchingMomentMethod:'conservative-perimeter-shear',punchingPerimeterScope:'interior-solid-no-openings'};
 assert.ok((await ctx.call('get_design_input_schema',{type:'foundation-record'})).schema.properties.topDiameterB);
 const staging=structuredClone(m);for(const c of [ground,columnBars,footing])stagePracticalDesignInput(staging,c,[]);assert.equal(validateModel(staging).ok,true,JSON.stringify(validateModel(staging)));
 const preview=await ctx.call('preview_design_changes',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,requestId:'footing-preview',commands:[ground,columnBars,footing]});
 assert.equal((await ctx.call('apply_design_changes',{handle:preview.handle,requestId:'footing-apply'})).ok,true);
 const stored=(await ctx.call('get_design_records',{channel:'foundations',id:'F'})).rows[0];assert.equal(stored.reinforcement.topB.diameter,.016);assert.deepEqual(validateStoredDesignDetails(m),[]);
 const run=await ctx.bridge.runElasticWorkflow({plan:ctx.bridge.planElasticWorkflow({caseIds:['E']}),requestId:'footing-source'});assert.equal(run.ok,true);
 const result=await ctx.call('evaluate_practical_design',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,sources:[{analysisRunId:run.steps[0].analysisRunId,comboId:'U'}]});
 const snapshot=ctx.bridge.getPracticalDesignSnapshot(result.evaluationId),check=snapshot.checks.find(c=>c.checkId==='foundation-column-transfer');
 assert.ok(check.development.every(d=>d.mode==='tension-for-interface-torsion'),'torsion friction bars require tensile development on both sides');
 assert.equal(check.status,'NG');assert.equal(check.governingCriterion,'development-below');assert.ok(check.requiredBelow>.3);assert.equal(check.incomplete,true);assert.equal(check.torsionDistribution.status,'CALCULATED');assert.equal(check.torsionDistribution.capacityCalculated,false);assert.equal(check.torsionSteelAllocation.status,'OK',JSON.stringify(check.torsionSteelAllocation));assert.equal(check.torsionSteelAllocation.rows.length,4);
 const T=snapshot.sets[0].set.reactions.A.rmz;assert.ok(Math.abs(T)>.1);assert.ok(Math.abs(check.torsionDistribution.resultant.T-T)<1e-9);assert.ok(check.codeReferences.length);
 const reaction=snapshot.sets[0].set.reactions.A,ledger=resolveFootingLoadLedger(m,stored,reaction,m.loadCombinations[0]);
 const lengthened=evaluateColumnTransfer(m,{...stored,columnEmbedmentLength:.4,columnDevelopmentAbove:.4},reaction,ledger);assert.equal(lengthened.status,'NOT_CHECKED');assert.equal(lengthened.normalTransfer.status,'OK');assert.equal(lengthened.ratio,null);
 const overloaded=evaluateColumnTransfer(m,stored,{...reaction,rmz:10000},ledger);assert.equal(overloaded.status,'NG');assert.equal(overloaded.torsionSteelAllocation.status,'NG');assert.equal(overloaded.incomplete,true);
 const plan=await ctx.call('plan_design_candidates',{evaluationId:result.evaluationId,foundationId:'F',maxCandidates:1,maxMillis:10000});assert.equal(plan.generation.ok,true);assert.ok(plan.generation.edits[0].columnEmbedmentLength>=check.requiredBelow);assert.equal(plan.generation.edits[0].thickness,undefined);
 const started=await ctx.call('start_design_candidates',{planId:plan.planId,requestId:'torsion-development-repair'});let job;
 for(let i=0;i<500;i++){job=await ctx.call('get_design_candidates',{jobId:started.jobId});if(job.status!=='running')break;await new Promise(r=>setTimeout(r,10));}
 assert.ok(job.best,JSON.stringify(job));
 const applied=await ctx.call('apply_design_candidate_and_review',{jobId:started.jobId,candidateId:job.best.candidateId,requestId:'torsion-development-apply'});assert.equal(applied.followUp.status,'completed',JSON.stringify(applied));
 const repaired=ctx.bridge.getPracticalDesignSnapshot(applied.followUp.evaluationId).checks.find(c=>c.checkId==='foundation-column-transfer');assert.equal(repaired.normalTransfer.status,'OK');assert.equal(repaired.status,'NOT_CHECKED');assert.equal(repaired.incomplete,true);
 console.log('PASS real WebMCP torsion reaction -> bar-group equilibrium diagnostics with incomplete capacity gate');
}finally{await ctx.dispose();}
