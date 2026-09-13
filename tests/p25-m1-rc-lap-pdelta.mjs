import assert from 'node:assert/strict';
import {solveRcLapNetwork} from '../src/solver/rcLapNetwork.js';
const nodes=[{x:0,y:0,z:0},{x:3,y:0,z:0}],area=Math.PI*.02**2/4,bars=[-.2,.2].flatMap(y=>[-.08,.08].map(z=>({y,z,area})));
const common={nodes:[0,1],B:.3,H:.6,Ec:25000,Es:200000,bars,subdivisions:8,GJ:1000,laps:[]};
const loads=Array(12).fill(0);loads[6]=-100;loads[8]=.01;
const input={nodes,elements:[common],fixedDofs:[0,1,2,3,4,5],loads,tolerance:1e-10};
const first=solveRcLapNetwork(input),second=solveRcLapNetwork({...input,pDeltaMethod:'direct'});assert.equal(second.ok,true,JSON.stringify(second));assert.equal(second.pDeltaIncluded,true);assert.ok(second.displacements[8]>first.displacements[8]);assert.ok(second.secondOrderTrace.length>=2);assert.ok(second.secondOrderTrace.at(-1).axialChange<=1e-10);
const EI=25000*1000*.3*.6**3/12+(200000-25000)*1000*4*area*.2**2,k=Math.sqrt(100/EI);const exact=.01/100*(Math.tan(k*3)/k-3);assert.ok(Math.abs(second.displacements[8]/exact-1)<.001);
const unstable=solveRcLapNetwork({...input,loads:loads.map((v,i)=>i===6?-1e7:v),pDeltaMethod:'direct'});assert.equal(unstable.ok,false);assert.equal(unstable.displacements,undefined);
const bad=solveRcLapNetwork({...input,pDeltaMethod:'unknown'});assert.equal(bad.ok,false);
console.log('PASS RC direct geometric stiffness compression magnification, independent cantilever solution, instability and unknown-method rejection');

// Retained slip ports and diaphragm reduction participate in the same tangent.
const frameNodes=[{id:'A',x:0,y:0,z:0},{id:'B',x:0,y:0,z:3},{id:'C',x:4,y:0,z:0},{id:'D',x:4,y:0,z:3}];
const lap={barIndex:0,offset:{y:-.18,z:-.08,area},transferStiffness:80000,continuationSide:'offset-toward-end',slipIds:['s0','s1','s2','s3']};
const frameLoads=Array(24).fill(0);frameLoads[6]=.01;frameLoads[8]=-100;frameLoads[20]=-100;
const frame={nodes:frameNodes,elements:[{...common,nodes:[0,1],laps:[lap]},{...common,nodes:[2,3]}],fixedDofs:[0,1,2,3,4,5,12,13,14,15,16,17],fixedSlipIds:['s0','s3'],loads:frameLoads,diaphragmGroups:[{id:'DIA',nodeIds:['B','D'],center:{x:2,y:0}}],tolerance:1e-9};
const once=solveRcLapNetwork(frame),twice=solveRcLapNetwork({...frame,pDeltaMethod:'direct'});assert.equal(twice.ok,true,JSON.stringify(twice));assert.equal(twice.sharedSlipAssemblyIncluded,true);assert.equal(twice.rigidDiaphragmIncluded,true);assert.ok(twice.displacements[6]>once.displacements[6]);assert.ok(Math.abs(twice.displacements[6]-twice.displacements[18])<1e-12);assert.ok(Math.abs(twice.reactions[0]+twice.reactions[12]+.01)<1e-7);assert.equal(twice.slipResults.length,4);
for(const r of twice.elementResults)assert.ok(r.endForces.every((v,i)=>Math.abs(v-r.materialEndForces[i]-r.geometricEndForces[i])<1e-8));
console.log('PASS direct RC with retained lap slips and rigid diaphragm, force decomposition and global horizontal equilibrium');
