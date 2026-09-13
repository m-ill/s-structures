import assert from 'node:assert/strict';
import {sectionSizeProposal} from '../src/compute/product/sectionSizeProposal.js';
import {createModel} from '../src/core/model.js';
import {stageDesignInputCommand} from '../src/modeling/designInputCommands.js';
const model=createModel();stageDesignInputCommand(model,{type:'section-record',id:'S',version:1,name:'S',shape:'RECT',dimensionUnit:'mm',B:300,H:500,sourceNote:'test'},{},[]);model.members=[{id:'M',secId:'S@1',type:'frame'}];
const commands=[{id:'R',version:1,memberId:'M',strengthStandard:'KDS-142020-2022'}],row={id:'CHECK',entityId:'M',checkId:'rc-section-strength',status:'NG',detailId:'R',detailVersion:1};
const before=structuredClone(model),p=sectionSizeProposal(commands,[row],model);assert.equal(p.ok,true);assert.deepEqual(p.sectionCandidates,[{B:350,H:500},{B:300,H:550},{B:350,H:550}]);assert.deepEqual(p.basisCheckIds,['CHECK']);assert.equal(p.requiresReanalysis,true);assert.equal(p.architecturalFitVerified,false);assert.deepEqual(model,before);
assert.equal(sectionSizeProposal(commands,[{...row,status:'NOT_CHECKED'}],model).ok,false);assert.equal(sectionSizeProposal(commands,[{...row,detailVersion:3}],model).ok,false);assert.equal(sectionSizeProposal([{...commands[0],locked:true}],[row],model).reason,'DETAIL_LOCKED');
console.log('PASS bounded rectangular section alternatives, current-source checks and immutable model');

const {memberReinforcementProposal}=await import('../src/compute/product/memberReinforcementProposal.js');
const reinforced={...commands[0],type:'reinforcement-record',cover:.04,stirrupDiameter:10,bars:[-.18,.18].flatMap(y=>[-.07,.07].map(z=>({y,z,diameter:20}))),barMaterialId:'steel@1'};
const combined=memberReinforcementProposal([reinforced],[row],model);assert.equal(combined.ok,true,JSON.stringify(combined));assert.ok(combined.regionConstraints?.length,'longitudinal repair remains available');assert.deepEqual(combined.sectionCandidates,[null,...p.sectionCandidates]);assert.equal(combined.components.some(c=>c.sourceSectionId==='S@1'),true);
console.log('PASS constructible longitudinal candidates also retain independently reanalyzed section alternatives');

const serviceCommand={...commands[0],serviceabilityMode:'long-term-curvature'};
const service={id:'SLS',entityId:'M',checkId:'rc-deflection',status:'NG',demand:.03,capacity:.02,liveComboId:'LIVE'};
const servicePlan=sectionSizeProposal([serviceCommand],[service],model);assert.equal(servicePlan.ok,true);assert.ok(servicePlan.basisCheckIds.includes('SLS'));assert.equal(servicePlan.requiresReanalysis,true);
for(const invalid of [{...service,incomplete:true},{...service,demand:NaN},{...service,capacity:0},{...service,demand:.01},{...service,liveComboId:undefined}])assert.equal(sectionSizeProposal([serviceCommand],[invalid],model).ok,false);
assert.equal(sectionSizeProposal(commands,[service],model).ok,false);
console.log('PASS recorded deflection NG triggers reanalyzed section candidates; incomplete or invalid service evidence is rejected');

const {kdsBracedColumnMagnification}=await import('../src/design/rc/kdsStability.js');
const buckling={...kdsBracedColumnMagnification({B:.3,H:.5,E:30000,L:3,N:-10000,My:1,Mz:1}),id:'STAB',entityId:'M',checkId:'rc-stability',detailSources:[{id:'R',version:1,start:0,end:1}]};
assert.equal(buckling.status,'NG');
const stabilityPlan=sectionSizeProposal(commands,[buckling],model);
assert.equal(stabilityPlan.ok,true);assert.deepEqual(stabilityPlan.sectionCandidates,p.sectionCandidates);assert.deepEqual(stabilityPlan.basisCheckIds,['STAB']);
for(const invalid of [{...buckling,incomplete:true},{...buckling,reason:'DIRECT_MOMENT_AMPLIFICATION_LIMIT_EXCEEDED'},{...buckling,detailSources:[{id:'R',version:2}]},{...buckling,axes:null}])assert.equal(sectionSizeProposal(commands,[invalid],model).ok,false);
console.log('PASS recorded gross-section stability NG produces section search, not a reinforcement-only cure');

const mixed=memberReinforcementProposal([reinforced],[row,buckling],model);
assert.equal(mixed.ok,true);assert.ok(mixed.regionConstraints.length);
assert.deepEqual(mixed.sectionCandidates,p.sectionCandidates);
assert.equal(mixed.sectionChangeRequired,true);
assert.ok(mixed.basisCheckIds.includes('STAB')&&mixed.basisCheckIds.includes('CHECK'));
assert.equal(stabilityPlan.sectionChangeRequired,true);
assert.equal(combined.sectionChangeRequired,false);
console.log('PASS simultaneous strength/stability NG skips unchanged gross-section sweeps and preserves bar repair');

const {kdsMemberShear}=await import('../src/design/rc/kdsShear.js');
const shear={...kdsMemberShear({fck:24,fy:235,bw:300,h:500,d:430,Ag:150000,Av:157,s:100,N:0,V:1000}),id:'SHEAR',entityId:'M',checkId:'rc-shear-y',detailId:'R',detailVersion:1};
assert.equal(shear.spacingRepair.reason,'SECTION_SHEAR_CAPACITY_EXCEEDED');
const shearCommands=[{...reinforced,shearStandard:'KDS-142022-2022',stirrupSpacing:100}];
const sp=sectionSizeProposal(shearCommands,[shear],model);
assert.equal(sp.ok,true);assert.equal(sp.sectionChangeRequired,true);assert.deepEqual(sp.basisCheckIds,['SHEAR']);
const repair=memberReinforcementProposal(shearCommands,[shear],model);
assert.equal(repair.ok,true);assert.equal(repair.sectionChangeRequired,true);assert.ok(repair.sectionCandidates.every(Boolean));
for(const invalid of [{...shear,incomplete:true},{...shear,detailVersion:2},{...shear,demand:10},{...shear,VsUpperBound:NaN},{...shear,torsionReinforcement:{}}])assert.equal(sectionSizeProposal(shearCommands,[invalid],model).ok,false);
const ordinary={...shear,spacingRepair:{reason:null,maxSpacing:50}};
assert.equal(sectionSizeProposal(shearCommands,[ordinary],model).ok,false);
assert.equal(sectionSizeProposal(commands,[shear],model).ok,false);
console.log('PASS shear upper-bound failure requires a new section; stale, incomplete and ordinary spacing failures do not');
