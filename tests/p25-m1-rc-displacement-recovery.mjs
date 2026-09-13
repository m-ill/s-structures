import assert from 'node:assert/strict';
import {prepareRcSegmentDisplacements} from '../src/compute/product/rcSegmentDisplacementRecovery.js';
const source={memberId:'M',startX:10,endX:14};
const u=Array(12).fill(0);u[5]=.02;u[11]=-.02;u[4]=-.03;u[10]=.03;
const r=prepareRcSegmentDisplacements({source,localDisplacements:u,samples:2});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-12,`${a} != ${b}`);
near(r.envelope.v.maximum.value,.02);near(r.envelope.v.maximum.localX,2);
near(r.envelope.w.maximum.value,.03);near(r.envelope.w.maximum.x,12);
near(r.stations.find(s=>s.localX===2).displacements.ry,0);
assert.equal(r.loadParticularSolutionIncluded,false);
assert.equal(r.standardDesignTransferAllowed,false);
// A rigid infinitesimal rotation must remain a straight line, with constant rotations.
const rigid=[.1,.2,.3,.04,.05,.06,.1,.44,.1,.04,.05,.06];
const q=prepareRcSegmentDisplacements({source,localDisplacements:rigid});
for(const s of q.stations){near(s.displacements.v,.2+.06*s.localX);near(s.displacements.w,.3-.05*s.localX);near(s.displacements.ry,.05);near(s.displacements.rz,.06);}
assert.throws(()=>prepareRcSegmentDisplacements({source,localDisplacements:[NaN,...u.slice(1)]}),/INVALID/);
assert.throws(()=>prepareRcSegmentDisplacements({source:{...source,endX:10},localDisplacements:u}),/INVALID/);
console.log('PASS RC frame displacement endpoints, exact cubic extrema, rotation signs, rigid motion and invalid input');

// Independent constant-EI cantilever end force solution is cubic and reproduced exactly.
const tip=Array(12).fill(0),P=3,EI=200,L=4;tip[7]=P*L**3/(3*EI);tip[11]=P*L**2/(2*EI);
const cantilever=prepareRcSegmentDisplacements({source,localDisplacements:tip});
for(const s of cantilever.stations){const x=s.localX;near(s.displacements.v,P*x*x*(3*L-x)/(6*EI));near(s.displacements.rz,P*x*(2*L-x)/(2*EI));}
console.log('PASS independent constant-EI end-loaded cantilever cubic displacement field');
