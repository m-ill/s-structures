import assert from 'node:assert/strict';
import {evaluateKdsSection} from '../src/design/rc/kdsStrength.js';
const As=2*Math.PI*.02**2/4,section={B:.3,H:.6},bars=[-.08,.08].map(z=>({y:-.2,z,area:As/2})),material={fc:24,fy:400,Es:200000};
const a=As*material.fy/(.85*material.fc*section.B),d=.5,capacity=.85*As*material.fy*1000*(d-a/2);
const r=evaluateKdsSection(section,bars,material,{N:0,My:0,Mz:20,signConvention:'solver-native'});
assert.equal(r.status,'OK',JSON.stringify(r));assert.ok(Math.abs(r.capacity-capacity)<1e-4,`${r.capacity} != independent rectangular-block ${capacity}`);
assert.equal(r.sectionDemand.Mz,-20);assert.equal(r.inputSignConvention,'solver-native');
const explicit=evaluateKdsSection(section,bars,material,{N:0,My:0,Mz:-20});assert.ok(Math.abs(explicit.capacity-capacity)<1e-4);
const mirrored=evaluateKdsSection(section,bars.map(b=>({...b,y:-b.y})),material,{N:0,My:0,Mz:-20,signConvention:'solver-native'});assert.ok(Math.abs(mirrored.capacity-capacity)<1e-4);
console.log('PASS solver-positive bending selects bottom tension layer and independent rectangular stress-block strength');

const {designContext}=await import('./fixtures/p24/context.js');
const {resolveMaterialRecord}=await import('../src/materials/registry.js');
const ctx=designContext(),m=ctx.model;
try{
 m.nodes=[{id:'A',x:0,y:0,z:0,support:'fixed'},{id:'B',x:4,y:0,z:0}];m.members=[{id:'AB',type:'frame',n1:'A',n2:'B',matId:'concrete',secId:'rc3060'}];
 const detail={type:'reinforcement-record',id:'R',name:'lower bars',version:1,memberId:'AB',start:0,end:1,cover:.04,barMaterialId:'steel@1',sourceNote:'synthetic',bars:[-.08,.08].map(z=>({y:-.2,z,diameter:20})),reinforcementForm:'single-deformed',strengthStandard:'KDS-142020-2022',concreteWeight:'normal',stirrupDiameter:10,stirrupSpacing:150,stirrupLegs:2,memberRole:'flexural-member',crackControlStandard:'KDS-142020-2022',crackEnvironment:'dry',crackSpecialRequirements:'ordinary-no-special-water-or-appearance',temperatureReinforcementRequired:false,detailingStandard:'KDS-142020-2022',lapRequired:false};
 const preview=await ctx.call('preview_design_changes',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,requestId:'sign-preview',commands:[detail]});await ctx.call('apply_design_changes',{handle:preview.handle,requestId:'sign-apply'});
 m.loadCases=[{id:'D',type:'dead',name:'D'}];m.loads=[{id:'F',type:'nmoment',node:'B',dir:'-y',M:20,case:'D'}];m.loadCombinations=[{id:'U',type:'strength',name:'U',factors:{D:1}},{id:'S',type:'service',name:'S',factors:{D:1}}];m.analysisCases=[{id:'EU',kind:'static',name:'EU',status:'not-run',settings:{comboId:'U',pDeltaMethod:'off'}},{id:'ES',kind:'static',name:'ES',status:'not-run',settings:{comboId:'S',pDeltaMethod:'off'}}];
 const run=await ctx.bridge.runElasticWorkflow({plan:ctx.bridge.planElasticWorkflow({caseIds:['EU','ES']}),requestId:'sign-run'});
 const result=await ctx.call('evaluate_practical_design',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,sources:run.steps.map(s=>({analysisRunId:s.analysisRunId,comboId:m.analysisCases.find(c=>c.id===s.caseId).settings.comboId}))});
 assert.equal(result.ok,true,JSON.stringify(result));const snap=ctx.bridge.getPracticalDesignSnapshot(result.evaluationId);const spacingInput=snap.checks.find(c=>c.checkId==='rc-spacing');assert.equal(spacingInput.reason,'DESIGN_STANDARD_SELECTION_REQUIRED');assert.deepEqual(spacingInput.requiredInputFields,['spacingStandard']);assert.equal(spacingInput.codeBasis.status,'NOT_ESTABLISHED');
 const strength=snap.checks.find(c=>c.checkId==='rc-section-strength'&&c.comboId==='U');assert.equal(strength.status,'OK',JSON.stringify(strength));
 const fy=resolveMaterialRecord(m,'steel@1').strength.steel.Fy,fc=resolveMaterialRecord(m,'concrete').strength.concrete.fck,aa=As*fy/(.85*fc*.3),expected=.85*As*fy*1000*(.5-aa/2);
 assert.ok(Math.abs(strength.capacity-expected)<1e-4);assert.equal(strength.inputSignConvention,'solver-native');assert.ok(Math.abs(strength.sectionDemand.Mz+20)<1e-9);assert.equal(strength.codeBasis.status,'CLAUSE_APPLIED');
 const crack=snap.checks.find(c=>c.checkId==='rc-serviceability'&&c.comboId==='S');assert.equal(crack.status,'OK',JSON.stringify(crack));assert.equal(crack.tensionFace,'negative-y');assert.ok(Math.abs(crack.sectionDemand.Mz+20)<1e-9);
 const minimum=snap.checks.find(c=>c.checkId==='rc-reinforcement-ratio'&&c.comboId==='U'),minimumRatio=1.2*.63*Math.sqrt(fc)*.3*.6**2/6*1000/expected;assert.ok(Math.abs(minimum.ratio-minimumRatio)<1e-6);assert.equal(minimum.status,minimumRatio>1?'NG':'OK');
 console.log('PASS real WebMCP pure bending strength, flexural minimum and correct physical crack tension face');
}finally{await ctx.dispose();}

const unsupported=evaluateKdsSection(section,bars,material,{N:0,My:0,Mz:20,signConvention:'unknown'});assert.equal(unsupported.reason,'SECTION_DEMAND_CONVENTION_UNSUPPORTED');
const tagged=evaluateKdsSection(section,bars,material,{N:0,My:0,Mz:-20,signConvention:'rc-section'});assert.ok(Math.abs(tagged.capacity-capacity)<1e-4);
