import assert from 'node:assert/strict';
import {solveRcLapNetwork} from '../src/solver/rcLapNetwork.js';
const area=.0003,bars=[-.2,.2].flatMap(y=>[-.08,.08].map(z=>({y,z,area}))),nodes=[{x:0,y:0,z:0},{x:3,y:0,z:0}],e={nodes:[0,1],B:.3,H:.6,Ec:25000,Es:200000,bars,GJ:1000,laps:[],subdivisions:8};
const all=Array.from({length:12},(_,i)=>i),loads=Array(12).fill(0),input={nodes,elements:[e],loads,fixedDofs:all,prescribedDofs:[{fullDof:6,value:-.0001}],tolerance:1e-10};
const r=solveRcLapNetwork(input);assert.equal(r.ok,true,JSON.stringify(r));assert.equal(r.displacements[6],-.0001);const EA=25000*1000*(.18-4*area)+200000*1000*4*area;assert.ok(Math.abs(r.reactions[6]+EA*.0001/3)<1e-8);assert.ok(Math.abs(r.reactions[0]+r.reactions[6])<1e-8);assert.equal(r.prescribedDisplacementsIncluded,true);
const translated=solveRcLapNetwork({...input,prescribedDofs:[{fullDof:0,value:.001},{fullDof:6,value:.0009}]});assert.equal(translated.ok,true);assert.ok(Math.abs(translated.reactions[6]-r.reactions[6])<1e-8);
const following=solveRcLapNetwork({...input,fixedDofs:[0,1,2,3,4,5],prescribedDofs:[{fullDof:0,value:.001}]});assert.equal(following.ok,true);assert.ok(Math.abs(following.displacements[6]-.001)<1e-12);assert.ok(Math.abs(following.reactions[0])<1e-8);
assert.equal(solveRcLapNetwork({...input,prescribedDofs:[{fullDof:6,value:NaN}]}).ok,false);assert.equal(solveRcLapNetwork({...input,prescribedDofs:[{fullDof:6,value:0},{fullDof:6,value:.1}]}).ok,false);
console.log('PASS RC prescribed compression exact axial force, rigid translation and unrestrained following');

const diaphragmNodes=[{id:'A',x:0,y:0,z:0},{id:'B',x:3,y:0,z:0}],diaphragmGroups=[{id:'D',nodeIds:['A','B'],center:{x:0,y:0}}];
const conflict=solveRcLapNetwork({...input,nodes:diaphragmNodes,diaphragmGroups,prescribedDofs:[{fullDof:0,value:0},{fullDof:6,value:.001}]});assert.equal(conflict.ok,false);assert.equal(conflict.reason,'INCONSISTENT_PRESCRIBED_DIAPHRAGM_CONSTRAINT');
