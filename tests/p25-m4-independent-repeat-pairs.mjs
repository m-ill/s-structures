import assert from 'node:assert/strict';
import {independentRepeatedPairDistance} from '../src/design/rc/independentRepeatedPairDistance.js';
import {segmentClosest} from '../src/design/rc/repeatedPathDistance.js';
const points={a:[0,-.2,0],b:[.03,.2,0],c:[.01,0,-.2],d:[-.01,0,.2]};
const dist=(count,first,short)=>({status:'OK',explicitEnds:true,count,first,last:count===1?first:first+(count-1)*.2-short,spacing:.2});
const plane=(d,i)=>i===d.count-1?d.last:d.first+i*d.spacing;
const shift=(p,x)=>[p[0]+x,p[1],p[2]];
for(let na=1;na<=7;na++)for(let nb=1;nb<=7;nb++){
 const da=dist(na,.02,.03),db=dist(nb,.12,.07),r=independentRepeatedPairDistance({...points,distributionA:da,distributionB:db});
 let expected=Infinity;for(let i=0;i<na;i++)for(let j=0;j<nb;j++)expected=Math.min(expected,segmentClosest(shift(points.a,plane(da,i)),shift(points.b,plane(da,i)),shift(points.c,plane(db,j)),shift(points.d,plane(db,j))).distance);
 assert.equal(r.status,'OK');assert.ok(Math.abs(r.distance-expected)<1e-10);
 const [i,j]=r.indices;assert.ok(i>=0&&i<na&&j>=0&&j<nb);assert.ok(Math.abs(r.relativeShift-(plane(da,i)-plane(db,j)))<1e-10);
}
const big=independentRepeatedPairDistance({...points,distributionA:dist(1000000,.02,.03),distributionB:dist(999999,.12,.07)});assert.equal(big.status,'OK');assert.ok(big.stationEvaluations<200);
assert.equal(independentRepeatedPairDistance({...points,distributionA:dist(2,0,0),distributionB:{...dist(2,0,0),spacing:.1}}).status,'NOT_CHECKED');
console.log('PASS independent same-pitch station sequences, unequal counts/final gaps, brute-force agreement and bounded million-station search');

const {repeatedSpatialPairDistance}=await import('../src/design/rc/repeatedSpatialPairDistance.js');
const da=dist(4,.02,.03),db=dist(3,.12,.07);
assert.deepEqual(repeatedSpatialPairDistance({...points,distribution:da,distributionB:db}),independentRepeatedPairDistance({...points,distributionA:da,distributionB:db}));
assert.equal(repeatedSpatialPairDistance({...points,distribution:da,distributionB:db,excludeSameStation:true}).status,'NOT_CHECKED');

for(let na=1;na<=7;na++)for(let nb=1;nb<=7;nb++)for(const reverse of [false,true]){
 let da=dist(na,.02,.03),db={...dist(nb,.13,.07),spacing:.1,last:nb===1?.13:.13+(nb-1)*.1-.025};if(reverse)[da,db]=[db,da];
 const r=independentRepeatedPairDistance({...points,distributionA:da,distributionB:db});assert.equal(r.status,'OK');
 let expected=Infinity;for(let i=0;i<da.count;i++)for(let j=0;j<db.count;j++)expected=Math.min(expected,segmentClosest(shift(points.a,plane(da,i)),shift(points.b,plane(da,i)),shift(points.c,plane(db,j)),shift(points.d,plane(db,j))).distance);
 assert.ok(Math.abs(r.distance-expected)<1e-10);assert.ok(Math.abs(r.relativeShift-(plane(da,r.indices[0])-plane(db,r.indices[1])))<1e-10);
}
const {splitRepeatedDistribution}=await import('../src/design/rc/splitRepeatedDistribution.js');
for(let n=1;n<=9;n++){
 const source=dist(n,.02,.03),split=splitRepeatedDistribution(source,2);assert.equal(split.status,'OK');
 const actual=split.groups.flatMap(g=>Array.from({length:g.distribution.count},(_,i)=>({index:g.sourceIndexOffset+i*g.sourceIndexStride,plane:plane(g.distribution,i)}))).sort((a,b)=>a.index-b.index);
 assert.equal(actual.length,n);actual.forEach((r,i)=>{assert.equal(r.index,i);assert.ok(Math.abs(r.plane-plane(source,i))<1e-10);});
}
assert.equal(splitRepeatedDistribution(dist(1000000,.02,.03),2).groups.length,2);
console.log('PASS alternating parity split and different-pitch brute-force pairs in both directions');
