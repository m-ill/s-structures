import assert from 'node:assert/strict';
import {foundationSteelProposal} from '../src/compute/product/foundationSteelProposal.js';
import {footingBarLayout} from '../src/design/foundation/footingBarLayout.js';
const f={id:'F',version:1,nodeId:'A',B:2,L:2,cover:.05,reinforcement:{bottomB:{diameter:.012,spacing:.5},bottomL:{diameter:.012,spacing:.5}}};
const command={id:'F',version:1,nodeId:'A',bottomSpacingB:500,bottomSpacingL:500};
const model={designDetails:{foundations:[f]}};
const row={id:'MIN',entityId:'foundation:A',checkId:'foundation-reinforcement',axisChecks:[{axis:'B',face:'bottom',status:'NG',requiredArea:.002,maximumSpacing:.45}]};
const p=foundationSteelProposal(command,[row],model);assert.equal(p.ok,true);assert.equal(p.edits[0].bottomSpacingL,undefined);
const layout=footingBarLayout({...f,reinforcement:{...f.reinforcement,bottomB:{...f.reinforcement.bottomB,spacing:p.edits[0].bottomSpacingB/1000}}},'bottom','B');assert.ok(layout.area>=.002);assert.ok(layout.maximumSpacing<=.45);assert.ok(p.edits.length<=3);
const flex={id:'FLEX',entityId:'foundation:A',checkId:'foundation-flexure',axisChecks:[{axis:'L',face:'bottom',status:'NG',ratio:2}]};
const both=foundationSteelProposal(command,[row,flex],model);assert.ok(both.edits.every(e=>e.bottomSpacingB&&e.bottomSpacingL));assert.equal(both.requiredFlexuralAreaCalculated,false);
assert.equal(foundationSteelProposal(command,[{...flex,axisChecks:[{...flex.axisChecks[0],reason:'MINIMUM_TENSION_STRAIN_NOT_SATISFIED'}]}],model).ok,false);
assert.equal(f.reinforcement.bottomB.spacing,.5);
console.log('PASS footing required minimum area and bounded flexural spacing alternatives');

const flexCounts=both.edits.map(e=>footingBarLayout({...f,reinforcement:{...f.reinforcement,bottomL:{...f.reinforcement.bottomL,spacing:e.bottomSpacingL/1000}}},'bottom','L').count);
assert.equal(new Set(flexCounts).size,flexCounts.length,'do not spend all flexural alternatives on the same area');
assert.ok(flexCounts.at(-1)>flexCounts[0]+1);

const congested=foundationSteelProposal(command,[{...row,axisChecks:[{...row.axisChecks[0],requiredArea:.0035}]}],{designDetails:{foundations:[{...f,aggregateMaxSize:.05}]}});
assert.equal(congested.ok,false,'do not reach required area by violating specified aggregate clearance');

const {foundationRepairProposal}=await import('../src/compute/product/foundationRepairProposal.js');
const expandedFooting={...f,thickness:.3,reinforcement:{...f.reinforcement,materialId:'rebar@1'}};
const expandedModel={materials:[{id:'rebar',version:1,type:'steel',elastic:{E:200000},strength:{steel:{Fy:400}}}],designDetails:{foundations:[expandedFooting]}};
const expandedCommand={...command,thickness:.3,columnEmbedmentLength:.1,columnDevelopmentAbove:.1};
const transfer={id:'TRANSFER',entityId:'foundation:A',checkId:'foundation-column-transfer',requiredBelow:.7,requiredAbove:.2,criteria:[{id:'embedment-envelope',capacity:.24},{id:'column-region-envelope',capacity:3}]};
const existingMinimum={...row,axisChecks:[{axis:'B',face:'bottom',status:'NG',requiredArea:.0012,maximumSpacing:.45}]};
const combined=foundationRepairProposal(expandedCommand,[transfer,existingMinimum],expandedModel);
assert.equal(combined.ok,true);
assert.ok(combined.edits[0].thickness>.7);
const rebuilt=footingBarLayout({...expandedFooting,reinforcement:{...expandedFooting.reinforcement,bottomB:{...f.reinforcement.bottomB,spacing:combined.edits[0].bottomSpacingB/1000}}},'bottom','B');
assert.ok(rebuilt.area>=Math.min(.002*2*combined.edits[0].thickness,.0036)-1e-12,'combined repair must size steel for proposed thickness, not old thickness');
assert.equal(expandedFooting.thickness,.3);
assert.ok(combined.components.find(c=>c.minimumSteelThickness===combined.edits[0].thickness));
console.log('PASS coupled development thickness and minimum steel demand');

const adequateFooting={...expandedFooting,reinforcement:{...expandedFooting.reinforcement,bottomB:{diameter:.012,spacing:.15}}};
const adequateModel={...expandedModel,designDetails:{foundations:[adequateFooting]}};
const originallyOK={...existingMinimum,axisChecks:[{...existingMinimum.axisChecks[0],status:'OK'}]};
const newNeed=foundationRepairProposal({...expandedCommand,bottomSpacingB:150},[transfer,originallyOK],adequateModel);
assert.ok(newNeed.edits[0].bottomSpacingB<150,'thickness increase can introduce a new minimum steel deficiency');
assert.equal(originallyOK.axisChecks[0].status,'OK','recorded evaluation stays immutable');
const missingMaterial={...expandedModel,materials:[]};
assert.equal(foundationSteelProposal(expandedCommand,[existingMinimum],missingMaterial,{thickness:.8}).ok,false,'no guessed steel strength during resized minimum calculation');

const {footingMinimumSteel}=await import('../src/design/foundation/footingMinimumSteel.js');
const widthBase={...expandedFooting,thickness:.31,reinforcement:{...expandedFooting.reinforcement,bottomB:{diameter:.012,spacing:.18}}};
const widthModel={...expandedModel,designDetails:{foundations:[widthBase]}};
const widthCommand={...command,B:2,L:2,thickness:.31,bottomSpacingB:180};
const oldLayout=footingBarLayout(widthBase,'bottom','B');
const oldMinimum=footingMinimumSteel({width:2,thickness:.31,fy:400,area:oldLayout.area,spacing:oldLayout.maximumSpacing});assert.equal(oldMinimum.status,'OK');
const widthCheck={id:'WIDTH-MIN',checkId:'foundation-reinforcement',entityId:'foundation:A',axisChecks:[{...oldMinimum,face:'bottom',axis:'B'}]};
const widthProposal=foundationSteelProposal(widthCommand,[widthCheck],widthModel,{B:2,L:2.05});
assert.equal(widthProposal.ok,true);
assert.ok(widthProposal.edits[0].bottomSpacingB<180);
assert.deepEqual(widthProposal.minimumSteelFootprint,{B:2,L:2.05});
const proposedLayout=footingBarLayout({...widthBase,L:2.05,reinforcement:{...widthBase.reinforcement,bottomB:{...widthBase.reinforcement.bottomB,spacing:widthProposal.edits[0].bottomSpacingB/1000}}},'bottom','B');
assert.equal(footingMinimumSteel({width:2.05,thickness:.31,fy:400,area:proposedLayout.area,spacing:proposedLayout.maximumSpacing}).status,'OK');
assert.equal(widthBase.L,2);
console.log('PASS footprint enlargement recalculates previously adequate minimum steel before spacing search');

const coupledCommand={...expandedCommand,B:2,L:2};
const bearing={id:'BEARING',entityId:'foundation:A',detailVersion:1,checkId:'foundation-bearing',status:'NG',demand:160,capacity:100,loadLedger:{ok:true},contact:{ok:true}};
const productFooting={...expandedFooting,reinforcement:{...expandedFooting.reinforcement,bottomB:{diameter:.025,spacing:.5}}};
const resized=foundationRepairProposal(coupledCommand,[transfer,existingMinimum,bearing],{...expandedModel,designDetails:{foundations:[productFooting]}});
const steels=resized.components.filter(c=>c.version==='p25-foundation-steel-proposal-v7-depth-coupled');
assert.ok(steels.length>1);
for(const edit of resized.edits){
 assert.ok(steels.some(s=>s.minimumSteelFootprint.B===edit.B&&s.minimumSteelFootprint.L===edit.L));
 const testFooting={...productFooting,...edit,reinforcement:{...productFooting.reinforcement,bottomB:{...productFooting.reinforcement.bottomB,spacing:edit.bottomSpacingB/1000}}};
 const layout=footingBarLayout(testFooting,'bottom','B');
 assert.equal(footingMinimumSteel({width:edit.L,thickness:edit.thickness,fy:400,area:layout.area,spacing:layout.maximumSpacing}).status,'OK');
}
assert.ok(resized.edits.length<=8);
assert.equal(resized.candidateProductTruncated,resized.candidateProductCount>resized.edits.length);
assert.equal(foundationSteelProposal(widthCommand,[widthCheck],widthModel,{L:NaN}).reason,'FOOTPRINT_STEEL_DIMENSIONS_INVALID');
assert.equal(foundationSteelProposal(widthCommand,[widthCheck],{...widthModel,materials:[]},{L:2.05}).ok,false);
console.log('PASS each combined footprint/development variant uses its own minimum area and bounded steel alternatives');

assert.equal(new Set(resized.edits.slice(0,steels.length).map(e=>`${e.B}:${e.L}`)).size,steels.length,'visit each footprint before consuming second steel alternatives');

const {REBAR_CATALOG_ID,rebarCatalogProduct}=await import('../src/materials/rebarProductCatalog.js');
const nominal=rebarCatalogProduct({diameter:10});
const nominalFooting={...expandedFooting,aggregateMaxSize:.05,reinforcement:{...expandedFooting.reinforcement,bottomB:{diameter:nominal.diameterMm/1000,area:nominal.areaMm2/1e6,spacing:.5}}};
const nominalModel={...expandedModel,designDetails:{foundations:[nominalFooting]}};
const nominalCommand={...command,barCatalogId:REBAR_CATALOG_ID,barProductGrade:'SD400',bottomDiameterB:nominal.diameterMm};
const highMinimum={...row,axisChecks:[{...row.axisChecks[0],requiredArea:.0035}]};
const upgraded=foundationSteelProposal(nominalCommand,[highMinimum],nominalModel);
assert.equal(upgraded.ok,true);
assert.ok(upgraded.edits.every(e=>e.bottomDiameterB>nominal.diameterMm));
for(const edit of upgraded.edits){const product=rebarCatalogProduct({diameter:edit.bottomDiameterB});const layout=footingBarLayout({...nominalFooting,reinforcement:{...nominalFooting.reinforcement,bottomB:{diameter:product.diameterMm/1000,area:product.areaMm2/1e6,spacing:edit.bottomSpacingB/1000}}},'bottom','B');assert.ok(layout.area>=.0035);assert.ok(layout.minimumSpacing-product.diameterMm/1000>=.0665-1e-10);}
assert.equal(nominalFooting.reinforcement.bottomB.diameter,nominal.diameterMm/1000);
assert.equal(foundationSteelProposal({...nominalCommand,barProductGrade:'SD500'},[highMinimum],nominalModel).ok,false);
console.log('PASS declared catalog larger-bar repair where spacing alone violates aggregate clearance');

const thinFooting={...nominalFooting,foundationType:'isolated',thickness:.215};
const thinModel={...nominalModel,designDetails:{foundations:[thinFooting]}};
const depthCoupled=foundationSteelProposal({...nominalCommand,thickness:.215},[highMinimum],thinModel);
assert.equal(depthCoupled.ok,true);
assert.ok(depthCoupled.edits.every(e=>e.thickness>.215));
const {evaluateFootingDepth}=await import('../src/design/foundation/footingDepth.js');
for(const edit of depthCoupled.edits){const bars={...thinFooting.reinforcement};for(const face of ['bottom','top'])for(const axis of ['B','L']){const key=face+axis;if(!bars[key])continue;const d=edit[`${face}Diameter${axis}`];const p=d?rebarCatalogProduct({diameter:d}):null;bars[key]={...bars[key],...(p?{diameter:p.diameterMm/1000,area:p.areaMm2/1e6}:{}),spacing:(edit[`${face}Spacing${axis}`]??bars[key].spacing*1000)/1000};}assert.equal(evaluateFootingDepth({...thinFooting,thickness:edit.thickness,reinforcement:bars}).status,'OK');}
console.log('PASS larger bottom bars carry required footing thickness correction in the same candidate');

const {foundationStrengthThicknessProposal}=await import('../src/compute/product/foundationStrengthThicknessProposal.js');
const calculatedFlex={id:'CALC',entityId:'foundation:A',detailVersion:1,checkId:'foundation-flexure',status:'NG',axisChecks:[{status:'NG',scope:'nonprestressed-rectangular-tied-section-strength-only',capacity:80,demand:101,effectiveDepth:.15}]};
const depthSearch=foundationStrengthThicknessProposal({...command,thickness:.215},[calculatedFlex]);
assert.deepEqual(depthSearch.edits,[{thickness:.275},{thickness:.3}]);assert.equal(depthSearch.siteFitVerified,false);
assert.equal(foundationStrengthThicknessProposal({...command,version:2,thickness:.215},[calculatedFlex]).ok,false);
assert.equal(foundationStrengthThicknessProposal({...command,thickness:.215},[{...calculatedFlex,status:'NOT_CHECKED'}]).ok,false);
assert.equal(foundationStrengthThicknessProposal({...command,thickness:3},[calculatedFlex]).reason,'FOOTING_STRENGTH_THICKNESS_SEARCH_LIMIT');
console.log('PASS calculated flexure basis, version and bounded thickness search');

const oneWay={id:'SHEAR',entityId:'foundation:A',checkId:'foundation-one-way-shear',status:'NG',loadLedger:{ok:true},axisChecks:[{status:'NG',capacity:80,demand:100,effectiveDepth:.2,Vc:80/.75,phi:.75,qualification:'clause-scoped-not-whole-design'}]};
assert.equal(foundationStrengthThicknessProposal({...command,thickness:.3},[oneWay]).ok,true);
const punching={id:'PUNCH',entityId:'foundation:A',checkId:'foundation-punching',status:'NG',shearRatio:1.2,capacity:100,demand:120};
assert.equal(foundationStrengthThicknessProposal({...command,thickness:.3},[punching]).ok,true);
assert.equal(foundationStrengthThicknessProposal({...command,thickness:.3},[{...punching,shearRatio:.8,ratio:2,reason:'PUNCHING_REINFORCEMENT_EXTENSION_INSUFFICIENT'}]).ok,false);
console.log('PASS calculated one-way/punching strength deficits, excluding extension-only NG');

assert.equal(foundationStrengthThicknessProposal({...command,thickness:.3},[{...oneWay,loadLedger:{ok:false}}]).ok,false);
assert.equal(foundationStrengthThicknessProposal({...command,thickness:.3},[{...punching,shearRatio:.8,perimeterChecks:[{status:'NG',shearRatio:1.2,demand:120,capacity:100}]}]).ok,true);
const onlyShear=foundationRepairProposal({...command,B:2,L:2,thickness:.3},[oneWay],expandedModel);assert.equal(onlyShear.ok,true);assert.ok(onlyShear.edits.every(e=>Object.keys(e).length>0&&e.thickness>.3));assert.equal(onlyShear.candidateProductCount,onlyShear.edits.length);
console.log('PASS pure strength repair omits empty baseline and retains calculated equivalent-perimeter failures');

const {coupleFootingAnchorage}=await import('../src/compute/product/foundationAnchorageCoupling.js');
const anchoredFooting={...expandedFooting,foundationType:'isolated',materialId:'concrete@1',barShape:'straight',concreteWeight:'normal',barCoating:'uncoated',columnWidth:.6,columnDepth:.3,reinforcement:{...expandedFooting.reinforcement,topB:{diameter:.025,spacing:.15},topL:{diameter:.025,spacing:.15}}};
const closure=coupleFootingAnchorage(expandedModel,anchoredFooting,{thickness:.6});
assert.equal(closure.status,'ADJUSTED');assert.ok(closure.edit.B>2||closure.edit.L>2);assert.equal(closure.anchorageStatus,'OK');assert.equal(anchoredFooting.B,2);assert.equal(anchoredFooting.thickness,.3);
const limitedClosure=coupleFootingAnchorage(expandedModel,{...anchoredFooting,footprintLimitB:2,footprintLimitL:2,footprintLimitReference:'synthetic'}, {thickness:.6});assert.equal(limitedClosure.status,'UNRESOLVED');assert.equal(limitedClosure.edit.B,undefined);
console.log('PASS final thickness/top-cast anchorage couples bounded span and minimum steel, preserving fixed limits');

const sharedAxis={...anchoredFooting,reinforcement:{...anchoredFooting.reinforcement,bottomB:{diameter:.025,spacing:.15},bottomL:{diameter:.025,spacing:.15}}};
const {evaluateFootingBarAnchorage}=await import('../src/design/foundation/footingAnchorage.js');
const initialAnchorage=evaluateFootingBarAnchorage(expandedModel,{...sharedAxis,thickness:.6});
assert.equal(initialAnchorage.checks.filter(r=>r.axis==='B'&&r.status==='NG').length,2);
const sharedClosure=coupleFootingAnchorage(expandedModel,sharedAxis,{thickness:.6});
assert.equal(sharedClosure.status,'ADJUSTED');
for(const axis of ['B','L']){
 const requiredSpan=Math.max(sharedAxis[axis],...initialAnchorage.checks.filter(r=>r.axis===axis).map(r=>Math.ceil((sharedAxis[axis]+2*(r.required-r.available)-1e-10)/.05)/20));
 assert.equal(sharedClosure.edit[axis]??sharedAxis[axis],requiredSpan,'same-axis top/bottom deficits take maximum, not sum');
}
console.log('PASS simultaneous face deficits share one axis enlargement');

const neighbor={...sharedAxis,id:'NEIGHBOR',nodeId:'N',footprintClearance:.1,footprintClearanceReference:'synthetic neighbor constraint'};
const nearbyModel={...expandedModel,nodes:[{id:'A',x:0,y:0,z:0},{id:'N',x:2.2,y:0,z:0}],designDetails:{foundations:[sharedAxis,neighbor]}};
const neighborClosure=coupleFootingAnchorage(nearbyModel,sharedAxis,{thickness:.6});
assert.equal(neighborClosure.status,'UNRESOLVED');assert.equal(neighborClosure.reason,'FINAL_ANCHORAGE_CLEARANCE_LIMIT');assert.deepEqual(neighborClosure.edit,{thickness:.6});
assert.equal(nearbyModel.designDetails.foundations[0].B,2);
const unknownGeometry=coupleFootingAnchorage({...nearbyModel,nodes:[]},sharedAxis,{thickness:.6});
assert.equal(unknownGeometry.status,'ADJUSTED');assert.equal(unknownGeometry.clearanceUnverified,true);assert.equal(unknownGeometry.requiresFullReevaluation,true);
console.log('PASS reverse neighbor constraint prevents speculative growth and missing coordinates remain unverified');
