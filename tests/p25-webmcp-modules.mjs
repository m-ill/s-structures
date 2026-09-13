import assert from 'node:assert/strict';
import {designContext} from './fixtures/p24/context.js';
const ctx=designContext();
try {
 const before=JSON.stringify(ctx.model),inventory=await ctx.call('get_design_modules');
 assert.equal(inventory.modules.length,8);
 assert.ok(JSON.stringify(inventory).length<=48000,'complete inventory stays within WebMCP result budget');
 assert.ok(inventory.modules.find(m=>m.id==='foundations').currentTools.includes('release_practical_design_result'));
 assert.ok(inventory.modules.find(m=>m.id==='optimization').currentTools.includes('release_design_candidates'));
 const lap=inventory.modules.find(m=>m.id==='reinforcement').designCapabilities.rcLap;assert.ok(lap.supported.includes('variable-pure-tension'));assert.equal(lap.limits.maxStrengthChecks,2400);assert.equal(lap.automaticRepair.explicitCandidateOptIn,'repairSpliceLengths');assert.equal(lap.productionQualified,false);
 const sectionRepair=inventory.modules.find(m=>m.id==='optimization').designCapabilities.sectionRepair;
 assert.equal(sectionRepair.jointRepair.preservesSpatialCornerContacts,true);assert.equal(sectionRepair.jointRepair.maxLongitudinalPhaseTrials,40);assert.equal(sectionRepair.jointRepair.noFeasibleLayoutMutatesInput,false);
 assert.equal(sectionRepair.requiresReanalysis,true);assert.equal(sectionRepair.automaticWholeDesignApproval,false);
 assert.ok(sectionRepair.coupledInputs.includes('joint-panel-height-from-connected-horizontal-beams'));
 assert.equal(sectionRepair.limits.maxConnectedDetails,8);assert.equal(sectionRepair.stability.variableAxialForceSupported,false);
 assert.equal(sectionRepair.changeEvidence.appliedSource,'actual-before-and-after-model');
 const names=ctx.tools.map(x=>x.name);
 assert.equal(new Set(names).size,names.length,'no duplicate tool names');
 for(const tool of [...lap.tools,...sectionRepair.tools])assert.ok(names.includes(tool));
 for(const module of inventory.modules){
  assert.ok(module.currentTools.includes('get_design_rule_catalog'),module.id);assert.equal(new Set(module.currentTools).size,module.currentTools.length);if(module.designCapabilities?.rcLap)for(const tool of module.designCapabilities.rcLap.tools)assert.ok(module.currentTools.includes(tool));
  if(module.designCapabilities?.sectionRepair)for(const tool of module.designCapabilities.sectionRepair.tools)assert.ok(module.currentTools.includes(tool));
  for(const name of module.currentTools)assert.ok(names.includes(name),`${module.id}: missing actual tool ${name}`);
  assert.deepEqual((await ctx.call('get_design_modules',{moduleId:module.id})).modules,[module]);
  for(const type of module.inputTypes){
   const schema=await ctx.call('get_design_input_schema',{type});
   assert.deepEqual(schema,ctx.bridge.getDesignInputSchema({type}));
  }
 }
 assert.equal(inventory.modules.find(m=>m.id==='member-review').designCapabilities.sectionRepairRef.moduleId,'optimization');
 const member=inventory.modules.find(m=>m.id==='member-review'),capability=member.analysisCapabilities.rcSplice;
 const direct=member.analysisCapabilities.rcDirect;
 assert.equal(direct.stiffnessMode,'kds-elastic-second-order');assert.equal(direct.productionQualified,false);
 assert.equal(direct.limits.maxFrameDivisions,8);assert.ok(direct.checks.includes('rc-stability'));assert.ok(direct.checks.includes('rc-deflection'));
 for(const tool of direct.tools){assert.ok(names.includes(tool));assert.ok(member.currentTools.includes(tool));}
 assert.ok(direct.pending.includes('long-term-creep-and-shrinkage'));
 assert.deepEqual(capability.pDeltaMethods,['off','direct']);assert.equal(capability.productionQualified,false);assert.equal(capability.limits.maxExpandedNodes,20);assert.ok(capability.pending.includes('semi-rigid-diaphragm'));
 for(const tool of capability.tools)assert.ok(names.includes(tool));
 assert.equal(member.designCapabilities.offsetRc.rigidRegionsReviewed,false);assert.equal(member.designCapabilities.offsetRc.reinforcementBoundaryRecovery,true);
 const segmented=member.designCapabilities.segmentedRc;assert.deepEqual(segmented.checks,['rc-section-strength','rc-shear-y','rc-shear-z']);assert.equal(segmented.sectionTransitionShearQualified,false);assert.equal(segmented.limits.maxStations,600);
 const context=await ctx.call('get_practical_design_context');assert.deepEqual(context.rcSpliceInterval.capabilities,capability);
 capability.pDeltaMethods.push('fake');assert.deepEqual((await ctx.call('get_design_modules',{moduleId:'member-review'})).modules[0].analysisCapabilities.rcSplice.pDeltaMethods,['off','direct']);
 lap.limits.maxLayouts=999;assert.equal((await ctx.call('get_design_modules',{moduleId:'reinforcement'})).modules[0].designCapabilities.rcLap.limits.maxLayouts,64);
 assert.equal(sectionRepair.continuation.preparedDuringEvaluation,true);assert.equal(sectionRepair.continuation.targetTool,'plan_design_candidates');assert.equal(sectionRepair.continuation.maxTargets,32);
 assert.equal(sectionRepair.shear.trigger,'SECTION_SHEAR_CAPACITY_EXCEEDED');assert.equal(sectionRepair.shear.ordinarySpacingFailureRequiresSectionChange,false);assert.ok(sectionRepair.triggerChecks.includes('rc-shear-y'));
 sectionRepair.coupledInputs.push('fake');assert.ok(!(await ctx.call('get_design_modules',{moduleId:'optimization'})).modules[0].designCapabilities.sectionRepair.coupledInputs.includes('fake'));
 assert.equal(JSON.stringify(ctx.model),before);
 console.log('PASS eight modules: actual WebMCP registration, shared typed schemas and immutable inventory');
}finally{await ctx.dispose();}
