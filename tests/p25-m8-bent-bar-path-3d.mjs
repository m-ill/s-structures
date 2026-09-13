import assert from 'node:assert/strict';
import {bentBarPath3d} from '../src/design/rc/bentBarPath3d.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,`${a} != ${b}`);
const arc={kind:'arc',center:[1,2,3],radius:.2,u:[1,0,0],v:[0,0,1],sweep:Math.PI/2};
const path=bentBarPath3d([{kind:'line',start:[1.2,2,2],end:[1.2,2,3]},arc,{kind:'line',start:[1,2,3.2],end:[0,2,3.2]}]);
assert.equal(path.status,'OK');near(path.centerlineLength,2+Math.PI*.1);
assert.equal(path.points.length,path.segmentErrors.length+1);
assert.deepEqual(path.bounds.min,[0,2,2]);near(path.bounds.max[0],1.2);near(path.bounds.max[2],3.2);
assert.equal(path.fabricationApproved,false);
// Radius and length are independent of display tessellation.
near(bentBarPath3d([arc],{maxAngle:Math.PI/4}).centerlineLength,path.primitives[1].length);
assert.equal(bentBarPath3d([{...arc,v:[1,0,0]}]).status,'NOT_CHECKED');
assert.equal(bentBarPath3d([{...arc,radius:NaN}]).status,'NOT_CHECKED');
assert.equal(bentBarPath3d([{...arc,sweep:0}]).status,'NOT_CHECKED');
assert.equal(bentBarPath3d([{...arc,sweep:20}]).status,'NOT_CHECKED');
const discontinuous=bentBarPath3d([arc,{kind:'line',start:[2,2,3.2],end:[0,2,3.2]}]);
assert.equal(discontinuous.status,'NG');assert.ok(discontinuous.checks.some(c=>c.reason==='BAR_PATH_DISCONNECTED'));
const kink=bentBarPath3d([arc,{kind:'line',start:[1,2,3.2],end:[1,3,3.2]}]);
assert.equal(kink.status,'NG');assert.ok(kink.checks.some(c=>c.reason==='BAR_PATH_TANGENT_DISCONTINUITY'));
assert.equal(bentBarPath3d([arc],{maxAngle:1e-20}).reason,'BAR_PATH_POINT_LIMIT');
assert.equal(bentBarPath3d(Array(129).fill(arc)).reason,'BAR_PATH_PRIMITIVE_LIMIT');
// Non-axis-aligned arc: an internal coordinate extremum is absent from coarse samples.
const q=Math.SQRT1_2,rotated=bentBarPath3d([{kind:'arc',center:[0,0,0],radius:2,u:[q,q,0],v:[-q,q,0],sweep:Math.PI}],{maxAngle:Math.PI/3});
assert.equal(rotated.status,'OK');near(rotated.bounds.min[0],-2);near(rotated.bounds.max[1],2);
for(const p of rotated.points)for(let i=0;i<3;i++)assert.ok(p[i]>=rotated.bounds.min[i]-1e-12&&p[i]<=rotated.bounds.max[i]+1e-12);
const clockwise=bentBarPath3d([{...arc,sweep:-Math.PI/2}]);
near(clockwise.points.at(-1)[2],2.8);near(clockwise.centerlineLength,Math.PI*.1);
// A 135-degree hook with a straight tail in a tilted plane remains tangent.
const s=3*Math.PI/4,u=[1,0,0],v=[0,q,q],R=.025,end=u.map((x,i)=>R*(x*Math.cos(s)+v[i]*Math.sin(s))),t=u.map((x,i)=>-x*Math.sin(s)+v[i]*Math.cos(s));
const hook=bentBarPath3d([{kind:'arc',center:[0,0,0],radius:R,u,v,sweep:s},{kind:'line',start:end,end:end.map((x,i)=>x+.06*t[i])}]);
assert.equal(hook.status,'OK');near(hook.centerlineLength,R*s+.06);
assert.equal(bentBarPath3d([arc],{closed:true}).status,'NG');
assert.equal(bentBarPath3d([{...arc,sweep:2*Math.PI}],{closed:true}).status,'OK');
console.log('PASS 3D analytic bar path lengths, tilted hooks, exact bounds, join diagnostics and allocation bounds');

const {filletBarPath3d}=await import('../src/design/rc/filletBarPath3d.js');
const rounded=filletBarPath3d([[0,0,0],[0,1,0],[0,1,1],[0,0,1]],.1);
assert.equal(rounded.status,'OK');near(rounded.centerlineLength,3-.4+Math.PI*.1);
assert.equal(rounded.bends.length,2);assert.ok(rounded.checks.every(c=>c.status==='OK'));
const spatial=filletBarPath3d([[.02,0,0],[0,1,0],[0,1,1],[-.02,0,1]],.1);
assert.equal(spatial.status,'OK');assert.ok(spatial.checks.every(c=>c.status==='OK'));
assert.ok(spatial.primitives.some(p=>p.kind==='arc'&&Math.abs(p.v[0])>0));
assert.equal(filletBarPath3d([[0,0,0],[0,.1,0],[0,.1,.1]],.2).reason,'BAR_BEND_TRIMS_OVERLAP');
assert.equal(filletBarPath3d([[0,0,0],[0,1,0],[0,0,0]],.1).reason,'BAR_BEND_REVERSAL');
assert.equal(filletBarPath3d([[0,0,0],[0,1,0],[0,2,0]],.1).centerlineLength,2);
assert.equal(filletBarPath3d([[0,0,0],[0,0,0]],.1).status,'NOT_CHECKED');
console.log('PASS spatial bend fillets, tangent continuity, bend schedule and overlapping-radius rejection');

const {outerHoopClosure}=await import('../src/design/rc/outerHoopClosure.js');
const detail={cover:.04,stirrups:{diameter:.01},tieBendInsideRadius:.025,tieHookTail:.06,tieClosure:'standard-135',tieClosureCorner:'+y+z',tieClosureSeparation:.03};
const closure=outerHoopClosure(detail,{B:.4,H:.4});
assert.equal(closure.status,'OK');assert.equal(closure.hookPair.status,'OK');assert.equal(closure.assemblyStatus,'NOT_CHECKED');
assert.ok(closure.path?.checks.every(c=>c.status==='OK'),JSON.stringify(closure));
assert.equal(closure.path.primitives.filter(p=>p.kind==='arc').length,5);
assert.equal(closure.hookAngles[0],135);assert.equal(closure.hookAngles[1],135);
assert.ok(closure.geometricCutLength>1);assert.equal(closure.fabricationApproved,false);
const flat=outerHoopClosure({...detail,tieClosureSeparation:0},{B:.4,H:.4});
assert.equal(flat.hookPair.status,'NG');near(flat.geometricCutLength,4*(.125+.125)+3*Math.PI*.03+2*.06);
assert.ok(closure.geometricCutLength>flat.geometricCutLength);
assert.equal(outerHoopClosure({...detail,tieClosureCorner:undefined},{B:.4,H:.4}).status,'NOT_CHECKED');
for(const corner of ['+y+z','+y-z','-y+z','-y-z']){
 const r=outerHoopClosure({...detail,tieClosureCorner:corner},{B:.4,H:.4});
 near(r.geometricCutLength,closure.geometricCutLength);assert.ok(r.path.checks.every(c=>c.status==='OK'));
}
console.log('PASS continuous 3D two-hook hoop closure, corner reflection, same-plane overlap detection');
