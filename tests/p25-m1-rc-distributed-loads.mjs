import assert from 'node:assert/strict';
import {partitionRcMemberLoad} from '../src/compute/product/rcMemberLoadPartition.js';
import {memberAxes} from '../src/core/memberAxes.js';
const axes=memberAxes({x:0,y:0,z:0},{x:4,y:0,z:0}),segments=[{startX:0,endX:1},{startX:1,endX:2.6},{startX:2.6,endX:4}];
const load={id:'Q',member:'M',case:'D',type:'trapezoid',from:.1,to:.9,w1:2,w2:6,dir:'-z'};
const pieces=partitionRcMemberLoad({load,axes,segments,factor:1.5});assert.equal(pieces.length,3);
let force=0,moment=0;
for(const p of pieces){const s=segments[p.segmentIndex],f=p.localEquivalentLoads;force+=f[1]+f[7];moment+=s.startX*f[1]+s.endX*f[7]+f[5]+f[11];}
assert.ok(Math.abs(force+19.2)<1e-10);assert.ok(Math.abs(moment+43.52)<1e-10);
assert.ok(Math.abs(pieces[0].span.a-.4)<1e-12);assert.ok(Math.abs(pieces[2].span.b-1)<1e-12);
// Zero factor does not create an unscaled load; negative factor preserves sign.
const negative=partitionRcMemberLoad({load,axes,segments,factor:-1.5});pieces.forEach((p,i)=>p.localEquivalentLoads.forEach((v,j)=>assert.ok(Math.abs(v+negative[i].localEquivalentLoads[j])<1e-12)));
assert.throws(()=>partitionRcMemberLoad({load:{...load,from:-1},axes,segments,factor:1}),{code:'INVALID_MEMBER_LOAD_RANGE'});
console.log('PASS partitioned linear member load: force/first moment conservation, partial ranges and factor signs');

for(const x of [0,.6,1,2.6,4]){
 const point=partitionRcMemberLoad({load:{id:'P',member:'M',type:'point',P:3,dir:'-z',t:x/4},axes,segments,factor:2});assert.equal(point.length,1);
 const part=point[0],s=segments[part.segmentIndex],f=part.localEquivalentLoads;
 assert.ok(Math.abs(f[1]+f[7]+6)<1e-10);assert.ok(Math.abs(s.startX*f[1]+s.endX*f[7]+f[5]+f[11]+6*x)<1e-10);
 assert.ok(Math.abs(part.span.a-(x-s.startX))<1e-12);
 const couple=partitionRcMemberLoad({load:{id:'M',member:'M',type:'mmoment',M:2,axis:'z',at:x/4},axes,segments,factor:-1.5});assert.equal(couple.length,1);
 const c=couple[0],cf=c.localEquivalentLoads,cs=segments[c.segmentIndex];assert.ok(Math.abs(cf[1]+cf[7])<1e-10);assert.ok(Math.abs(cs.startX*cf[1]+cs.endX*cf[7]+cf[5]+cf[11]+3)<1e-10);
}
console.log('PASS concentrated forces/couples: endpoints, internal boundaries counted once, force/moment equilibrium');
