import assert from 'node:assert/strict';
import {solveCrackedElasticSection} from '../src/design/rc/crackedElasticSection.js';
import {crackedRectangularStiffness} from '../src/design/rc/crackedSectionStiffness.js';
const area=Math.PI*.02**2/4;
const section={B:.3,H:.6,Ec:25000,Es:200000,bars:[-.25,.25].flatMap(y=>[-.1,.1].map(z=>({y,z,area})))};
const near=(a,b,t=1e-8)=>assert.ok(Math.abs(a-b)<=t*Math.max(1e-12,Math.abs(b)),`${a} != ${b}`);
const run=demand=>{const r=solveCrackedElasticSection({...section,demand});assert.equal(r.ok,true,JSON.stringify(r));for(const k of ['N','My','Mz'])assert.ok(Math.abs(r.recovered[k]-demand[k])<1e-7);return r;};
const compression=run({N:-500,My:0,Mz:0});
near(compression.strain[0],-500/(1000*(section.Ec*.18+(section.Es-section.Ec)*4*area)));
const tension=run({N:50,My:0,Mz:0});
near(tension.strain[0],50/(1000*section.Es*4*area));
const pure=run({N:0,My:0,Mz:10});
const reference=crackedRectangularStiffness(section);
near(pure.strain[2],10/(section.Ec*1000*reference.z.faces[0].Icr));
for(const demand of [{N:-120,My:12,Mz:25},{N:20,My:-8,Mz:15},{N:-120,My:-12,Mz:-25}]){
 const r=run(demand);
 // Independent midpoint fibres, not polygon integration, check all three forces.
 const sum=[0,0,0],n=350,cell=section.B*section.H/n**2;
 for(let i=0;i<n;i++)for(let j=0;j<n;j++){
  const y=section.H*((i+.5)/n-.5),z=section.B*((j+.5)/n-.5),v=[1,-z,y];
  const strain=v.reduce((s,x,k)=>s+x*r.strain[k],0),force=Math.min(0,strain)*section.Ec*1000*cell;
  v.forEach((x,k)=>sum[k]+=force*x);
 }
 for(const bar of section.bars){const v=[1,-bar.z,bar.y],e=v.reduce((s,x,k)=>s+x*r.strain[k],0),f=area*1000*(section.Es*e-section.Ec*Math.min(0,e));v.forEach((x,k)=>sum[k]+=f*x);}
 ['N','My','Mz'].forEach((k,i)=>assert.ok(Math.abs(sum[i]-demand[k])<.008,`${k}: ${sum[i]}`));
 // The inverse tangent must predict small load increments, including coupling.
 const d=[.001,-.0002,.0003],next=run({N:demand.N+d[0],My:demand.My+d[1],Mz:demand.Mz+d[2]});
 for(let i=0;i<3;i++){const predicted=r.flexibility[i].reduce((s,x,j)=>s+x*d[j],0);near(next.strain[i]-r.strain[i],predicted,1e-3);}
 assert.equal(r.designTransferAllowed,false);
}
assert.equal(solveCrackedElasticSection({...section,demand:{N:NaN,My:0,Mz:0}}).ok,false);
assert.equal(solveCrackedElasticSection({...section,bars:[{y:0,z:0,area}],demand:{N:10,My:0,Mz:0}}).reason,'CRACKED_ELASTIC_TANGENT_SINGULAR');
const baseDemand={N:-120,My:12,Mz:25},base=run(baseDemand);
for(const scale of [.01,100]){
 const scaled=solveCrackedElasticSection({...section,B:section.B*scale,H:section.H*scale,bars:section.bars.map(p=>({y:p.y*scale,z:p.z*scale,area:p.area*scale**2})),demand:{N:baseDemand.N*scale**2,My:baseDemand.My*scale**3,Mz:baseDemand.Mz*scale**3}});
 assert.equal(scaled.ok,true);near(scaled.strain[0],base.strain[0]);near(scaled.strain[1]*scale,base.strain[1]);near(scaled.strain[2]*scale,base.strain[2]);
}
const rotated=solveCrackedElasticSection({...section,B:section.H,H:section.B,bars:section.bars.map(p=>({...p,y:p.z,z:-p.y})),demand:{N:baseDemand.N,My:baseDemand.Mz,Mz:-baseDemand.My}});
assert.equal(rotated.ok,true);near(rotated.strain[0],base.strain[0]);near(rotated.strain[1],base.strain[2]);near(rotated.strain[2],-base.strain[1]);
for(let i=0;i<3;i++)for(let j=0;j<3;j++)assert.ok(Math.abs(base.tangent[i].reduce((s,x,k)=>s+x*base.flexibility[k][j],0)-(i===j?1:0))<1e-10);
console.log('PASS cracked biaxial: compression/tension closed forms, pure Icr, independent fibres and coupled tangent');
