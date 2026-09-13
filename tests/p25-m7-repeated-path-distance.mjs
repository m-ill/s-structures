import assert from 'node:assert/strict';
import {repeatedPathDistance,segmentClosest} from '../src/design/rc/repeatedPathDistance.js';
assert.equal(segmentClosest([0,0,0],[1,0,0],[.5,-1,0],[.5,1,0]).distance,0);
assert.equal(segmentClosest([0,0,0],[1,0,0],[0,0,2],[1,0,2]).distance,2);
const distribution={status:'OK',explicitEnds:true,count:17,first:.05,last:2.38,spacing:.15};
let seed=321;const random=()=>((seed=(1664525*seed+1013904223)>>>0)/4294967296);
for(let i=0;i<100;i++){
 const a=[random()-.5,random()-.5],b=[random()-.5,random()-.5],c=[random()*3,random()-.5,random()-.5],d=[random()*3,random()-.5,random()-.5],offset=.03;
 const expected=Math.min(...Array.from({length:17},(_,k)=>{const x=(k===16?2.38:.05+k*.15)+offset;return segmentClosest([x,...a],[x,...b],c,d).distance;}));
 const r=repeatedPathDistance({a,b,c,d,distribution,offset});assert.ok(Math.abs(r.distance-expected)<1e-10);assert.ok(r.stationCandidates<=3);
}
console.log('PASS repeated 3D segment distance against enumerated stations');
