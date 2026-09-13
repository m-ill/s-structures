import assert from 'node:assert/strict';
import {createModel} from '../src/core/model.js';
import {evaluateProvidedKdsShear} from '../src/design/rc/kdsShear.js';
import {mergeLocatedCheck} from '../src/design/evaluation/locationCoverage.js';
import {evaluateProvidedCrackControl} from '../src/design/rc/kdsCrackControl.js';
const model=createModel();model.nodes=[{id:'A',x:0,y:0,z:0},{id:'B',x:3,y:0,z:0}];
const member={id:'AB',n1:'A',n2:'B',secId:'rc3060',matId:'concrete'};
const detail={id:'R',version:1,start:0,end:.5,barMaterialId:'steel@1',concreteWeight:'normal',shearStandard:'KDS-142022-2022',shearScope:'ordinary-prismatic-no-opening',stirrupForm:'closed-rectangular-two-leg',stirrups:{legs:2,diameter:.01,spacing:.1},bars:[-1,1].flatMap(y=>[-1,1].map(z=>({y:y*.2,z:z*.08,area:.0003})))};
const demand={N:0,Vy:1000,Vz:0,T:0};
for(const xs of [[1,2],[2,1]]){
 const result=evaluateProvidedKdsShear(model,member,[detail],xs.map(x=>({...demand,x})))['rc-shear-y'];
 assert.equal(result.status,'NG','an unchecked station must not erase a confirmed failed station');
 assert.equal(result.locationCoverage.complete,false);
 assert.deepEqual(result.locationCoverage.counts,{OK:0,NG:1,WARN:0,NOT_CHECKED:1,N_A:0,FAILED:0});
 assert.equal(result.locationCoverage.failedLocations[0].x,1);
 assert.equal(result.locationCoverage.missingLocations[0].x,2);
 assert.equal(result.methodReviewRequired,true);
}
console.log('PASS mixed station NG and missing detail remain visible in both iteration orders');
let bounded;
for(let i=0;i<1000;i++)bounded=mergeLocatedCheck(bounded,{status:i%2?'NG':'NOT_CHECKED',ratio:i%2?2:null,concurrentDemand:{x:i}});
assert.equal(bounded.locationCoverage.total,1000);assert.equal(bounded.locationCoverage.counts.NG,500);
assert.equal(bounded.locationCoverage.missingLocations.length,12);assert.equal(bounded.locationCoverage.failedLocations.length,12);assert.equal(bounded.locationCoverage.witnessesTruncated,true);
assert.ok(JSON.stringify(bounded).length<5000);
const crackDetail={...detail,crackControlStandard:'KDS-142020-2022',memberRole:'flexural-member',reinforcementForm:'single-deformed',crackSpecialRequirements:'ordinary-no-special-water-or-appearance',temperatureReinforcementRequired:false,crackEnvironment:'other',bars:[{y:.1,z:0,diameter:.02,area:.0003}]};
for(const xs of [[1,2],[2,1]]){
 const check=evaluateProvidedCrackControl(model,member,[crackDetail],xs.map(x=>({x,N:0,My:0,Mz:1})))['rc-serviceability'];
 assert.equal(check.status,'NG');assert.equal(check.locationCoverage.counts.NG,1);assert.equal(check.locationCoverage.counts.NOT_CHECKED,1);
}
