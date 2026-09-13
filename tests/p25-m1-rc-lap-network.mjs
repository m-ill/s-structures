import assert from 'node:assert/strict';
import {solveRcLapNetwork} from '../src/solver/rcLapNetwork.js';
import {solveElasticLapTransfer} from '../src/design/rc/elasticLapTransfer.js';
const area=.0003,bars=[[-.2,-.08],[-.2,.08],[.2,-.08],[.2,.08]].map(([y,z])=>({y,z,area}));
const common={B:.3,H:.6,Ec:25000,Es:200000,bars,subdivisions:16,GJ:1000};
const lap={barIndex:0,offset:{y:-.18,z:-.08,area},transferStiffness:80000,continuationSide:'offset-toward-end'};
const nodes=[{x:0,y:0,z:0},{x:1.2,y:0,z:0},{x:2.4,y:0,z:0}];
const elements=[{...common,nodes:[0,1],laps:[]},{...common,nodes:[1,2],laps:[lap]}];
const fixedDofs=Array.from({length:18},(_,i)=>i).filter(i=>![6,12].includes(i)),loads=Array(18).fill(0);loads[12]=100;
const near=(a,b,t=1e-8)=>assert.ok(Math.abs(a-b)<=t*Math.max(1,Math.abs(b)),`${a} != ${b}`);
const r=solveRcLapNetwork({nodes,elements,fixedDofs,loads});assert.equal(r.ok,true,JSON.stringify(r));
const exact=solveElasticLapTransfer({length:1.2,EA1:60000,EA2:60000,transferStiffness:80000,force:1});
const expected=100/(4*60000/1.2)+100/(3*60000/1.2+1/exact.extension);
near(r.displacements[12],expected,1e-7);near(r.reactions[0],-100,1e-6);near(r.reactions[6],0,1e-6);
const rotatedLoads=Array(18).fill(0);rotatedLoads[13]=100;
const rotated=solveRcLapNetwork({nodes:nodes.map(n=>({x:-n.y,y:n.x,z:n.z})),elements,fixedDofs:Array.from({length:18},(_,i)=>i).filter(i=>![7,13].includes(i)),loads:rotatedLoads});
assert.equal(rotated.ok,true,JSON.stringify(rotated));near(rotated.displacements[13],r.displacements[12]);
assert.ok(r.trace.length>=2);assert.equal(r.globalAssemblyIncluded,true);assert.equal(r.designTransferAllowed,false);
// Unspliced compressive cantilever: closed-form coupled-free section response
// reduces to symmetric gross-concrete-minus-steel plus actual steel EA.
const compressed=Array(12).fill(0);compressed[6]=-100;
const c=solveRcLapNetwork({nodes:nodes.slice(0,2),elements:[elements[0]],fixedDofs:[0,1,2,3,4,5],loads:compressed});
assert.equal(c.ok,true,JSON.stringify(c));near(c.displacements[6],-100*1.2/(25000*1000*(.18-4*area)+200000*1000*4*area));
const bent=[...compressed];bent[8]=1;
const b=solveRcLapNetwork({nodes:nodes.slice(0,2),elements:[elements[0]],fixedDofs:[0,1,2,3,4,5],loads:bent});
assert.equal(b.ok,true,JSON.stringify(b));
const EI=25000*1000*.3*.6**3/12+(200000-25000)*1000*4*area*.2**2;
near(b.displacements[8],1.2**3/(3*EI));
// Torsion is added once, independently of axial/bending replacement.
const twisted=Array(12).fill(0);twisted[9]=2;
const t=solveRcLapNetwork({nodes:nodes.slice(0,2),elements:[elements[0]],fixedDofs:[0,1,2,3,4,5],loads:twisted});
assert.equal(t.ok,true);near(t.displacements[9],2*1.2/1000);
const unstable=solveRcLapNetwork({nodes,elements,fixedDofs:[],loads});assert.equal(unstable.ok,false);assert.equal(unstable.displacements,undefined);
const stopped=solveRcLapNetwork({nodes,elements,fixedDofs,loads,signal:{aborted:true}});assert.equal(stopped.reason,'RC_LAP_NETWORK_CANCELLED');
console.log('PASS assembled RC lap network: series displacement, shared-node equilibrium, compression, torsion, mechanism/cancel');
