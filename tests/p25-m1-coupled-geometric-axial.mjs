import assert from 'node:assert/strict';
import {axialForcesFromDisplacements} from '../src/solver/geometricStiffness.js';
import {resolveMemberTaper,localTaperedK12} from '../src/solver/taperedMember.js';
const C=[[2e-6,3e-6,-2e-6],[3e-6,2e-4,4e-5],[-2e-6,4e-5,1e-4]],L=4,material={E:2e8,G:8e7};
const section={id:'S',A:.02,Ay:.016,Az:.016,Iy:.0001,Iz:.0004,J:.00005,axialBendingFlexibility:C};
const taper=resolveMemberTaper({}, {secId:'S',taper:{profile:'segments',segments:[{start:0,end:1,sectionId:'S'}]}},section,{section:()=>section});
const kl=localTaperedK12(material,taper,L).kl,T=Array.from({length:12},(_,i)=>Array.from({length:12},(_,j)=>i===j?1:0));
const md={kl,T,dof:Array.from({length:12},(_,i)=>i),ax:{L},section,material,f0:[-6,0,0,0,0,0,2,0,0,0,0,0]};
for(const f of [[10,0,0],[0,2,0],[0,0,3],[-10,2,3]]){
 const e=C.map(row=>row.reduce((s,x,j)=>s+x*f[j],0));
 const D=[0,0,0,0,0,0,L*e[0],L*L*e[2]/2,L*L*e[1]/2,0,-L*e[1],L*e[2]];
 const assembly={memData:{M:md}};
 assert.ok(Math.abs(axialForcesFromDisplacements(assembly,D,{includeFixedEnd:false}).M-f[0])<1e-10);
 assert.ok(Math.abs(axialForcesFromDisplacements(assembly,D,{fixedEndScale:.5}).M-(f[0]+2))<1e-10);
}
console.log('PASS geometric axial update includes full axial-bending coupling and fixed-end load scaling');
