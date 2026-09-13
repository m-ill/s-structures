import assert from 'node:assert/strict';
import {crossTieGeometry} from '../src/design/rc/crossTieGeometry.js';
const bars=[{y:0,z:-.14,diameter:.02},{y:0,z:.14,diameter:.02},{y:-.14,z:0,diameter:.02},{y:.14,z:0,diameter:.02}];
const d={start:0,end:1,bars,crossTieBarPairs:['1:2','3:4'],crossTieHookSides:['left','left'],crossTiePlaneOffsets:['0.02','0.02'],tieClosure:'standard-135',tieBendInsideRadius:.02,tieHookTail:.06,cover:.02,tieFirstStart:.075,tieFirstEnd:.075,stirrups:{diameter:.01,spacing:.15}};
let g=crossTieGeometry(d,{B:.4,H:.4,length:3});
assert.equal(g.assembly.status,'NG');assert.ok(g.assembly.checks.some(c=>c.kind==='cross-tie-pair'&&c.status==='NG'));
assert.ok(g.assembly.checks.filter(c=>c.kind==='hook-contact').every(c=>Math.abs(c.clearance)<1e-10&&c.status==='OK'));
g=crossTieGeometry({...d,crossTiePlaneOffsets:['0.02','0.04']},{B:.4,H:.4,length:3});
assert.ok(g.assembly.checks.filter(c=>c.kind==='cross-tie-pair').every(c=>c.status==='OK'));
const blocked={...d,bars:[...bars,{y:-.025,z:0,diameter:.02}]};
g=crossTieGeometry(blocked,{B:.4,H:.4,length:3});
assert.ok(g.assembly.checks.some(c=>c.kind==='longitudinal-collision'&&c.bar===5&&c.status==='NG'));
g=crossTieGeometry({...d,crossTiePlaneOffsets:['0.14','-0.01']},{B:.4,H:.4,length:3});
assert.ok(g.assembly.checks.some(c=>c.kind==='cross-tie-pair'&&c.status==='NG')); // Adjacent tie stations collide.
console.log('PASS cross-tie hook contact, crossing planes, longitudinal collision and adjacent-station collision');

const hoopContact={...d,bars:bars.map(b=>({...b,y:b.y?Math.sign(b.y)*.16:0,z:b.z?Math.sign(b.z)*.16:0})),crossTiePlaneOffsets:['0','0.02']};
g=crossTieGeometry(hoopContact,{B:.4,H:.4,length:3});
assert.ok(g.assembly.checks.some(c=>c.kind==='outer-hoop-perimeter'&&c.status==='NG'));

const short={...d,bars:[{y:0,z:-.02,diameter:.02},{y:0,z:.02,diameter:.02}],crossTieBarPairs:['1:2'],crossTieHookSides:['left'],crossTiePlaneOffsets:['0.02']};
g=crossTieGeometry(short,{B:.4,H:.4,length:3});
assert.ok(g.assembly.checks.some(c=>c.kind==='self-intersection'&&c.status==='NG'));
const regular=crossTieGeometry({...short,bars:bars.slice(0,2)},{B:.4,H:.4,length:3});
assert.ok(regular.assembly.checks.filter(c=>c.kind==='self-intersection').length>0);
assert.ok(regular.assembly.checks.filter(c=>c.kind==='self-intersection').every(c=>c.status==='OK'));

const dense=crossTieGeometry({...d,stirrups:{diameter:.01,spacing:.007}},{B:.4,H:.4,length:3});
assert.ok(dense.assembly.checks.some(c=>c.kind==='cross-tie-repeat'&&c.status==='NG'));
assert.ok(!dense.assembly.checks.some(c=>c.kind==='axial-distribution'&&c.status==='NOT_CHECKED'));
