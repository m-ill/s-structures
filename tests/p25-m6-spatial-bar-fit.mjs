import assert from 'node:assert/strict';
import {fitSpatialHoopBars} from '../src/design/rc/fitSpatialHoopBars.js';
import {outerHoopClosure} from '../src/design/rc/outerHoopClosure.js';
import {closureHookContactCoverage} from '../src/design/rc/closureHookContactCoverage.js';
import {spatialHoopSupportCoverage} from '../src/design/rc/spatialHoopSupportCoverage.js';
for(const B of [.4,.5])for(const corner of ['+y+z','+y-z','-y+z','-y-z']){
 const cy=.13,cz=B/2-.07,r=.01/Math.sqrt(2);
 const bars=[[-cy-r,-cz-r],[-.14,0],[-cy-r,cz+r],[0,B/2-.06],[cy+r,cz+r],[.14,0],[cy+r,-cz-r],[0,-B/2+.06]].map(([y,z],i)=>({y,z,diameter:.02,id:`b${i}`,fy:400}));
 const detail={bars,cover:.04,stirrups:{diameter:.01},tieBendInsideRadius:.02,tieHookTail:.06,tieClosure:'standard-135',tieClosureCorner:corner,tieClosureSeparation:.03};
 const before=structuredClone(detail),fit=fitSpatialHoopBars(detail,{B,H:.4});
 assert.equal(fit.status,'OK',JSON.stringify(fit));assert.deepEqual(detail,before);
 assert.deepEqual(fit.bars.map(b=>[b.id,b.diameter,b.fy]),bars.map(b=>[b.id,b.diameter,b.fy]));
 const d={...detail,bars:fit.bars},closure=outerHoopClosure(d,{B,H:.4});
 const p={length:1,stirrupDistribution:{status:'OK',explicitEnds:true,count:4,first:.2,last:.8,spacing:.2},outerHoop:{closureGeometry:closure},bars:fit.bars.map(b=>({cutLength:1,points:[[0,b.y],[1,b.y]],segmentErrors:[0]}))};
 closure.contactCoverage=closureHookContactCoverage(d,p);
 assert.equal(closure.contactCoverage.status,'OK',JSON.stringify(closure.contactCoverage));
 assert.equal(spatialHoopSupportCoverage(d,p).status,'OK');assert.equal(fit.fabricationApproved,false);
 const again=fitSpatialHoopBars(d,{B,H:.4});assert.equal(again.status,'OK');
 const changed=fitSpatialHoopBars({...d,tieClosureSeparation:.04},{B,H:.4},{source:{detail:d,section:{B,H:.4}}});assert.equal(changed.status,'OK',JSON.stringify(changed));
 assert.deepEqual(changed.bars.map(b=>b.id),bars.map(b=>b.id));
 const reordered={...d,bars:[...d.bars].reverse()};assert.equal(fitSpatialHoopBars({...reordered,tieClosureSeparation:.04},{B,H:.4},{source:{detail:d,section:{B,H:.4}}}).status,'NOT_CHECKED');
}
assert.equal(fitSpatialHoopBars({},{}).status,'NOT_CHECKED');
console.log('PASS spatial corner fitting preserves IDs and obtains independently checked contacts in rectangular sections and all closure corners');

for(const corner of ['+y+z','+y-z','-y+z','-y-z']){
 const q=.13+.01/Math.sqrt(2),bars=[[-q,-q],[-q,q],[q,-q],[q,q]].map(([y,z])=>({y,z,diameter:.02}));
 const detail={bars,barLayerGroups:['bottom-1:1/2','top-1:3/4'],cover:.04,stirrups:{diameter:.01},tieBendInsideRadius:.02,tieHookTail:.06,tieClosure:'standard-135',tieClosureCorner:corner,tieClosureSeparation:.03};
 const fitted=fitSpatialHoopBars(detail,{B:.4,H:.4});assert.equal(fitted.status,'OK',JSON.stringify(fitted));
 assert.ok(Math.abs(fitted.bars[0].y-fitted.bars[1].y)<1e-9,'bottom layer must remain horizontal');assert.ok(Math.abs(fitted.bars[2].y-fitted.bars[3].y)<1e-9,'top layer must remain horizontal');
 assert.equal(fitted.support.status,'OK');assert.equal(fitted.layerRowsPreserved,true);
 assert.deepEqual(detail.bars,bars);
}
console.log('PASS simultaneous horizontal layer and certified spatial corner support constraints');
