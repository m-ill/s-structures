import assert from 'node:assert/strict';
import {repeatedArcPathDistance} from '../src/design/rc/repeatedArcPathDistance.js';
const distribution={status:'OK',explicitEnds:true,count:4,first:.1,last:.65,spacing:.2};
const arc={center:[0,0,0],radius:.03,u:[0,1,0],v:[0,0,1],sweep:Math.PI/2};
const radius=.015,angle=.37,c=[0,radius*Math.cos(angle),radius*Math.sin(angle)],d=[1,c[1],c[2]];
const exact=repeatedArcPathDistance({arc,c,d,distribution});assert.equal(exact.status,'OK');assert.ok(Math.abs(exact.lower-.015)<1e-12);assert.equal(exact.lower,exact.upper);
const q=Math.SQRT1_2,tilted={...arc,u:[q,q,0]};
const r=repeatedArcPathDistance({arc:tilted,c,d,distribution,maxIntervals:512,tolerance:1e-9});
assert.equal(r.status,'OK');assert.ok(r.upper-r.lower<=1e-9);assert.ok(r.lower>=0);
// Independent dense angle/station sampling bounds the returned exact minimum.
let dense=Infinity;
for(let i=0;i<=20000;i++)for(const x of [.1,.3,.5,.65]){const t=i/20000*Math.PI/2,p=tilted.center.map((v,k)=>v+tilted.radius*(tilted.u[k]*Math.cos(t)+tilted.v[k]*Math.sin(t)));p[0]+=x;const dx=p[0]<0?-p[0]:p[0]>1?p[0]-1:0;dense=Math.min(dense,Math.hypot(dx,p[1]-c[1],p[2]-c[2]));}
assert.ok(r.lower<=dense+1e-12);assert.ok(dense-r.upper<1e-7);
const exhausted=repeatedArcPathDistance({arc:tilted,c,d,distribution,maxIntervals:1,tolerance:1e-12});assert.equal(exhausted.status,'NOT_CHECKED');assert.ok(exhausted.lower<=dense&&exhausted.upper>=r.lower);
assert.equal(repeatedArcPathDistance({arc:{...arc,u:[1,1,0]},c,d,distribution}).status,'NOT_CHECKED');
console.log('PASS exact planar contact and bounded adaptive spatial arc distance against independent angle samples');

const {bentBarPath3d}=await import('../src/design/rc/bentBarPath3d.js');
const {spatialHoopLongitudinalPaths}=await import('../src/design/rc/spatialHoopLongitudinalPaths.js');
const path=bentBarPath3d([{kind:'arc',...arc}]);
const prepared={length:1,stirrupDistribution:distribution,bars:[{cutLength:1,points:[[0,c[1]],[1,c[1]]],segmentErrors:[0]}],outerHoop:{closureGeometry:{diameter:.01,path}}};
const contact=spatialHoopLongitudinalPaths({bars:[{y:c[1],z:c[2],diameter:.02}]},prepared);
assert.equal(contact.status,'OK');assert.equal(contact.checks[0].centerlineLowerBound,contact.checks[0].centerlineUpperBound);assert.ok(contact.refinementCalls>0);
console.log('PASS actual hoop path refinement resolves nominal contact without widening clearance tolerance');

assert.equal(repeatedArcPathDistance({arc,c,d,distribution,from:-.1,to:.2}).reason,'ARC_DISTANCE_INTERVAL_INVALID');
const shifted=repeatedArcPathDistance({arc,c:[0,c[1]+.002,c[2]],d:[1,c[1]+.002,c[2]],distribution});assert.ok(shifted.upper<.015);
const far=repeatedArcPathDistance({arc,c:[0,c[1]-.002,c[2]],d:[1,c[1]-.002,c[2]],distribution});assert.ok(far.lower>.015);

const {crossTieLongitudinalPaths}=await import('../src/design/rc/crossTieLongitudinalPaths.js');
const hookPath=bentBarPath3d([{kind:'arc',...arc,u:[0,0,1],v:[0,-1,0],sweep:Math.PI/2}]);
const hook={diameter:.01,mark:'CT1',planeOffset:0,points:hookPath.points.map(p=>p.slice(1)),segmentErrors:hookPath.segmentErrors,partRanges:[['start-hook',0,hookPath.points.length-1]],path:{u:[1,0],n:[0,1],arcs:[{center:[0,0],radius:.03,hi:Math.PI/2,lo:0},{center:[0,0],radius:.03,hi:Math.PI/2,lo:0}]}};
const memberDetail={bars:[{y:-c[1],z:c[2],diameter:.02}]};
// Clockwise sampled hook matches the mapped analytic path in the first quadrant.
hook.points=path.points.map(p=>p.slice(1)).reverse();hook.segmentErrors=[...path.segmentErrors].reverse();
const memberPrepared={stirrupDistribution:distribution,bars:[{cutLength:1,points:[[0,c[1]],[1,c[1]]],segmentErrors:[0]}],crossTies:{pieces:[hook]}};
memberDetail.bars[0].y=c[1];
const memberContact=crossTieLongitudinalPaths(memberDetail,memberPrepared);
assert.equal(memberContact.status,'OK');assert.ok(memberContact.arcRefinements>0);
const intruding=structuredClone(memberPrepared);intruding.bars[0].points.forEach(p=>p[1]+=.002);
assert.equal(crossTieLongitudinalPaths(memberDetail,intruding).status,'NG');
const missing=structuredClone(memberPrepared);missing.bars[0].cutLength=null;
assert.equal(crossTieLongitudinalPaths(memberDetail,missing).status,'NOT_CHECKED');
console.log('PASS member cross-tie true contact refined; collision and missing paths remain rejected');

const singleton=x=>({status:'OK',explicitEnds:true,count:1,first:x,last:x,spacing:.2});
const straight={diameter:.01,mark:'CT-body',planeOffset:0,points:[[-.1,0],[.1,0]],segmentErrors:[0],distribution:singleton(.7)};
const localPrepared={stirrupDistribution:singleton(.1),bars:[{cutLength:.2,points:[[0,0],[.2,0]],segmentErrors:[0]}],crossTies:{pieces:[straight]}};
const localDetail={bars:[{y:0,z:0,diameter:.02}]};
for(const options of [{},{pointDistance:()=>0}]){
 assert.equal(crossTieLongitudinalPaths(localDetail,localPrepared,options).status,'OK','piece distribution overrides absent physical parent planes');
 const collision=structuredClone(localPrepared);collision.stirrupDistribution=singleton(.7);collision.crossTies.pieces[0].distribution=singleton(.1);
 assert.equal(crossTieLongitudinalPaths(localDetail,collision,options).status,'NG','actual piece plane must detect collision absent in parent');
 const invalid=structuredClone(localPrepared);invalid.crossTies.pieces[0].distribution={status:'NOT_CHECKED'};
 assert.equal(crossTieLongitudinalPaths(localDetail,invalid,options).status,'NOT_CHECKED');
}
const partial=structuredClone(localPrepared);partial.crossTies.pieces[0].distribution=singleton(.1);partial.bars.push({cutLength:null});
const mixed=crossTieLongitudinalPaths({bars:[...localDetail.bars,...localDetail.bars]},partial);
assert.equal(mixed.status,'NG');assert.equal(mixed.incomplete,true);assert.ok(mixed.incompleteReasons.includes('LONGITUDINAL_FABRICATION_PATH_REQUIRED'));
console.log('PASS physical per-piece planes in chord and analytic-point paths; invalid distribution and mixed coverage preserved');

const phasedHook=structuredClone(memberPrepared);phasedHook.stirrupDistribution=singleton(.7);phasedHook.crossTies.pieces[0].distribution=singleton(.1);phasedHook.bars[0].points[1][0]=.2;phasedHook.bars[0].cutLength=.2;
const phasedContact=crossTieLongitudinalPaths(memberDetail,phasedHook);
assert.equal(phasedContact.status,'OK');assert.ok(phasedContact.arcRefinements>0);assert.ok(Math.abs(phasedContact.checks[0].centerlineLowerBound-.015)<1e-12);assert.equal(phasedContact.checks[0].witness.plane,.1);
console.log('PASS arc refinement uses same physical piece distribution and witness as chord search');
