import assert from 'node:assert/strict';
import {coupledLapSection} from '../src/solver/coupledLapSection.js';
import {solveElasticLapTransfer} from '../src/design/rc/elasticLapTransfer.js';
const p={length:1.2,transferStiffness:80000,bars:[{EA:60000,y:-.2,z:-.08},{EA:60000,y:-.18,z:-.06}]};
const q=[0,0,0,.001,.002,-.001],r=coupledLapSection({...p,endSectionDisplacements:q,samples:33});
const near=(a,b,t=1e-8)=>assert.ok(Math.abs(a-b)<=t*Math.max(1,Math.abs(b)),`${a} != ${b}`);
for(let i=0;i<6;i++)for(let j=0;j<6;j++)near(r.condensedStiffness[i][j],r.condensedStiffness[j][i]);
near(r.slipEndForces[1],0);near(r.slipEndForces[2],0);assert.ok(r.strainEnergy>0);
for(let i=0;i<3;i++)near(r.sectionEndForces[i]+r.sectionEndForces[i+3],0);
for(const rigid of [[1,0,0,1,0,0],[0,1,0,0,1,0],[0,0,1,0,0,1]]){const x=coupledLapSection({...p,endSectionDisplacements:rigid});assert.equal(x.strainEnergy,0);assert.ok(x.sectionEndForces.every(f=>f===0));assert.ok(x.slipEndDisplacements.every(f=>f===0));}
const moved=coupledLapSection({...p,endSectionDisplacements:q.map((x,i)=>x+[3,.02,-.03][i%3])});r.sectionEndForces.forEach((f,i)=>near(moved.sectionEndForces[i],f));
for(let i=0;i<6;i++){const h=1e-7,a=[...q],b=[...q];a[i]+=h;b[i]-=h;const gradient=(coupledLapSection({...p,endSectionDisplacements:a}).strainEnergy-coupledLapSection({...p,endSectionDisplacements:b}).strainEnergy)/(2*h);near(gradient,r.sectionEndForces[i],1e-6);}
const scalar=solveElasticLapTransfer({length:p.length,EA1:60000,EA2:60000,transferStiffness:80000,force:50});
const axial=coupledLapSection({...p,endSectionDisplacements:[0,0,0,scalar.extension,0,0]});near(axial.sectionEndForces[3],50);near(axial.strainEnergy,scalar.strainEnergy);near(axial.stations[0].force1,50);near(axial.stations.at(-1).force2,50);
assert.ok(Math.abs(axial.sectionEndForces[4])>0);assert.ok(Math.abs(axial.sectionEndForces[5])>0);
assert.equal(r.globalAssemblyIncluded,false);assert.equal(r.concreteIncluded,false);
console.log('PASS section/slip coupling: eccentric axial-bending terms, rigid rotation, energy gradients and scalar transfer equivalence');
const density=r.stations.map(s=>.5*(s.force1**2/p.bars[0].EA+s.force2**2/p.bars[1].EA+p.transferStiffness*s.slip**2));
let integral=density[0]+density.at(-1);for(let i=1;i<32;i++)integral+=(i%2?4:2)*density[i];integral*=p.length/32/3;near(integral,r.strainEnergy,1e-7);
console.log('PASS independent integration of physical steel/interface energy after free-tip condensation');
