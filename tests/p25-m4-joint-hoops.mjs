import assert from 'node:assert/strict';
import {kdsJointHoopQuantity,kdsJointHoopDetail} from '../src/design/connection/kdsJointHoops.js';
const x={B:.3,H:.3,cover:.04,diameter:.013,spacing:.05,longitudinalDiameter:.02,fck:24,fy:400};
const r=kdsJointHoopQuantity(x),hc=.3-.08-.013,Ag=.09,Ach=.22*.22;
assert.ok(Math.abs(r.requiredArea-Math.max(.3*.05*hc*24/400*(Ag/Ach-1),.09*.05*hc*24/400))<1e-12);
assert.equal(r.status,'OK');assert.equal(kdsJointHoopQuantity({...x,spacing:.2}).status,'NG');
assert.equal(kdsJointHoopQuantity({...x,fy:600}).status,'NG');
assert.equal(kdsJointHoopQuantity({...x,cover:undefined}).status,'NOT_CHECKED');
assert.equal(r.reductionApplied,false);
console.log('PASS joint full-hoop area, core dimensions, spacing and material bounds');

const coordinate=.15-.04-.013-.026+(.026-.01)/Math.sqrt(2),bars=[-1,1].flatMap(y=>[-1,1].map(z=>({y:y*coordinate,z:z*coordinate,diameter:.02})));
const detail={...x,bars,closure:'seismic-135',tail:.08,insideRadius:.026,firstStart:.025,firstEnd:.025,panelHeight:.6};
assert.equal(kdsJointHoopDetail(detail).status,'OK');
assert.equal(kdsJointHoopDetail({...detail,tail:.07}).status,'NG');
assert.equal(kdsJointHoopDetail({...detail,closure:undefined}).status,'NOT_CHECKED');

const wide=kdsJointHoopQuantity({...x,H:.6,diameter:.02,spacing:.025});
assert.equal(wide.reason,'JOINT_TRANSVERSE_HORIZONTAL_SPACING_EXCEEDED');
assert.equal(wide.criteria.find(c=>c.id==='horizontal-spacing').status,'NG');
assert.equal(wide.criteria.find(c=>c.id==='horizontal-spacing').repairKind,'hoop-topology');
assert.equal(wide.hxBasis,'single-closed-hoop-centerline-spacing');
assert.equal(wide.criteria.find(c=>c.id==='horizontal-spacing').limit,.35);
assert.ok(wide.failedCriteria.includes('horizontal-spacing'));
assert.equal(kdsJointHoopQuantity({...x,fy:600}).criteria.find(c=>c.id==='steel-strength-scope').status,'NG');
assert.equal(Math.max(...wide.criteria.map(c=>c.ratio)),wide.ratio);

// KDS Ash is perpendicular to hc: steel parallel B confines core dimension H.
const rectangular=kdsJointHoopQuantity({...x,B:.4,H:.6});
assert.equal(rectangular.directions.length,2);
const alongB=rectangular.directions.find(d=>d.steelDirection==='B');
const alongH=rectangular.directions.find(d=>d.steelDirection==='H');
assert.equal(alongB.coreDimension,'H');assert.equal(alongB.hc,rectangular.hcH);
assert.equal(alongH.coreDimension,'B');assert.equal(alongH.hc,rectangular.hcB);
assert.ok(Math.abs(alongB.requiredArea/alongH.requiredArea-rectangular.hcH/rectangular.hcB)<1e-12);
assert.equal(rectangular.requiredArea,Math.max(...rectangular.directions.map(d=>d.requiredArea)));
assert.equal(rectangular.areaGoverningDirection,'B');
const rotated=kdsJointHoopQuantity({...x,B:.6,H:.4});
assert.equal(rotated.areaGoverningDirection,'H');
assert.equal(rotated.requiredArea,rectangular.requiredArea);
assert.equal(rotated.spacingRepairLimit,rectangular.spacingRepairLimit);
assert.ok(rectangular.directions.every(d=>d.additionalAreaCredited===0));

const six={...detail,bars:[...bars,{y:0,z:.05,diameter:.02},{y:0,z:-.05,diameter:.02}],tail:.02};
const sixResult=kdsJointHoopDetail(six);
assert.equal(sixResult.status,'NG');assert.equal(sixResult.incomplete,true);
assert.ok(sixResult.checks.find(c=>c.kind==='135-hook-tail').ratio>1);
assert.equal(kdsJointHoopDetail({...six,tail:.08}).status,'NOT_CHECKED');

assert.equal(kdsJointHoopDetail({...six,diameter:undefined}).requiredSeismicTail,undefined);
