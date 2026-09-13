import {ordinaryBeamFixture} from './fixtures/p25/ordinaryBeam.js';
import assert from 'node:assert/strict';
import {designContext} from './fixtures/p24/context.js';
const ctx=designContext(),m=ctx.model;
try{
 const {section,reinforcement,profile}=ordinaryBeamFixture(m);
 const preview=await ctx.call('preview_design_changes',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,requestId:'complete-profile',commands:[section,{type:'member-assignment',memberIds:['AB'],secId:'S@1'},reinforcement,profile]});assert.equal((await ctx.call('apply_design_changes',{handle:preview.handle,requestId:'complete-profile-input'})).ok,true);
 const run=await ctx.bridge.runElasticWorkflow({plan:ctx.bridge.planElasticWorkflow({caseIds:m.analysisCases.map(c=>c.id)}),requestId:'complete-profile-analysis'});assert.equal(run.ok,true);
 const evaluation=await ctx.call('evaluate_practical_design',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,sources:run.steps.map(step=>({analysisRunId:step.analysisRunId,comboId:step.caseId.slice(2)}))});
 const snapshot=ctx.bridge.getPracticalDesignSnapshot(evaluation.evaluationId),memberChecks=snapshot.checks.filter(c=>c.entityId==='AB');
 const expected=['rc-section-strength','rc-stability','rc-shear-y','rc-shear-z','rc-spacing','rc-cover','rc-reinforcement-ratio','rc-confinement','rc-anchorage','rc-splices','rc-deflection','rc-serviceability','rc-torsion','rc-code-compliance'];
 assert.equal(memberChecks.length,56);
 for(const combo of ['U','LIVE','TOTAL','SUST'])assert.deepEqual(memberChecks.filter(c=>c.comboId===combo).map(c=>c.checkId).sort(),[...expected].sort());
 assert.ok(memberChecks.every(c=>['OK','N_A'].includes(c.status)&&!c.incomplete));
 assert.equal(snapshot.summary.combinationCoverage.projectProfile.status,'OK');
 assert.ok(memberChecks.filter(c=>c.checkId==='rc-code-compliance').every(c=>c.status==='OK'));
 assert.equal(snapshot.summary.complete,false,'a member check is not foundation/project qualification');
 const incomplete={...reinforcement,version:2};delete incomplete.crackControlStandard;
 const missingPreview=await ctx.call('preview_design_changes',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,requestId:'missing-crack-rule',commands:[incomplete]});
 assert.equal((await ctx.call('apply_design_changes',{handle:missingPreview.handle,requestId:'missing-crack-rule-apply'})).ok,true);
 const hash=ctx.bridge.getWorkflowInputIdentity().inputHash,sources=run.steps.map(step=>{const reused=ctx.bridge.reuseDesignAnalysis({analysisRunId:step.analysisRunId,inputHash:hash});assert.equal(reused.ok,true);return {analysisRunId:reused.analysisRunId,comboId:step.caseId.slice(2)};});
 const missing=await ctx.call('evaluate_practical_design',{inputHash:hash,sources});
 const missingChecks=ctx.bridge.getPracticalDesignSnapshot(missing.evaluationId).checks.filter(c=>c.entityId==='AB');
 for(const combo of ['LIVE','TOTAL','SUST']){
  assert.equal(missingChecks.find(c=>c.comboId===combo&&c.checkId==='rc-serviceability').status,'NOT_CHECKED');
  assert.equal(missingChecks.find(c=>c.comboId===combo&&c.checkId==='rc-code-compliance').status,'NOT_CHECKED');
 }
 assert.equal(missing.summary.complete,false);
 console.log('PASS complete ordinary RC beam required checks across strength, live, total and sustained sources; full project/foundation qualification separate');
}finally{await ctx.dispose();}
