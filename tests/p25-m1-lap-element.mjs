import assert from 'node:assert/strict';
import {elasticLapElement} from '../src/solver/elasticLapElement.js';
import {solveElasticLapTransfer} from '../src/design/rc/elasticLapTransfer.js';
const p={length:1.2,EA1:60000,EA2:45000,transferStiffness:80000},u=[0,.0004,.001,.0013];
const r=elasticLapElement({...p,endDisplacements:u,samples:33});
const near=(a,b,t=1e-8)=>assert.ok(Math.abs(a-b)<=t*Math.max(1,Math.abs(b)),`${a} != ${b}`);
for(let i=0;i<4;i++){near(r.endForces[i],r.stiffness[i].reduce((s,k,j)=>s+k*u[j],0));near(r.stiffness[i].reduce((a,b)=>a+b,0),0);for(let j=0;j<4;j++)near(r.stiffness[i][j],r.stiffness[j][i]);}
near(r.endForces.reduce((a,b)=>a+b,0),0);assert.ok(r.strainEnergy>0);
const first=r.stations[0],last=r.stations.at(-1);near(first.u1,u[0]);near(first.u2,u[1]);near(last.u1,u[2]);near(last.u2,u[3]);
near(first.force1,-r.endForces[0]);near(first.force2,-r.endForces[1]);near(last.force1,r.endForces[2]);near(last.force2,r.endForces[3]);
// Independent Simpson integration of rod and interface strain energies.
const values=r.stations.map(s=>.5*(s.force1*s.force1/p.EA1+s.force2*s.force2/p.EA2+p.transferStiffness*s.slip*s.slip));
let integral=values[0]+values.at(-1);for(let i=1;i<32;i++)integral+=(i%2?4:2)*values[i];integral*=p.length/32/3;near(integral,r.strainEnergy,1e-7);
for(const shift of [1,1e5]){const moved=elasticLapElement({...p,endDisplacements:u.map(x=>x+shift)});for(let i=0;i<4;i++)near(moved.endForces[i],r.endForces[i],1e-6);}
const rigid=elasticLapElement({...p,endDisplacements:[100,100,100,100]});assert.ok(rigid.endForces.every(x=>x===0));assert.equal(rigid.strainEnergy,0);
const transfer=solveElasticLapTransfer({...p,force:50}),ends=[transfer.stations[0].u1,transfer.stations[0].u2,transfer.stations.at(-1).u1,transfer.stations.at(-1).u2];
const lap=elasticLapElement({...p,endDisplacements:ends});[-50,0,0,50].forEach((f,i)=>near(lap.endForces[i],f));near(lap.strainEnergy,transfer.strainEnergy);
for(const k of [1e-6,1e15]){const x=elasticLapElement({...p,transferStiffness:k,endDisplacements:u});assert.ok(x.stiffness.flat().every(Number.isFinite));assert.ok(x.strainEnergy>=0);}
assert.throws(()=>elasticLapElement({...p,endDisplacements:[0,0,NaN,0]}),/INPUT/);
console.log('PASS four-end lap stiffness symmetry, null mode, independent energy integral and existing force-driven boundary equivalence');
// Static condensation of the two free bar tips must recover the earlier
// two-terminal compliance, independently of the displacement solution.
const K=r.stiffness,det=K[1][1]*K[2][2]-K[1][2]*K[2][1];
const inverse=[[K[2][2]/det,-K[1][2]/det],[-K[2][1]/det,K[1][1]/det]];
const internal=[1,2],external=[0,3];
const condensed=external.map(i=>external.map(j=>K[i][j]-internal.reduce((sum,a,ia)=>sum+internal.reduce((v,b,ib)=>v+K[i][a]*inverse[ia][ib]*K[b][j],0),0)));
near(condensed[0][0],transfer.stiffness);near(condensed[0][1],-transfer.stiffness);near(condensed[1][1],transfer.stiffness);
console.log('PASS free-tip static condensation recovers scalar lap stiffness');
