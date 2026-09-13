import {selectDrawingSnapshot} from '../src/report/phase24/drawingSnapshot.js';
import {encodeQuantityCsv} from '../src/report/phase24/quantityCsv.js';
import {drawingsToSvg} from '../src/report/phase24/detailDrawings.js';
import {REQUIRED_FOUNDATION_CHECKS} from '../src/design/evaluation/practicalEvaluation.js';
import {retainedBytes} from '../src/core/resourceBudget.js';
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
 m.nodes=[{id:'A',x:0,y:0,z:0,support:'fixed'},{id:'B',x:0,y:0,z:3}];m.members=[{id:'AB',type:'frame',n1:'A',n2:'B',matId:'concrete',secId:'rc3060'}];m.loadCases=[{id:'D',type:'dead',name:'D'}];m.loads=[{id:'F',type:'nodal',node:'B',P:10,dir:'-z',case:'D'}];m.loadCombinations=[{id:'U',type:'strength',name:'U',factors:{D:1.4}}];m.loadCombinations.push({id:'S',name:'S',type:'service',factors:{D:1}});m.analysisCases=[{id:'E',name:'E',kind:'static',status:'not-run',settings:{comboId:'U',pDeltaMethod:'off'}}];
 m.analysisCases.push({id:'ES',name:'service',kind:'static',status:'not-run',settings:{comboId:'S',pDeltaMethod:'off'}});
 const ground={type:'ground-record',id:'G',name:'synthetic',version:1,sourceNote:'test',sourceReference:'fixture',basisStatus:'specified',allowableBearing:150,bearingBasis:'gross',settlementMethod:'layered-two-to-one-gross',settlementLayers:['2:10000','3:20000'],settlementReference:'synthetic soil input, not a site report',settlementLimit:.025,friction:.4,slidingMethod:'coulomb-service-safety-factor',slidingSafetyFactor:1.5,slidingFactorReference:'synthetic explicit input'};
 const columnBars={type:'reinforcement-record',id:'R',name:'continuous column bars',version:1,sourceNote:'synthetic',memberId:'AB',start:0,end:1,cover:.04,barMaterialId:'steel@1',reinforcementForm:'single-deformed',barCoating:'uncoated',lapRequired:false,bars:[-1,1].flatMap(y=>[-1,1].map(z=>({y:y*.2,z:z*.08,diameter:20})))};
 const footing={aggregateMaxSize:.02,columnTransferType:'cast-in-place-continuous-straight-bars',columnMemberId:'AB',columnEmbedmentLength:.3,columnDevelopmentAbove:.3,barShape:'straight',shrinkageRestraint:'ordinary-not-severely-restrained',type:'foundation-record',id:'F',name:'synthetic',version:1,sourceNote:'test',nodeId:'A',foundationType:'isolated',B:2,L:2,thickness:.5,cover:.05,materialId:'concrete@1',groundId:'G@1',barMaterialId:'steel@1',bottomDiameterB:16,bottomDiameterL:16,bottomSpacingB:150,bottomSpacingL:150,topDiameterB:16,topDiameterL:16,topSpacingB:150,topSpacingL:150,footingWeightCaseId:'D',reactionBasis:'superstructure-only',columnWidth:.6,columnDepth:.3,flexureStandard:'KDS-142020-2022',concreteWeight:'normal',barCoating:'uncoated',punchingStandard:'KDS-142022-2022',punchingMomentMethod:'conservative-perimeter-shear',punchingPerimeterScope:'interior-solid-no-openings'};
 assert.ok((await ctx.call('get_design_input_schema',{type:'foundation-record'})).schema.properties.topDiameterB);
 const staging=structuredClone(m);for(const c of [ground,columnBars,footing])stagePracticalDesignInput(staging,c,[]);assert.equal(validateModel(staging).ok,true,JSON.stringify(validateModel(staging)));
 const preview=await ctx.call('preview_design_changes',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,requestId:'footing-preview',commands:[ground,columnBars,footing]});
 assert.equal((await ctx.call('apply_design_changes',{handle:preview.handle,requestId:'footing-apply'})).ok,true);
 const stored=(await ctx.call('get_design_records',{channel:'foundations',id:'F'})).rows[0];assert.equal(stored.reinforcement.topB.diameter,.016);assert.deepEqual(validateStoredDesignDetails(m),[]);
 const run=await ctx.bridge.runElasticWorkflow({plan:ctx.bridge.planElasticWorkflow({caseIds:['E','ES']}),requestId:'footing-source'});assert.equal(run.ok,true);
 const result=await ctx.call('evaluate_practical_design',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,sources:run.steps.map(step=>({analysisRunId:step.analysisRunId,comboId:step.caseId==='E'?'U':'S'}))});
 const checks=[...result.checks];let next=result.nextOffset;while(next!==null){const page=await ctx.call('get_practical_design_result',{evaluationId:result.evaluationId,offset:next});checks.push(...page.checks);next=page.nextOffset;}


 const rows=checks.filter(c=>c.entityId==='foundation:A');
 const get=(combo,id)=>rows.find(c=>c.comboId===combo&&c.checkId===id);
 assert.equal(rows.length,30);
 for(const combo of ['U','S'])assert.deepEqual(rows.filter(c=>c.comboId===combo).map(c=>c.checkId).sort(),[...REQUIRED_FOUNDATION_CHECKS].sort());
 for(const id of ['foundation-reinforcement','foundation-column-transfer']){
  assert.equal(get('U',id).status,'OK');
  assert.equal(get('S',id).status,'N_A');
  assert.equal(get('S',id).reason,'CHECK_REQUIRES_STRENGTH_COMBINATION');
 }
 for(const id of ['foundation-flexure','foundation-one-way-shear','foundation-spacing','foundation-depth','foundation-distribution','foundation-anchorage'])assert.equal(get('U',id).status,'OK');
 assert.equal(get('U','foundation-punching').reason,'PUNCHING_REINFORCEMENT_EXTENSION_INSUFFICIENT');
 assert.equal(get('U','foundation-punching').status,'NG');
 assert.equal(get('S','foundation-ground-review').reason,'INDEPENDENT_GROUND_REVIEW_EVIDENCE_REQUIRED');
 assert.equal(get('S','foundation-settlement').reason,'GEOTECHNICAL_SETTLEMENT_REVIEW_PENDING');
 assert.equal(get('S','foundation-settlement').mechanicsStatus,'OK');
 assert.equal(get('S','foundation-settlement').layers.length,2);
 assert.equal(result.summary.complete,false);
 const plan=await ctx.call('plan_design_candidates',{evaluationId:result.evaluationId,foundationId:'F',maxCandidates:1,maxMillis:10000});
 assert.equal(plan.generation.ok,true);
 const started=await ctx.call('start_design_candidates',{planId:plan.planId,requestId:'profile-footing-repair'});
 let job;for(let i=0;i<500;i++){job=await ctx.call('get_design_candidates',{jobId:started.jobId});if(job.status!=='running')break;await new Promise(resolve=>setTimeout(resolve,10));}
 assert.ok(job.best,JSON.stringify(job));
 const applied=await ctx.call('apply_design_candidate_and_review',{jobId:started.jobId,candidateId:job.best.candidateId,requestId:'profile-footing-apply'});
 assert.equal(applied.ok,true,JSON.stringify(applied));
 const after=ctx.bridge.getPracticalDesignSnapshot(applied.followUp.evaluationId);
 const repaired=after.checks.find(c=>c.entityId==='foundation:A'&&c.comboId==='U'&&c.checkId==='foundation-punching');
 assert.equal(repaired.status,'OK',JSON.stringify(repaired));
 assert.ok(repaired.extensions.every(e=>e.available>=e.required));
 assert.equal(after.summary.complete,false);
 const settlement=after.checks.find(c=>c.entityId==='foundation:A'&&c.comboId==='S'&&c.checkId==='foundation-settlement');
 const changedFooting=(await ctx.call('get_design_records',{channel:'foundations',id:'F'})).rows.at(-1);
 mkdirSync('output/phase25',{recursive:true});writeFileSync('output/phase25/profile-footing-record.json',JSON.stringify(changedFooting,null,2));
 let independentSettlement=0;
 for(const [top,bottom,modulus] of [[0,2,10000],[2,5,20000]]){
  const dz=(bottom-top)/2000;
  for(let i=0;i<2000;i++){const z=top+(i+.5)*dz;independentSettlement+=settlement.loadLedger.totalN/((changedFooting.B+z)*(changedFooting.L+z))/modulus*dz;}
 }
 assert.ok(Math.abs(settlement.demand-independentSettlement)<1e-9);
 assert.equal(settlement.mechanicsStatus,'OK');
 assert.equal(settlement.status,'NOT_CHECKED');
 assert.equal(settlement.reason,'GEOTECHNICAL_SETTLEMENT_REVIEW_PENDING');
 const groundAfter=after.checks.find(c=>c.entityId==='foundation:A'&&c.comboId==='S'&&c.checkId==='foundation-ground-review');
 assert.notEqual(groundAfter.scopeHash,get('S','foundation-ground-review').scopeHash);
 assert.notEqual(settlement.loadLedger.totalN,get('S','foundation-settlement').loadLedger.totalN);

 assert.ok(retainedBytes(applied)<16000);
 assert.equal(applied.followUp.comparison.detailsTruncated,true);
 const q=applied.followUp.comparison.comparisonDetailQuery;
 let comparisonText='',partOffset=0;
 do{const part=await ctx.call(q.tool,{evaluationId:q.evaluationId,checkId:q.checkId,offset:partOffset,limit:2000});comparisonText+=part.chunk;partOffset=part.nextOffset;}while(partOffset!==null);
 const fullComparison=JSON.parse(comparisonText);
 assert.equal(fullComparison.afterEvaluationId,after.id);
 assert.equal(fullComparison.beforeEvaluationId,result.evaluationId);
 assert.ok(fullComparison.completionBlockers);
 const replay=await ctx.call('apply_design_candidate_and_review',{jobId:started.jobId,candidateId:job.best.candidateId,requestId:'profile-footing-apply'});
 assert.equal(replay.followUp.evaluationId,applied.followUp.evaluationId);

 assert.equal(m.loads[0].P,10);
 const finalRows=after.checks.filter(c=>c.entityId==='foundation:A');
 for(const c of finalRows.filter(c=>!['foundation-ground-review','foundation-settlement','foundation-code-compliance'].includes(c.checkId)))assert.ok(['OK','N_A'].includes(c.status),JSON.stringify(c));
 assert.deepEqual(selectDrawingSnapshot(after).designComparison,fullComparison);
 const drawing=buildDetailDrawings(after,{maxPages:600,checkRetention:'reference'});
 assert.equal(drawing.designComparison.proposalProvenance.basis,fullComparison.proposalProvenance.basis);
 assert.deepEqual(drawing.designComparison.connectedGeometryChanges,fullComparison.connectedGeometryChanges);
 const pageText=p=>p.commands.filter(c=>c.kind==='text').map(c=>c.text).join(' ');
 const selected=[drawing.pages.find(p=>p.detailId==='F'),drawing.pages.find(p=>pageText(p).includes('후보 적용 전후 비교')),drawing.pages.find(p=>pageText(p).includes('foundation-punching'))];
 assert.ok(selected.every(Boolean));assert.equal(new Set(selected).size,3);
 mkdirSync('output/pdf/phase25',{recursive:true});
 writeFileSync('output/pdf/phase25/foundation-profile-proof.pdf',buildVectorDetailPdf(selected,new Uint8Array(readFileSync('assets/fonts/phase24/SStructuresSans.ttf'))));
 writeFileSync('output/pdf/phase25/foundation-profile-quantities.csv',encodeQuantityCsv(drawing));
 selected.forEach((p,i)=>writeFileSync('output/pdf/phase25/foundation-profile-page-'+(i+1)+'.svg',drawingsToSvg(p)));
 writeFileSync('output/pdf/phase25/foundation-profile-proof.json',JSON.stringify({evaluationId:after.id,inputHash:after.inputHash,preparedGeometryHash:drawing.preparedGeometryHash,rulePackHash:drawing.rulePackHash,totalPages:drawing.totalPages,selectedPages:selected.map(p=>drawing.pages.indexOf(p)+1),checks:drawing.checks,quantities:drawing.quantities,reviewOnly:true},null,2));
 console.log(JSON.stringify({scope:'synthetic centered footing after one actual repair, not complete KDS qualification',checks:finalRows.map(c=>({combo:c.comboId,checkId:c.checkId,status:c.status,reason:c.reason,codeBasisStatus:c.codeBasis?.status,incomplete:c.incomplete||false})),settlement:{demand:settlement.demand,independentMidpoint:independentSettlement,method:settlement.method,mechanicsStatus:settlement.mechanicsStatus,reviewStatus:settlement.status},reviewScopeChanged:true},null,2));
 console.log('PASS two-combination foundation required checks: strength-only applicability, actual structural results, extension NG and missing ground evidence retained');
}finally{await ctx.dispose();}
