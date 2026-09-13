import assert from 'node:assert/strict';
import {prepareRcSegmentForces} from '../src/compute/product/rcSegmentForceRecovery.js';
const f=Array(12).fill(0);f[1]=8/3;f[7]=16/3;
const r=prepareRcSegmentForces({source:{memberId:'M',startX:10,endX:14},localEndForces:f,memberLoads:[{type:'distributed-linear',a:0,b:4,q1:[0,0,0],q2:[0,-4,0]}],samples:2});
assert.equal(r.extremaEnvelopeIncluded,true);
const peak=r.envelope.Mz.maximum;assert.ok(Math.abs(peak.localX-4/Math.sqrt(3))<1e-10);assert.ok(Math.abs(peak.value-64/(9*Math.sqrt(3)))<1e-10);assert.ok(Math.abs(peak.x-(10+4/Math.sqrt(3)))<1e-10);
assert.ok(r.stations.some(s=>Math.abs(s.localX-peak.localX)<1e-12));
const axial=prepareRcSegmentForces({source:{memberId:'N',startX:0,endX:4},localEndForces:Array(12).fill(0),memberLoads:[{type:'distributed-linear',a:0,b:4,q1:[-2,0,0],q2:[2,0,0]}],samples:2});
assert.ok(Math.abs(axial.envelope.N.maximum.localX-2)<1e-10);assert.ok(Math.abs(axial.envelope.N.maximum.value-2)<1e-10);
console.log('PASS exact component extrema between samples: triangular-load bending and sign-changing axial distribution');

const split=prepareRcSegmentForces({source:{memberId:'M',startX:10,endX:14},localEndForces:f,memberLoads:[{type:'distributed-linear',a:0,b:2,q1:[0,0,0],q2:[0,-2,0]},{type:'distributed-linear',a:2,b:4,q1:[0,-2,0],q2:[0,-4,0]}],samples:2});
assert.ok(Math.abs(split.envelope.Mz.maximum.value-peak.value)<1e-10);assert.ok(Math.abs(split.envelope.Mz.maximum.localX-peak.localX)<1e-10);
console.log('PASS extrema invariant under equivalent load-cell partition');
