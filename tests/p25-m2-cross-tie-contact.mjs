import assert from 'node:assert/strict';
import {crossTieContactCoverage} from '../src/design/rc/crossTieContactCoverage.js';
import {crossTieGeometry} from '../src/design/rc/crossTieGeometry.js';
import {stirrupDistribution} from '../src/design/rc/stirrupDistribution.js';
import {buildBarFabrication} from '../src/design/rc/barGeometry.js';
const detail={end:1,cover:.04,bars:[{y:0,z:-.14,diameter:.02},{y:0,z:.14,diameter:.02}],fabricationShape:'straight',endSetbackStart:.04,endSetbackEnd:.04,stirrups:{diameter:.01,spacing:.15},tieFirstStart:.075,tieFirstEnd:.075,tieClosure:'standard-135',tieBendInsideRadius:.02,tieHookTail:.06,crossTieBarPairs:['1:2'],crossTieHookSides:['left'],crossTiePlaneOffsets:['0.015']};
const prepared={crossTies:crossTieGeometry(detail,{B:.4,H:.4,length:3}),stirrupDistribution:stirrupDistribution(detail,3),bars:detail.bars.map(b=>buildBarFabrication(detail,b,{length:3,H:.4}))};
let result=crossTieContactCoverage(detail,prepared);assert.equal(result.status,'OK');assert.ok(result.checks.every(c=>c.coverage.coveredCount===20));
prepared.bars[0]=buildBarFabrication({...detail,endSetbackEnd:.3},detail.bars[0],{length:3,H:.4});
result=crossTieContactCoverage(detail,prepared);assert.equal(result.status,'NOT_CHECKED');assert.ok(result.checks[0].coverage.uncoveredCount>0);
assert.ok(result.checks[0].coverage.firstUncoveredPlane>2.7);
console.log('PASS actual straight-body hook-contact coverage and uncovered end stations');

const {repeatedIntervalCoverage}=await import('../src/design/rc/repeatedIntervalCoverage.js');
for(const offset of [-.07,.015,.19])for(let k=0;k<20;k++){
 const intervals=[[k*.047,.9],[.7,1.5+k*.031]],d=prepared.stirrupDistribution;
 const expected=d.positions.filter(x=>intervals.some(([a,b])=>x+offset>=a-1e-9&&x+offset<=b+1e-9)).length;
 assert.equal(repeatedIntervalCoverage(d,offset,intervals).coveredCount,expected);
}
const million={status:'OK',explicitEnds:true,count:1000000,first:0,last:999999,spacing:1};
assert.equal(repeatedIntervalCoverage(million,0,[[0,499999],[499000,999999]]).coveredCount,1000000);
