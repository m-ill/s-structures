import assert from 'node:assert/strict';
import {coupledLapFrame} from '../src/solver/coupledLapFrame.js';
import {solveElasticLapTransfer} from '../src/design/rc/elasticLapTransfer.js';
const p={length:1.2,transferStiffness:80000,bars:[{EA:60000,y:-.2,z:-.08},{EA:40000,y:-.18,z:-.06}]};
const near=(a,b,t=1e-8)=>assert.ok(Math.abs(a-b)<=t*Math.max(1,Math.abs(b)),`${a} != ${b}`);
const q=[0,0,0,0,0,0,.001,.003,-.002,0,.001,-.002];
const run=(n,u=q)=>coupledLapFrame({...p,subdivisions:n,endDisplacements:u});
const r=run(16),fine=run(32),finest=run(64);
assert.ok(r.strainEnergy>fine.strainEnergy&&fine.strainEnergy>finest.strainEnergy);
assert.ok((fine.strainEnergy-finest.strainEnergy)<.3*(r.strainEnergy-fine.strainEnergy));
for(let i=0;i<12;i++)for(let j=0;j<12;j++)near(r.stiffness[i][j],r.stiffness[j][i]);
for(let i=0;i<12;i++){
 near(r.stiffness[i].reduce((sum,v,j)=>sum+v*q[j],0),r.endForces[i]);
 const h=1e-7,a=[...q],b=[...q];a[i]+=h;b[i]-=h;
 near((run(16,a).strainEnergy-run(16,b).strainEnergy)/(2*h),r.endForces[i],1e-6);
}
// Six independent rigid body modes, including w'=-ry and v'=rz.
for(let mode=0;mode<6;mode++){
 const u=Array(12).fill(0);u[mode]=u[mode+6]=1;
 if(mode===4)u[8]=-p.length;if(mode===5)u[7]=p.length;
 const rigid=run(16,u);near(rigid.strainEnergy,0);rigid.endForces.forEach(f=>near(f,0));
}
// Independently integrate recovered steel/interface energy; Gauss weights sum to L.
const energy=r.integrationPoints.reduce((s,x)=>s+x.weight*(x.force1**2/p.bars[0].EA+x.force2**2/p.bars[1].EA+p.transferStiffness*x.slip**2)/2,0);
near(energy,r.strainEnergy);near(r.internalResidual,0);
// Axial benchmark uses the independently established exact two-rod solution.
const exact=solveElasticLapTransfer({length:p.length,EA1:60000,EA2:40000,transferStiffness:p.transferStiffness,force:50});
const axial=Array(12).fill(0);axial[6]=exact.extension;
const a16=run(16,axial),a64=run(64,axial);
assert.ok(Math.abs(a64.endForces[6]-50)<Math.abs(a16.endForces[6]-50)/10);
near(a64.endForces[6],50,2e-4);
assert.equal(r.globalAssemblyIncluded,false);assert.equal(r.concreteIncluded,false);
for(const n of [0,65,2.5])assert.throws(()=>run(n),{code:'LAP_FRAME_INPUT_INVALID'});
console.log('PASS Hermite frame/slip condensation: rigid modes, energy, gradients, refinement and exact axial limit');
