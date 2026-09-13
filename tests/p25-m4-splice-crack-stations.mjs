import {evaluateProvidedKdsDetailing} from '../src/design/rc/kdsDetailing.js';
import {evaluateProvidedCrackControl} from '../src/design/rc/kdsCrackControl.js';
import {evaluateProvidedKdsShear} from '../src/design/rc/kdsShear.js';
import {evaluateProvidedKdsCover} from '../src/design/rc/kdsCover.js';
import {evaluateProvidedKdsSpacing} from '../src/design/rc/kdsSpacing.js';
import assert from 'node:assert/strict';
import {createModel} from '../src/core/model.js';
import {stagePracticalDesignInput} from '../src/modeling/practicalDesignInputs.js';
import {prepareSpliceStationLayouts} from '../src/design/rc/spliceStationLayout.js';
import {evaluateProvidedMember} from '../src/design/rc/providedMember.js';
const m=createModel();m.nodes=[{id:'A',x:0,y:0,z:0},{id:'B',x:4,y:0,z:0}];m.members=[{id:'AB',type:'frame',n1:'A',n2:'B',matId:'concrete',secId:'rc3060'}];
stagePracticalDesignInput(m,{type:'reinforcement-record',id:'R',name:'test',version:1,memberId:'AB',start:0,end:1,cover:.04,barMaterialId:'steel@1',sourceNote:'synthetic',bars:[{y:-.2,z:-.08,diameter:20},{y:-.2,z:.08,diameter:20},{y:.2,z:-.08,diameter:20},{y:.2,z:.08,diameter:20}],reinforcementForm:'single-deformed',strengthStandard:'KDS-142020-2022',concreteWeight:'normal',shearStandard:'KDS-142022-2022',shearScope:'ordinary-prismatic-no-opening',stirrupForm:'closed-rectangular-two-leg',coverStandard:'KDS-142050-2022',coverExposure:'indoor',chlorideExposure:'none',fireCoverRequired:0,abrasionCoverRequired:0,coverExternalReference:'test',spacingStandard:'KDS-142050-2022',memberRole:'flexural-member',aggregateMaxSize:.02,lapRequired:true,stirrupDiameter:10,stirrupSpacing:150,stirrupLegs:2,startFabricationShape:'straight',endFabricationShape:'straight',endSetbackStart:.04,endSetbackEnd:.04},[]);
stagePracticalDesignInput(m,{type:'splice-record',id:'S',name:'test',version:1,sourceNote:'synthetic',memberId:'AB',reinforcementId:'R@1',barIndices:['1','2'],start:.25,end:.65,offsetY:.02,offsetZ:0,spliceType:'tension-B',spliceSystem:'ordinary-no-seismic-detail',continuationSide:'offset-toward-end'},[]);
const details=m.designDetails.reinforcement,resolve=prepareSpliceStationLayouts(m,details,{memberLength:4,H:.6});
assert.equal(resolve(details[0],.5).detail.bars[0].y,-.2);
assert.ok(Math.abs(resolve(details[0],3.5).detail.bars[0].y+.18)<1e-12);
assert.equal(resolve(details[0],1,'left').status,'OK');assert.equal(resolve(details[0],1,'right').reason,'SPLICE_OVERLAP_LOAD_TRANSFER_REQUIRED');
assert.equal(resolve(details[0],2.6,'left').status,'NOT_CHECKED');assert.equal(resolve(details[0],2.6,'right').status,'OK');
assert.equal(resolve(details[0],0).reason,'SPLICE_STATION_OUTSIDE_STRAIGHT_BAR_BODY');
const tuple={x:3.5,N:0,My:0,Mz:10,Vy:0,Vz:0,T:0};
const actual=evaluateProvidedMember(m,m.members[0],details,[tuple])['rc-section-strength'];
const plain=structuredClone(m);plain.designDetails.splices=[];
const original=evaluateProvidedMember(plain,plain.members[0],plain.designDetails.reinforcement,[tuple])['rc-section-strength'];
for(const b of plain.designDetails.reinforcement[0].bars.slice(0,2))b.y+=.02;
const shifted=evaluateProvidedMember(plain,plain.members[0],plain.designDetails.reinforcement,[tuple])['rc-section-strength'];
assert.ok(actual.capacity>0,JSON.stringify(actual));assert.equal(actual.capacity,shifted.capacity);assert.notEqual(actual.capacity,original.capacity);
const mixed=evaluateProvidedMember(m,m.members[0],details,[{...tuple,Mz:10000},{...tuple,x:1.5}])['rc-section-strength'];
assert.equal(mixed.status,'NG');assert.equal(mixed.locationCoverage.counts.NG,1);assert.equal(mixed.locationCoverage.counts.NOT_CHECKED,1);assert.equal(mixed.locationCoverage.complete,false);
console.log('PASS actual post-splice section capacity, one-sided boundaries, overlap exclusion and NG preservation');

const shear=evaluateProvidedKdsShear(m,m.members[0],details,[tuple])['rc-shear-y'];assert.ok(Math.abs(shear.effectiveDepth-.48)<1e-12);assert.equal(shear.spliceLayoutEvaluated,true);
const cover=evaluateProvidedKdsCover(m,m.members[0],details,[tuple])['rc-cover'];assert.equal(cover.status,'OK');assert.equal(cover.spliceLayoutEvaluated,true);
const spacing=evaluateProvidedKdsSpacing(m,m.members[0],details,[tuple])['rc-spacing'];assert.equal(spacing.status,'OK');assert.equal(spacing.spliceLayoutEvaluated,true);
for(const [fn,key] of [[evaluateProvidedKdsShear,'rc-shear-y'],[evaluateProvidedKdsSpacing,'rc-spacing']]){const result=fn(m,m.members[0],details,[{...tuple,x:1.5},tuple])[key];assert.equal(result.status,'NOT_CHECKED');assert.equal(result.reason,'SPLICE_OVERLAP_LOAD_TRANSFER_REQUIRED');assert.equal(result.locationCoverage.counts.OK,1);}
console.log('PASS shifted shear depth, cover and spacing, overlap exclusion and shared location semantics');

Object.assign(details[0],{detailingStandard:'KDS-142020-2022',crackControlStandard:'KDS-142020-2022',crackSpecialRequirements:'ordinary-no-special-water-or-appearance',temperatureReinforcementRequired:false,crackEnvironment:'dry'});
const before={...tuple,x:.5},after={...tuple,x:3.5};
const first=evaluateProvidedKdsDetailing(m,m.members[0],details,[before])['rc-reinforcement-ratio'];
const last=evaluateProvidedKdsDetailing(m,m.members[0],details,[after])['rc-reinforcement-ratio'];
assert.notEqual(first.capacity,last.capacity);
for(const sequence of [[before,after],[after,before]]){const combined=evaluateProvidedKdsDetailing(m,m.members[0],details,sequence)['rc-reinforcement-ratio'];assert.equal(combined.ratio,Math.max(first.ratio,last.ratio));assert.equal(combined.spliceLayoutEvaluated,true);}
m.designDetails.splices[0].offsetZ=.01;
const crack=evaluateProvidedCrackControl(m,m.members[0],details,[{...after,Mz:-10}])['rc-serviceability'];assert.equal(crack.spliceLayoutEvaluated,true);assert.ok(Math.abs(crack.cover-70)<1e-10,JSON.stringify(crack));
const baseline=evaluateProvidedCrackControl(m,m.members[0],details,[{...before,Mz:-10}])['rc-serviceability'];assert.ok(Math.abs(baseline.cover-60)<1e-10);
const mixedCrack=evaluateProvidedCrackControl(m,m.members[0],details,[{...after,x:1.5,Mz:-10},{...after,Mz:-10}])['rc-serviceability'];assert.equal(mixedCrack.locationCoverage.counts.NOT_CHECKED,1);assert.equal(mixedCrack.locationCoverage.counts.OK,1);
console.log('PASS layout-sensitive minimum-steel cache, actual crack cover and preserved overlap incompleteness');
