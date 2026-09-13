import assert from 'node:assert/strict';
import {solveRcLapNetwork} from '../src/solver/rcLapNetwork.js';
const area=.0003,L=3,k=10000,N=-100,bars=[-.2,.2].flatMap(y=>[-.08,.08].map(z=>({y,z,area}))),base={nodes:[{x:0,y:0,z:0},{x:L,y:0,z:0}],elements:[{nodes:[0,1],B:.3,H:.6,Ec:25000,Es:200000,bars,GJ:1000,laps:[],subdivisions:8}],fixedDofs:[1,2,3,4,5],loads:Array(12).fill(0),springDofs:[{fullDof:0,stiffness:k,reference:.001}],tolerance:1e-10};base.loads[6]=N;
const r=solveRcLapNetwork(base);assert.equal(r.ok,true,JSON.stringify(r));const EA=25000*1000*(.18-4*area)+200000*1000*4*area;assert.ok(Math.abs(r.displacements[0]-(.001+N/k))<1e-10);assert.ok(Math.abs(r.displacements[6]-(.001+N/k+N*L/EA))<1e-10);assert.ok(Math.abs(r.reactions[0]+N)<1e-7);assert.equal(r.springSupportsIncluded,true);
const bad=solveRcLapNetwork({...base,springDofs:[{fullDof:0,stiffness:-1,reference:0}]});assert.equal(bad.ok,false);
const twice=solveRcLapNetwork({...base,pDeltaMethod:'direct'});assert.equal(twice.ok,true);assert.ok(Math.abs(twice.displacements[6]-r.displacements[6])<1e-10);
console.log('PASS RC spring/reference displacement series compliance, reaction equilibrium and direct path');

const torsionLoads=[...base.loads];torsionLoads[9]=1;const torsion=solveRcLapNetwork({...base,loads:torsionLoads,fixedDofs:[1,2,4,5],springDofs:[...base.springDofs,{fullDof:3,stiffness:1000,reference:.002}]});assert.equal(torsion.ok,true);assert.ok(Math.abs(torsion.displacements[3]-.003)<1e-10);assert.ok(Math.abs(torsion.displacements[9]-.006)<1e-10);assert.ok(Math.abs(torsion.reactions[3]+1)<1e-10);
import {designContext} from './fixtures/p24/context.js';
const ctx=designContext();try{
 const m=ctx.model;m.nodes=[{id:'A',x:0,y:0,z:0,support:'spring',spring:{kx:k,ky:k,kz:k,krx:k,kry:k,krz:k},settlement:{ux:.001}},{id:'B',x:3,y:0,z:0}];m.members=[{id:'AB',type:'frame',n1:'A',n2:'B',matId:'concrete',secId:'rc3060'}];m.analysisSettings.shearDeformation=false;m.analysisSettings.includeSelfWeight=false;m.analysisSettings.pDeltaMethod='off';m.loads=[{id:'N',type:'nodal',node:'B',case:'D',dir:'-x',P:100}];m.loadCombinations=[{id:'S',type:'service',factors:{D:1}}];m.designDetails={reinforcement:[{id:'R',version:1,memberId:'AB',start:0,end:1,bars:bars.map(b=>({...b,diameter:.02,area:Math.PI*.02**2/4})),cover:.04,barMaterialId:'steel@1'}]};
 const result=await ctx.call('solve_rc_splice_model',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,comboId:'S',frameConvergence:true});assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.springSupportsIncluded,true);assert.ok(Math.abs(result.originalNodes[0].displacements[0]+.009)<1e-10);assert.ok(Math.abs(result.originalNodes[0].reactions[0]-100)<1e-7);assert.equal(result.springDofs[0].reference,.001);
}finally{await ctx.dispose();}
console.log('PASS rotational spring reference/torque and actual WebMCP spring settlement with automatic refinement');
