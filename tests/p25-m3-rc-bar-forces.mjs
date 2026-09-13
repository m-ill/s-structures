import assert from 'node:assert/strict';
import {solveCrackedElasticSection} from '../src/design/rc/crackedElasticSection.js';
const area=Math.PI*.02**2/4,input={B:.3,H:.6,Ec:25000,Es:200000,bars:[-.25,.25].flatMap(y=>[-.1,.1].map(z=>({y,z,area}))),includeBarForces:true};
for(const demand of [{N:50,My:0,Mz:0},{N:-500,My:0,Mz:0},{N:-120,My:12,Mz:25}]){
 const r=solveCrackedElasticSection({...input,demand});assert.equal(r.ok,true);assert.equal(r.steelForces?.length,4);
 const sum={N:0,My:0,Mz:0};for(const [i,b] of input.bars.entries()){
  const e=r.strain[0]-b.z*r.strain[1]+b.y*r.strain[2],F=input.Es*area*1000*e;
  assert.ok(Math.abs(r.steelForces[i]-F)<1e-10);sum.N+=F;sum.My-=b.z*F;sum.Mz+=b.y*F;
 }
 for(const k of ['N','My','Mz']){assert.ok(Math.abs(sum[k]-r.sectionComponents.steel[k])<1e-10);assert.ok(Math.abs(r.sectionComponents.steel[k]+r.sectionComponents.concreteNet[k]-demand[k])<1e-7);}
 if(demand.N===50)for(const F of r.steelForces)assert.ok(Math.abs(F-12.5)<1e-10);
 if(demand.N===-500){const expected=-500*input.Es*area/(input.Ec*.18+(input.Es-input.Ec)*4*area);for(const F of r.steelForces)assert.ok(Math.abs(F-expected)<1e-9);assert.ok(r.sectionComponents.displacedConcrete.N<0);}
}
const minimal=solveCrackedElasticSection({...input,includeBarForces:false,demand:{N:50,My:0,Mz:0}});assert.equal(minimal.steelForces,undefined);
console.log('PASS gross steel forces separate from displaced concrete, axial closed forms and section force/moment balance');
