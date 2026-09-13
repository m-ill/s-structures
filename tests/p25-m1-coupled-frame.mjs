import assert from 'node:assert/strict';
import {resolveMemberTaper,localTaperedK12} from '../src/solver/taperedMember.js';
import {taperedForceDisplacement} from '../src/solver/memberForceField.js';
const material={E:2e8,G:8e7},L=4;
const base={id:'s',A:.02,Ay:.016,Az:.016,Iy:.0001,Iz:.0004,J:.00005};
const C=[[2e-6,3e-6,-2e-6],[3e-6,2e-4,4e-5],[-2e-6,4e-5,1e-4]];
const make=matrix=>resolveMemberTaper({}, {secId:'s',taper:{profile:'segments',segments:[{start:0,end:1,sectionId:'s'}]}},base,{section:()=>({...base,axialBendingFlexibility:matrix})});
const t=make(C),r=localTaperedK12(material,t,L);assert.equal(r.ok,true);
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9*Math.max(1,Math.abs(b)),`${a} != ${b}`);
for(const f of [[10,0,0],[0,2,0],[0,0,3],[10,2,3]]){
 const e=C.map(row=>row.reduce((s,x,i)=>s+x*f[i],0));
 const d=[L*e[0],L*L*e[2]/2,L*L*e[1]/2,0,-L*e[1],L*e[2]],u=[0,0,0,0,0,0,...d];
 const expected=[-f[0],0,0,0,f[1],-f[2],f[0],0,0,0,-f[1],f[2]];
 r.kl.forEach((row,i)=>near(row.reduce((s,x,j)=>s+x*u[j],0),expected[i]));
 const recovered=taperedForceDisplacement(expected,[],L,L,material,t);
 recovered.forEach((x,i)=>near(x,d[i]));
}
const uncoupled=make([[1/(material.E*base.A),0,0],[0,1/(material.E*base.Iy),0],[0,0,1/(material.E*base.Iz)]]);
const plain=resolveMemberTaper({}, {secId:'s',taper:{profile:'segments',segments:[{start:0,end:1,sectionId:'s'}]}},base,{section:()=>base});
for(const shearDeformation of [false,true]){
 const a=localTaperedK12(material,uncoupled,L,{shearDeformation}),b=localTaperedK12(material,plain,L,{shearDeformation});
 a.kl.forEach((row,i)=>row.forEach((x,j)=>near(x,b.kl[i][j])));
}
assert.equal(make([[1,2,0],[2,1,0],[0,0,1]]).ok,false);
assert.equal(make([[1,0,0],[1,1,0],[0,0,1]]).ok,false);
assert.equal(localTaperedK12(material,t,L,{axialOnly:true}).ok,false);
console.log('PASS coupled frame: constant section forces, coupled displacement, diagonal parity and invalid matrices');
const {createCantileverTipLoad,analyzeModel}=await import('../src/index.js');
const model=createCantileverTipLoad().model,member=model.members[0];
model.sections[0].axialBendingFlexibility=C;
member.taper={profile:'segments',segments:[{start:0,end:1,sectionId:member.secId}]};
model.loads=[{id:'axial',type:'nodal',node:member.n2,P:10,dir:'+x',case:'D'}];
let result=analyzeModel(model);assert.equal(result.ok,true,JSON.stringify(result.diagnostics));
let row=result.byCombo.D_ONLY.memberResults[member.id];
const e=C.map(r=>r[0]*10),expected=[L*e[0],L*L*e[2]/2,L*L*e[1]/2,0,-L*e[1],L*e[2]];
row.dl.slice(6).forEach((x,i)=>near(x,expected[i]));
assert.ok(row.deformationRecovery.endDisplacementResidual<1e-12);
assert.ok(row.deformationRecovery.endRotationResidual<1e-12);
model.nodes[1].support='fixed';
for(const load of [{type:'udl',w:2,dir:'+x'},{type:'udl',w:2,dir:'-z'},{type:'point',P:3,t:.23,dir:'+y'},{type:'temperature',dT:30,alpha:1e-5}]){
 model.loads=[{id:'load',member:member.id,case:'D',...load}];
 result=analyzeModel(model);assert.equal(result.ok,true,JSON.stringify(result.diagnostics));
 row=result.byCombo.D_ONLY.memberResults[member.id];
 assert.ok(row.deformationRecovery.endDisplacementResidual<1e-12,JSON.stringify({load,trace:row.deformationRecovery}));
 assert.ok(row.deformationRecovery.endRotationResidual<1e-12);
}
console.log('PASS actual coupled frame assembly, axial-induced biaxial bending and fixed-end load/thermal compatibility');
