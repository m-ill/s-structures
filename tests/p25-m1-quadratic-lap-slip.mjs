import {rcLapFrame} from '../src/solver/rcLapFrame.js';
import assert from 'node:assert/strict';
import {coupledLapFrame} from '../src/solver/coupledLapFrame.js';
import {solveElasticLapTransfer} from '../src/design/rc/elasticLapTransfer.js';
const u=Array(12).fill(0);u[6]=.001;
const input={length:1.6,transferStiffness:80000,bars:[{EA:60000,y:.1,z:.03},{EA:60000,y:.12,z:.03}],endDisplacements:u};
const quad=coupledLapFrame({...input,subdivisions:8,slipOrder:2});
assert.equal(quad.slips.length,17);assert.equal(quad.integrationPoints.length,24);
const exact=solveElasticLapTransfer({length:1.6,EA1:60000,EA2:60000,transferStiffness:80000,force:1}),force=.001/exact.extension;
const errors=[8,16,32].map(n=>{
 const r=coupledLapFrame({...input,subdivisions:n,slipOrder:2});
 assert.ok(Math.abs(r.strainEnergy-force*.001/2)<1e-6);
 return Math.abs(r.maximumBarForces[0]-force)/force;
});
assert.ok(errors[1]<errors[0]*.3);assert.ok(errors[2]<errors[1]*.3);assert.ok(errors[1]<.002);
assert.throws(()=>coupledLapFrame({...input,subdivisions:64,slipOrder:2}),{code:'LAP_FRAME_INPUT_INVALID'});
console.log('PASS quadratic slip: independent exact axial lap force, energy and stress convergence',errors);

const rcInput={length:1.6,B:.3,H:.6,Ec:25000,Es:200000,bars:[{y:.1,z:.03,area:.0003}],laps:[{barIndex:0,offset:{y:.12,z:.03,area:.0003},transferStiffness:80000,continuationSide:'offset-toward-end'}],endDisplacements:u,slipOrder:2,subdivisions:16};
const rc=rcLapFrame(rcInput);assert.ok(Math.abs(rc.maximumSteelStress-force/.3)/(force/.3)<.002);
assert.equal(rc.slipOrder,2);assert.ok(rc.maximumRelativeSlip>0);
const ports=rcLapFrame({...rcInput,laps:[{...rcInput.laps[0],boundarySlips:[0,.00001,-.00002,0]}]});
assert.equal(ports.slipAssembly.tangent.length,16);
const eps=1e-8,plus=rcLapFrame({...rcInput,laps:[{...rcInput.laps[0],boundarySlips:[0,.00001+eps,-.00002,0]}]}),minus=rcLapFrame({...rcInput,laps:[{...rcInput.laps[0],boundarySlips:[0,.00001-eps,-.00002,0]}]});
assert.ok(Math.abs((plus.strainEnergy-minus.strainEnergy)/(2*eps)-ports.slipAssembly.forces[13])<1e-6);
console.log('PASS quadratic RC stress recovery and shared-slip energy derivative');
