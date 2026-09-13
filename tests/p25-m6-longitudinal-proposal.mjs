import {memberReinforcementProposal} from '../src/compute/product/memberReinforcementProposal.js';
import assert from 'node:assert/strict';
import {longitudinalBarProposal} from '../src/compute/product/longitudinalBarProposal.js';
const command={id:'R',version:1,memberId:'M',bars:[-1,1].flatMap(y=>[-1,1].map(z=>({y:y*.2,z:z*.08,diameter:20,designation:'D20',nominalAreaMm2:314}))),strengthStandard:'KDS-142020-2022'};
// memberReinforcementProposal requires the model; the splice-length component
// reads its design details. This member declares none.
const model={designDetails:{}};
const row={id:'S',entityId:'M',checkId:'rc-section-strength',status:'NG',ratio:1.2,detailId:'R',detailVersion:1};
const plan=longitudinalBarProposal([command],[row]);assert.equal(plan.ok,true);
assert.deepEqual(plan.regionConstraints,[{detailId:'R',barsPerFace:[3,4,6]}]);
assert.equal(plan.requiredSteelAreaCalculated,false);assert.equal(plan.automaticApplicationAllowed,false);
assert.equal(longitudinalBarProposal([command],[{...row,reason:'MINIMUM_TENSION_STRAIN_NOT_SATISFIED'}]).ok,false);
assert.equal(longitudinalBarProposal([{...command,crossTieBarPairs:['1:2']}],[row]).ok,false);
assert.equal(longitudinalBarProposal([command],[{...row,detailVersion:2}]).ok,false);
assert.equal(longitudinalBarProposal([command],[{...row,torsionReservedArea:.001}]).ok,false);
assert.equal(longitudinalBarProposal([command],[{...row,status:'NOT_CHECKED'}]).ok,false);
console.log('PASS bounded bar-count search from actual strength NG without inventing required area');

const combined=memberReinforcementProposal([command],[row,{id:'C',entityId:'M',checkId:'rc-confinement',status:'NG',tieSpacingRequirements:[{detailId:'R',detailVersion:1,maxSpacing:150,needsRepair:true}]}],model);
// Missing spacing input does not prevent the independent count search.
assert.equal(combined.ok,true);assert.deepEqual(combined.regionConstraints[0].barsPerFace,[3,4,6]);
const withSpacing=memberReinforcementProposal([{...command,stirrupSpacing:400,tieFirstStart:.2,tieFirstEnd:.2}],[row,{id:'C',entityId:'M',checkId:'rc-confinement',status:'NG',tieSpacingRequirements:[{detailId:'R',detailVersion:1,maxSpacing:150,needsRepair:true}]}],model);
assert.deepEqual(withSpacing.regionConstraints[0],{detailId:'R',spacings:[150],tieFirstStarts:[.075],tieFirstEnds:[.075],barsPerFace:[3,4,6]});
assert.deepEqual(new Set(withSpacing.basisCheckIds),new Set(['S','C']));

const {REBAR_CATALOG_ID}=await import('../src/materials/rebarProductCatalog.js');
const catalog={...command,barCatalogId:REBAR_CATALOG_ID,barProductGrade:'SD400',bars:command.bars.map(b=>({...b,diameter:19.1,designation:'D19',nominalAreaMm2:286.5}))};
const productPlan=longitudinalBarProposal([catalog],[row]);assert.equal(productPlan.ok,true,JSON.stringify(productPlan));
assert.deepEqual(productPlan.regionConstraints[0].diameters,[19.1,22.2,25.4]);assert.deepEqual(productPlan.regionConstraints[0].barsPerFace,[2,3,4,6]);assert.equal(productPlan.productChoices[0].catalogId,REBAR_CATALOG_ID);assert.equal(productPlan.productChoices[0].grade,'SD400');assert.equal(productPlan.productChoices[0].certificateVerified,false);
assert.equal(longitudinalBarProposal([{...catalog,barCatalogId:'unknown'}],[row]).reason,'LONGITUDINAL_CATALOG_SOURCE_REQUIRED');

const catalogCombined=memberReinforcementProposal([{...catalog,stirrupSpacing:400}],[row,{id:'C2',entityId:'M',checkId:'rc-confinement',status:'NG',tieSpacingRequirements:[{detailId:'R',detailVersion:1,maxSpacing:150,needsRepair:true}]}],model);assert.equal(catalogCombined.productChoices[0].catalogId,REBAR_CATALOG_ID);

const minimum={...row,id:'MIN',checkId:'rc-reinforcement-ratio',requiredCapacity:50,capacity:40};
const detailingCommand={...command,detailingStandard:'KDS-142020-2022'};
assert.equal(longitudinalBarProposal([detailingCommand],[minimum]).ok,true,'minimum flexural reinforcement NG must start a count search even with passing strength');
const columnMinimum={...minimum,requiredCapacity:undefined,capacity:undefined,providedRatio:.005,minRatio:.01,maxRatio:.08,barCount:4,minBarCount:4};
assert.equal(longitudinalBarProposal([detailingCommand],[columnMinimum]).ok,true);
assert.equal(longitudinalBarProposal([detailingCommand],[{...columnMinimum,providedRatio:.09}]).ok,false,'maximum steel is not repaired by adding steel');
assert.equal(longitudinalBarProposal([detailingCommand],[{...minimum,incomplete:true}]).ok,false);
assert.equal(longitudinalBarProposal([command],[minimum]).ok,false);
assert.equal(longitudinalBarProposal([detailingCommand],[{...minimum,capacity:NaN}]).ok,false);
console.log('PASS minimum flexural/compression steel triggers bounded search; maximum steel and incomplete evidence are excluded');

const {memberCageProposal}=await import('../src/compute/product/memberCageProposal.js');
const collision={...row,checkId:'rc-confinement',reason:'SPATIAL_HOOP_LONGITUDINAL_COLLISION',outerHoop:{actualPathAssembly:{status:'NG'}}};
assert.equal(memberCageProposal([{...command,locked:true}],[collision]).ok,false);
assert.equal(memberCageProposal([command],[{...collision,outerHoop:undefined}]).ok,false);
assert.equal(memberCageProposal([command],[{...collision,detailVersion:2}]).ok,false);
assert.equal(memberCageProposal([command],[{...collision,status:'NOT_CHECKED'}]).ok,false);
