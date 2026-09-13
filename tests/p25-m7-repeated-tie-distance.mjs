import assert from 'node:assert/strict';
import {repeatedTieDistance} from '../src/design/rc/repeatedTieDistance.js';
import {stirrupDistribution} from '../src/design/rc/stirrupDistribution.js';
for(const count of [1,2,3,17,73])for(const tail of [.03,.15])for(const a of [-.17,0,.031,.15,.41])for(const b of [-.09,0,.03]){
 const d={status:'OK',explicitEnds:true,count,first:.075,spacing:.15,last:count===1?.075:.075+(count-2)*.15+tail};
 const points=Array.from({length:count},(_,i)=>i===count-1?d.last:d.first+i*d.spacing);
 const expected=Math.min(...points.flatMap(x=>points.map(y=>Math.abs(x+a-y-b))));
 const r=repeatedTieDistance(d,a,b);assert.equal(r.status,'OK');assert.ok(Math.abs(r.distance-expected)<1e-10);
 assert.ok(Math.abs(Math.abs(points[r.indices[0]]+a-points[r.indices[1]]-b)-r.distance)<1e-10);
}
const large=stirrupDistribution({end:1,tieFirstStart:.05,tieFirstEnd:.05,stirrups:{spacing:.01}},10000);
assert.equal(large.positions,null);assert.ok(large.count>900000);
assert.ok(repeatedTieDistance(large,.012,.022).distance<1e-9);
assert.equal(repeatedTieDistance({...large,count:1,last:2},0,0).status,'NOT_CHECKED');
console.log('PASS closed-form repeated tie distance against brute force, shortened final gap and million-station descriptor');
