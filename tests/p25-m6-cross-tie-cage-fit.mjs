import assert from 'node:assert/strict';
import {fitCrossTieCage} from '../src/design/rc/fitCrossTieCage.js';
import {crossTieGeometry} from '../src/design/rc/crossTieGeometry.js';
import {outerHoopClosure} from '../src/design/rc/outerHoopClosure.js';
import {spatialHoopCrossTieAssembly} from '../src/design/rc/spatialHoopCrossTieAssembly.js';
import {stirrupDistribution} from '../src/design/rc/stirrupDistribution.js';
const c=.13+.01/Math.sqrt(2),bars=[[-c,-c],[-.14,0],[-c,c],[0,.14],[c,c],[.14,0],[c,-c],[0,-.14]].map(([y,z])=>({y,z,diameter:.02}));
const d={bars,cover:.04,stirrups:{diameter:.01,spacing:.2},tieBendInsideRadius:.02,tieHookTail:.06,tieClosure:'standard-135',tieClosureCorner:'+y+z',tieClosureSeparation:.03,tieFirstStart:.1,tieFirstEnd:.1,start:0,end:1,crossTieBarPairs:['2:6','4:8'],crossTieHookSides:['left','right'],crossTiePlaneOffsets:['.015','.015']};
const section={B:.4,H:.4,length:3},before=structuredClone(d),fit=fitCrossTieCage(d,section);
assert.equal(fit.status,'OK',JSON.stringify(fit));assert.deepEqual(d,before);
assert.equal(fit.fabricationApproved,false);assert.equal(fit.planeOffsets.length,2);assert.notEqual(fit.planeOffsets[0],fit.planeOffsets[1]);
const next={...d,crossTiePlaneOffsets:fit.planeOffsets,crossTieHookSides:fit.hookSides},geometry=crossTieGeometry(next,section);
assert.ok(geometry.assembly.checks.filter(c=>['cross-tie-pair','axial-extent'].includes(c.kind)).every(c=>c.status==='OK'));
const spatial=spatialHoopCrossTieAssembly(next,{outerHoop:{closureGeometry:outerHoopClosure(next,section)},crossTies:geometry,stirrupDistribution:stirrupDistribution(next,3)});
assert.equal(spatial.status,'OK',JSON.stringify(spatial));
assert.equal(fitCrossTieCage({...d,stirrups:{...d.stirrups,spacing:.005}},section).status,'NOT_CHECKED');
assert.equal(fitCrossTieCage({},section).status,'NOT_CHECKED');
assert.equal(fitCrossTieCage({...d,tieFirstEnd:.295},section).status,'NOT_CHECKED'); // Shortened final interval is only 5mm.
const large=fitCrossTieCage(d,{...section,length:200000.2});assert.equal(large.status,'OK',JSON.stringify(large));
assert.ok(large.planeTrials<=2*d.crossTieBarPairs.length*(2*d.crossTieBarPairs.length+1));assert.equal(large.orientationTrials,4);
console.log('PASS bounded cross-tie plane packing, orientation proposals, spatial hoop clearance and tight repeated spacing rejection');

assert.equal(fitCrossTieCage({...d,crossTieBarPairs:['2:6','6:2']},section).status,'NOT_CHECKED');
