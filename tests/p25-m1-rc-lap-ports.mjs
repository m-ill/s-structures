import assert from 'node:assert/strict';
import {rcLapFrame} from '../src/solver/rcLapFrame.js';
const area=Math.PI*.02**2/4,base={length:1.2,B:.3,H:.6,Ec:25000,Es:200000,bars:[{y:-.2,z:-.08,area},{y:.2,z:.08,area}],laps:[{barIndex:0,offset:{y:-.18,z:-.08,area},transferStiffness:80000,continuationSide:'offset-toward-end'}],subdivisions:8};
const q=[0,0,0,0,0,0,-.00003,.0003,-.0002,0,.0001,-.0002,0,.00001,-.00002,0];
const run=v=>rcLapFrame({...base,endDisplacements:v.slice(0,12),laps:[{...base.laps[0],boundarySlips:v.slice(12)}]});
const r=run(q);assert.equal(r.slipAssembly.tangent.length,16);
const near=(a,b,t)=>assert.ok(Math.abs(a-b)<t*Math.max(1,Math.abs(b)),`${a} != ${b}`);
for(let j=0;j<16;j++){
 const h=1e-8,a=[...q],b=[...q];a[j]+=h;b[j]-=h;const ra=run(a),rb=run(b);
 near((ra.strainEnergy-rb.strainEnergy)/(2*h),r.slipAssembly.forces[j],3e-6);
 for(let i=0;i<16;i++){near((ra.slipAssembly.forces[i]-rb.slipAssembly.forces[i])/(2*h),r.slipAssembly.tangent[i][j],2e-4);near(r.slipAssembly.tangent[i][j],r.slipAssembly.tangent[j][i],1e-9);}
}
assert.deepEqual(r.slipAssembly.forces.slice(0,12),r.endForces);
assert.equal(r.slipAssembly.ports[0].barIndex,0);
const legacy=rcLapFrame({...base,endDisplacements:q.slice(0,12)});assert.equal(legacy.slipAssembly,null);
assert.deepEqual(r.components.displacedConcrete,legacy.components.displacedConcrete);
assert.deepEqual(r.components.retainedSteel,legacy.components.retainedSteel);
console.log('PASS cracked RC shared-slip assembly: energy gradient, full tangent, symmetry, original-steel replacement');

const reversed=rcLapFrame({...base,endDisplacements:q.slice(0,12),laps:[{...base.laps[0],continuationSide:'offset-toward-start',boundarySlips:[q[13],q[12],q[15],q[14]]}]});
near(reversed.strainEnergy,r.strainEnergy,1e-10);
for(let i=0;i<12;i++)near(reversed.endForces[i],r.endForces[i],1e-8);
for(const [i,j] of [[0,1],[1,0],[2,3],[3,2]])near(reversed.slipAssembly.forces[12+i],r.slipAssembly.forces[12+j],1e-8);
const two=rcLapFrame({...base,endDisplacements:q.slice(0,12),laps:[{...base.laps[0],spliceId:'S1',boundarySlips:q.slice(12)},{...base.laps[0],barIndex:1,offset:{y:.18,z:.08,area},spliceId:'S2',boundarySlips:[0,0,0,0]}]});
assert.equal(two.slipAssembly.tangent.length,20);assert.deepEqual(two.slipAssembly.ports.map(p=>[p.spliceId,p.barIndex,p.offset]),[['S1',0,12],['S2',1,16]]);
for(let i=12;i<16;i++)for(let j=16;j<20;j++){assert.equal(two.slipAssembly.tangent[i][j],0);assert.equal(two.slipAssembly.tangent[j][i],0);}
assert.equal(two.components.retainedSteel.energy,0);assert.equal(two.physicalSteelPieceCount,4);
console.log('PASS opposite lap direction invariance, multiple independent port blocks and physical steel accounting');
