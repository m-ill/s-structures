import assert from 'node:assert/strict';
import {solveElasticLapTransfer} from '../src/design/rc/elasticLapTransfer.js';
const input={length:1.2,EA1:60000,EA2:45000,transferStiffness:80000,force:50,samples:17};
const r=solveElasticLapTransfer(input);
assert.equal(r.status,'CALCULATED');assert.ok(r.compliance>0);assert.equal(r.stations.length,17);
const near=(a,b,t=1e-9)=>assert.ok(Math.abs(a-b)<=t*Math.max(1,Math.abs(b)),`${a} != ${b}`);
near(r.stations[0].force1,50);near(r.stations[0].force2,0);near(r.stations.at(-1).force1,0);near(r.stations.at(-1).force2,50);
for(const p of r.stations){near(p.force1+p.force2,50);near(p.transferPerLength,-input.transferStiffness*p.slip);assert.ok(p.force1>=-1e-9&&p.force2>=-1e-9);}
// Independent linear FE assembly: axial rod elements plus consistent distributed
// spring energy k/2 integral (u1-u2)^2. No hyperbolic solution in this oracle.
function finiteElement(n){
 const h=input.length/n,size=2*(n+1),K=Array.from({length:size},()=>new Float64Array(size)),F=new Float64Array(size);F[size-1]=input.force;
 for(let e=0;e<n;e++){
  for(let b=0;b<2;b++){const i=2*e+b,j=i+2,k=(b?input.EA2:input.EA1)/h;K[i][i]+=k;K[j][j]+=k;K[i][j]-=k;K[j][i]-=k;}
  for(let a=0;a<2;a++)for(let b=0;b<2;b++)for(let c=0;c<2;c++)for(let d=0;d<2;d++)K[2*(e+a)+c][2*(e+b)+d]+=input.transferStiffness*h/6*(a===b?2:1)*(c===d?1:-1);
 }
 for(let i=0;i<size;i++){K[0][i]=0;K[i][0]=0;}K[0][0]=1;
 for(let i=0;i<size;i++)for(let j=i+1;j<size;j++){const f=K[j][i]/K[i][i];for(let k=i+1;k<size;k++)K[j][k]-=f*K[i][k];F[j]-=f*F[i];}
 const u=new Float64Array(size);for(let i=size-1;i>=0;i--){let v=F[i];for(let j=i+1;j<size;j++)v-=K[i][j]*u[j];u[i]=v/K[i][i];}return u.at(-1);
}
const a=finiteElement(32),b=finiteElement(64);assert.ok(Math.abs(b-r.extension)<Math.abs(a-r.extension)/3.5);near(b,r.extension,1e-7);
const zero=solveElasticLapTransfer({...input,force:0});near(zero.compliance,r.compliance);assert.equal(zero.extension,0);
const scale=solveElasticLapTransfer({...input,force:100});near(scale.extension,2*r.extension);near(scale.strainEnergy,4*r.strainEnergy);
const swapped=solveElasticLapTransfer({...input,EA1:input.EA2,EA2:input.EA1});near(swapped.compliance,r.compliance);
for(const k of [1e-6,1e15]){const x=solveElasticLapTransfer({...input,transferStiffness:k});assert.ok(Number.isFinite(x.extension));near(x.stations[0].force1,50);near(x.stations.at(-1).force2,50);}
assert.throws(()=>solveElasticLapTransfer({...input,force:-1}),/INPUT/);assert.throws(()=>solveElasticLapTransfer({...input,transferStiffness:0}),/INPUT/);assert.throws(()=>solveElasticLapTransfer({...input,samples:1000}),/INPUT/);
console.log('PASS lap transfer exact equilibrium, independent FE convergence, scaling, reciprocity and numerical range');
