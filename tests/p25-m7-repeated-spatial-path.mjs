import assert from 'node:assert/strict';
import {repeatedSpatialPathDistance} from '../src/design/rc/repeatedSpatialPathDistance.js';
import {segmentClosest} from '../src/design/rc/repeatedPathDistance.js';
let seed=931;const random=()=>((seed=(1664525*seed+1013904223)>>>0)/4294967296),point=()=>[random()*2-1,random()*2-1,random()*2-1];
for(let n=0;n<200;n++){
 const count=1+Math.floor(random()*40),first=-.1,spacing=.13,last=count===1?first:first+(count-2)*spacing+spacing*random();
 const distribution={status:'OK',explicitEnds:true,count,first,last,spacing};
 const a=point(),b=point(),c=point(),d=point(),offset=.07;
 let expected=Infinity;
 for(let i=0;i<count;i++){
  const shift=(i===count-1?last:first+i*spacing)+offset;
  expected=Math.min(expected,segmentClosest([a[0]+shift,a[1],a[2]],[b[0]+shift,b[1],b[2]],c,d).distance);
 }
 const r=repeatedSpatialPathDistance({a,b,c,d,distribution,offset});
 assert.equal(r.status,'OK');assert.ok(Math.abs(r.distance-expected)<1e-10,JSON.stringify({r,expected,distribution}));
 assert.ok(r.stationCandidates<=2*Math.ceil(Math.log2(count))+3);
}
const distribution={status:'OK',explicitEnds:true,count:1000000,first:0,last:999999,spacing:1};
const r=repeatedSpatialPathDistance({a:[-.05,-1,0],b:[.05,1,0],c:[789123,0,-1],d:[789123,0,1],distribution});
assert.equal(r.index,789123);assert.equal(r.distance,0);assert.ok(r.stationCandidates<45);
assert.equal(repeatedSpatialPathDistance({a:[0,0,0],b:[0,1,0],c:[0,0,0],d:[0,0,1],distribution:{...distribution,explicitEnds:false}}).status,'NOT_CHECKED');
console.log('PASS spatial repeated segment minimum against exhaustive stations and million-repeat bounded search');

const {repeatedSpatialPairDistance}=await import('../src/design/rc/repeatedSpatialPairDistance.js');
for(let test=0;test<50;test++){
 const count=1+Math.floor(random()*9),first=.04,spacing=.13,last=count===1?first:first+(count-2)*spacing+.07,distribution={status:'OK',explicitEnds:true,count,first,last,spacing};
 const a=point(),b=point(),c=point(),d=point();let expected=Infinity;
 for(let i=0;i<count;i++)for(let j=0;j<count;j++){
  const shift=(i===count-1?last:first+i*spacing)-(j===count-1?last:first+j*spacing);
  expected=Math.min(expected,segmentClosest([a[0]+shift,a[1],a[2]],[b[0]+shift,b[1],b[2]],c,d).distance);
 }
 const r=repeatedSpatialPairDistance({a,b,c,d,distribution});assert.equal(r.status,'OK');assert.ok(Math.abs(r.distance-expected)<1e-10,JSON.stringify({r,expected}));
 const [i,j]=r.indices,shift=(i===count-1?last:first+i*spacing)-(j===count-1?last:first+j*spacing);
 assert.ok(Math.abs(segmentClosest([a[0]+shift,a[1],a[2]],[b[0]+shift,b[1],b[2]],c,d).distance-r.distance)<1e-10);
}
console.log('PASS two repeated spatial paths versus exhaustive station pairs with shortened final interval');

for(const count of [1,2,5]){
 const distribution={status:'OK',explicitEnds:true,count,first:0,last:count===1?0:count-1-.2,spacing:1};
 const r=repeatedSpatialPairDistance({a:[0,0,0],b:[0,1,0],c:[0,0,0],d:[0,1,0],distribution,excludeSameStation:true});
 if(count===1)assert.equal(r.status,'N_A');else {assert.equal(r.status,'OK');assert.ok(Math.abs(r.distance-.8)<1e-12);assert.notEqual(...r.indices);}
}

const pairLarge=repeatedSpatialPairDistance({a:[0,0,0],b:[0,1,0],c:[123456.25,0,0],d:[123456.25,1,0],distribution});
assert.equal(pairLarge.distance,.25);assert.ok(pairLarge.stationEvaluations<180);
