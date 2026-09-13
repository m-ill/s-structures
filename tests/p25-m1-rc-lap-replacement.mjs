import assert from 'node:assert/strict';
import {rcLapFrame} from '../src/solver/rcLapFrame.js';
import {solveElasticLapTransfer} from '../src/design/rc/elasticLapTransfer.js';
const area=Math.PI*.02**2/4,base={length:1.2,B:.3,H:.6,Ec:25000,Es:200000,bars:[{y:-.2,z:-.08,area},{y:.2,z:.08,area}],laps:[{barIndex:0,offset:{y:-.18,z:-.08,area},transferStiffness:80000,continuationSide:'offset-toward-end'}],subdivisions:32};
const near=(a,b,t=1e-8)=>assert.ok(Math.abs(a-b)<=t*Math.max(1,Math.abs(b)),`${a} != ${b}`);
const run=u=>rcLapFrame({...base,endDisplacements:u}),u=Array(12).fill(0);u[6]=.001;
const exact=solveElasticLapTransfer({length:base.length,EA1:base.Es*area*1000,EA2:base.Es*area*1000,transferStiffness:80000,force:1});
const tension=run(u),lapForce=u[6]/exact.extension,ordinaryForce=base.Es*area*1000*u[6]/base.length;
near(tension.endForces[6],lapForce+ordinaryForce,3e-4);
near(tension.components.concreteGross.energy,0);near(tension.components.displacedConcrete.energy,0);
// The original spliced bar must not remain as an additional fully bonded bar.
near(tension.components.retainedSteel.forces[6],ordinaryForce);
near(tension.maximumSteelStress,base.Es*u[6]/base.length);
assert.ok(tension.maximumRelativeSlip>0);
const compression=run(u.map(v=>-v)),netConcrete=base.Ec*1000*(base.B*base.H-3*area)*u[6]/base.length;
near(compression.endForces[6],-(netConcrete+lapForce+ordinaryForce),3e-4);
near(compression.components.displacedConcrete.forces[6],-base.Ec*1000*3*area*u[6]/base.length);
// Cracked bending: check the nonlinear energy gradient and algorithmic tangent.
const q=[0,0,0,0,0,0,-.00003,.0003,-.0002,0,.0001,-.0002],r=run(q);
for(let j=0;j<12;j++){
 const h=1e-8,a=[...q],b=[...q];a[j]+=h;b[j]-=h;const ra=run(a),rb=run(b);
 near((ra.strainEnergy-rb.strainEnergy)/(2*h),r.endForces[j],2e-6);
 for(let i=0;i<12;i++)near((ra.endForces[i]-rb.endForces[i])/(2*h),r.tangent[i][j],1e-4);
}
for(let i=0;i<12;i++)for(let j=0;j<12;j++)near(r.tangent[i][j],r.tangent[j][i]);
assert.equal(r.originalSteelReplaced,true);assert.equal(r.globalAssemblyIncluded,false);
assert.throws(()=>rcLapFrame({...base,endDisplacements:u,laps:[base.laps[0],base.laps[0]]}),{code:'RC_LAP_ASSIGNMENT_INVALID'});
console.log('PASS RC lap replacement: no duplicate steel, both physical bars displace concrete, cracked energy/tangent');
