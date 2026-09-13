import assert from 'node:assert/strict';
import {resolveMemberTaper} from '../src/solver/taperedMember.js';
import {evaluateRcIntegratedDisplacement,combineRcIntegratedDisplacements} from '../src/compute/product/rcIntegratedDisplacements.js';
const L=4,cut=1.6,material={E:2e8,G:8e7},base={id:'s',A:.02,Ay:.016,Az:.013,Iy:.0001,Iz:.0004,J:.00005};
const C=[[2e-6,3e-6,-2e-6],[3e-6,2e-4,4e-5],[-2e-6,4e-5,1e-4]],initial=[1e-5,-2e-5,3e-5];
const sections={a:{...base,axialBendingFlexibility:C,initialGeneralizedStrain:initial},b:{...base,axialBendingFlexibility:C.map(r=>r.map(v=>v*1.7)),initialGeneralizedStrain:initial.map(v=>v*-.4)}};
const taper=resolveMemberTaper({}, {secId:'a',taper:{profile:'segments',segments:[{start:0,end:.4,sectionId:'a'},{start:.4,end:1,sectionId:'b'}]}},sections.a,{section:id=>sections[id]});assert.equal(taper.ok,true);
const N=10,My=2,Mz=3,Vy=5,Vz=-4,T=1,q=[2,3,-2],dl=[.001,.002,-.003,.004,-.005,.006,0,0,0,0,0,0];
// Solver-native shear is the negative derivative of the signed moment used here.
// Independent antiderivatives of N=N0-qx*x and M=M0+V0*x+q*x^2/2.
const force=[[N,-q[0],0],[My,Vz,q[2]/2],[Mz,Vy,q[1]/2]];
const integral=(c,a,b)=>c.reduce((s,v,i)=>s+v*(b**(i+1)-a**(i+1))/(i+1),0);
function expected(x,shear){let u=0,v=0,w=0,ry=0,rz=0;
 for(const [a,b0,key] of [[0,cut,'a'],[cut,L,'b']]){const b=Math.min(x,b0);if(b<=a)continue;const s=sections[key];const strain=s.axialBendingFlexibility.map((row,j)=>[0,1,2].map(k=>row.reduce((sum,c,i)=>sum+c*force[i][k],0)+(k===0?s.initialGeneralizedStrain[j]:0)));
  const val=strain.map(c=>integral(c,a,b));const weighted=strain.map(c=>x*integral(c,a,b)-integral([0,...c],a,b));u+=val[0];v+=weighted[2];w+=weighted[1];ry-=val[1];rz+=val[2];
 }
 return [dl[0]+u,dl[1]+dl[5]*x+v-(shear?(Vy*x+q[1]*x*x/2)/(material.G*base.Ay):0),dl[2]-dl[4]*x+w-(shear?(Vz*x+q[2]*x*x/2)/(material.G*base.Az):0),dl[3]+T*x/(material.G*base.J),dl[4]+ry,dl[5]+rz];}
const endForces=[-N,Vy,Vz,-T,My,-Mz,0,0,0,0,0,0],spanLoads=[{type:'distributed-linear',a:0,b:L,q1:q,q2:q}];
for(const shear of [false,true]){const response={memberId:'AB',length:L,field:{L,dl,endForces,spanLoads,material,taper,shear}};
 for(const x of [0,.37,cut,2.13,3.75,L])evaluateRcIntegratedDisplacement(response,x).forEach((v,i)=>assert.ok(Math.abs(v-expected(x,shear)[i])<1e-11,`${x}/${i}: ${v} != ${expected(x,shear)[i]}`));
 const values=combineRcIntegratedDisplacements([{response,factor:1},{response,factor:-1}],[0,.37,cut,L]);assert.ok(values.samples.every(s=>s.values.every(v=>v===0)));
}
console.log('PASS independent piecewise coupled axial/bending, uniform span loads, initial strain and shear displacement integrals');
