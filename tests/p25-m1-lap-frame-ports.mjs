import assert from 'node:assert/strict';
import {coupledLapFrame} from '../src/solver/coupledLapFrame.js';
import {invertPositiveMatrix} from '../src/solver/coupledFrameFlexibility.js';
const input={length:2,transferStiffness:80000,bars:[{EA:60000,y:.1,z:.03},{EA:60000,y:.12,z:.03}],endDisplacements:[0,0,0,0,0,0,.001,.0003,-.0001,0,.0001,.0002],subdivisions:8};
const old=coupledLapFrame(input),port=coupledLapFrame({...input,boundarySlips:[0,0,0,0]});
assert.equal(port.stiffness.length,16);
assert.equal(port.boundarySlipForces.length,4);
// Retained slip order is bar1-start, bar2-start, bar1-end, bar2-end.
// Only the two true incoming/outgoing attachment slips are zero.
const free=[13,14],K=port.stiffness,inv=invertPositiveMatrix(free.map(i=>free.map(j=>K[i][j])),2);
const q=free.map((_,i)=>-inv[i].reduce((s,v,j)=>s+v*K[free[j]].slice(0,12).reduce((a,b,k)=>a+b*input.endDisplacements[k],0),0));
const recovered=coupledLapFrame({...input,boundarySlips:[0,q[0],q[1],0]});
assert.ok(Math.abs(recovered.strainEnergy-old.strainEnergy)<1e-10);
assert.ok(Math.max(...recovered.endForces.map((v,i)=>Math.abs(v-old.endForces[i])))<1e-8);
assert.ok(Math.abs(recovered.boundarySlipForces[1])<1e-8);
assert.ok(Math.abs(recovered.boundarySlipForces[2])<1e-8);
for(let i=0;i<12;i++)for(let j=0;j<12;j++){
 const reduced=K[i][j]-free.reduce((s,a,ai)=>s+free.reduce((t,b,bi)=>t+K[i][a]*inv[ai][bi]*K[b][j],0),0);
 assert.ok(Math.abs(reduced-old.stiffness[i][j])<1e-7);
}
assert.throws(()=>coupledLapFrame({...input,boundarySlips:[0,NaN,0,0]}),{code:'LAP_FRAME_INPUT_INVALID'});
const single=coupledLapFrame({...input,subdivisions:1,boundarySlips:[0,0,0,0]});assert.equal(single.internalDofCount,0);
console.log('PASS retained lap slip ports, physical free-tip condensation equivalence and finite validation');

// Split the same cubic host field into two cells; share both steel slips at midpoint.
const L=input.length,d=input.endDisplacements;
const at=t=>{
 const H=[1-3*t*t+2*t**3,L*(t-2*t*t+t**3),3*t*t-2*t**3,L*(-t*t+t**3)];
 const D=[(-6*t+6*t*t)/L,1-4*t+3*t*t,(6*t-6*t*t)/L,-2*t+3*t*t];
 const v=[d[1],d[5],d[7],d[11]],w=[d[2],-d[4],d[8],-d[10]],dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
 return [d[0]*(1-t)+d[6]*t,dot(H,v),dot(H,w),d[3]*(1-t)+d[9]*t,-dot(D,w),dot(D,v)];
};
const chunks=[0,1].map(i=>({...input,length:L/2,subdivisions:4,endDisplacements:[...at(i/2),...at((i+1)/2)]}));
const assembled=Array.from({length:6},()=>Array(6).fill(0)),rhs=Array(6).fill(0);
chunks.forEach((c,e)=>{
 const r=coupledLapFrame({...c,boundarySlips:[0,0,0,0]}),map=[2*e,2*e+1,2*e+2,2*e+3];
 for(let i=0;i<4;i++){rhs[map[i]]+=r.boundarySlipForces[i];for(let j=0;j<4;j++)assembled[map[i]][map[j]]+=r.stiffness[12+i][12+j];}
});
const unknown=[1,2,3,4],inverse=invertPositiveMatrix(unknown.map(i=>unknown.map(j=>assembled[i][j])),4),slips=Array(6).fill(0);
unknown.forEach((i,a)=>{slips[i]=-inverse[a].reduce((s,v,b)=>s+v*rhs[unknown[b]],0);});
const parts=chunks.map((c,e)=>coupledLapFrame({...c,boundarySlips:slips.slice(2*e,2*e+4)}));
assert.ok(Math.abs(parts.reduce((s,r)=>s+r.strainEnergy,0)-old.strainEnergy)<1e-10);
for(let b=0;b<2;b++)assert.ok(Math.abs(parts[0].boundarySlipForces[2+b]+parts[1].boundarySlipForces[b])<1e-8);
for(let e=0;e<2;e++)for(let i=0;i<=4;i++){
 assert.ok(Math.abs(parts[e].slips[i].bar1-old.slips[4*e+i].bar1)<1e-12);
 assert.ok(Math.abs(parts[e].slips[i].bar2-old.slips[4*e+i].bar2)<1e-12);
}
console.log('PASS split lap shared midpoint slips: interface force equilibrium, whole-interval energy and slip-field invariance');
