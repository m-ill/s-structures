import assert from 'node:assert/strict';
import {jointCrossTieTopology} from '../src/design/connection/jointCrossTieTopology.js';
const piece=(mark,line,phase)=>({mark,sourceMark:'CT1',sourceIndexOffset:phase,diameter:.016,path:{lines:[null,line]}});
const geometry={stirrupDistribution:{count:1000001},crossTies:{pattern:'alternating-hook-side',pieces:[piece('CT1-1',[[-.03,-.2],[-.03,.2]],0),piece('CT1-2',[[.03,-.2],[.03,.2]],1)]}};
const before=structuredClone(geometry),r=jointCrossTieTopology(geometry,{hcB:.5,hcH:.6});
assert.equal(r.status,'OK');assert.equal(r.phases.length,2);
assert.equal(r.phases.reduce((n,p)=>n+p.count,0),1000001);
assert.equal(r.directions[0].minimumNominalAdditionalArea,Math.PI*.016**2/4);
assert.equal(r.directions[1].minimumNominalAdditionalArea,0);
assert.equal(r.phases[0].directions[0].maximumGap,.32999999999999996);
assert.equal(r.nominalHx,.5); // Unreinforced orthogonal direction still governs.
assert.equal(r.creditApplied,false);assert.deepEqual(geometry,before);
const bad=structuredClone(geometry);bad.crossTies.pieces[0].path.lines[1]=[[0,0],[.1,.2]];
assert.equal(jointCrossTieTopology(bad,{hcB:.5,hcH:.6}).reason,'JOINT_DIAGONAL_CROSS_TIE_RULE_REQUIRED');
bad.crossTies.pieces=geometry.crossTies.pieces.slice(0,1);
assert.equal(jointCrossTieTopology(bad,{hcB:.5,hcH:.6}).reason,'JOINT_CROSS_TIE_PHASE_MISSING');
console.log('PASS bounded phase topology, perpendicular axes, no duplicate area, unsupported diagonal');

const outside=structuredClone(geometry);outside.crossTies.pieces[1].path.lines[1]=[[.31,-.2],[.31,.2]];
const rejected=jointCrossTieTopology(outside,{hcB:.5,hcH:.6});
assert.equal(rejected.reason,'JOINT_CROSS_TIE_BODY_OUTSIDE_CORE');assert.equal(rejected.witness.phase,1);assert.equal(rejected.witness.position,.31);
const single=structuredClone(geometry);single.stirrupDistribution.count=1;single.crossTies.pieces.pop();
assert.equal(jointCrossTieTopology(single,{hcB:.5,hcH:.6}).phases.length,1);
