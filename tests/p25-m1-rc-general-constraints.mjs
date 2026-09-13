import assert from 'node:assert/strict';
import {solveRcLapNetwork} from '../src/solver/rcLapNetwork.js';
const nodes=[{id:'A',x:0,y:0,z:0},{id:'B',x:3,y:0,z:0},{id:'C',x:0,y:2,z:0},{id:'D',x:3,y:2,z:0}],bars=[-.2,.2].flatMap(y=>[-.08,.08].map(z=>({y,z,area:.0003}))),common={B:.3,H:.6,Ec:25000,Es:200000,bars,GJ:1000,laps:[],subdivisions:8},fixedDofs=[0,1,2,3,4,5,12,13,14,15,16,17],loads=Array(24).fill(0);loads[6]=-100;
const tie={id:'tie',type:'mpc',slave:{node:'D',dof:'ux'},terms:[{node:'B',dof:'ux',c:1}],d:0},input={nodes,elements:[{...common,nodes:[0,1]},{...common,nodes:[2,3]}],fixedDofs,loads,generalConstraints:[tie],tolerance:1e-10};
const r=solveRcLapNetwork(input);assert.equal(r.ok,true,JSON.stringify(r));assert.equal(r.generalConstraintsIncluded,true);assert.ok(Math.abs(r.displacements[6]-r.displacements[18])<1e-12);assert.ok(Math.abs(r.reactions[0]-50)<1e-7);assert.ok(Math.abs(r.reactions[12]-50)<1e-7);assert.ok(Math.abs(r.constraintForces[6]+r.constraintForces[18])<1e-7);
const offset=solveRcLapNetwork({...input,generalConstraints:[{...tie,d:.0001}]});assert.equal(offset.ok,true);assert.ok(Math.abs(offset.displacements[18]-offset.displacements[6]-.0001)<1e-12);
const cycle=solveRcLapNetwork({...input,generalConstraints:[tie,{id:'cycle',type:'mpc',slave:{node:'B',dof:'ux'},terms:[{node:'D',dof:'ux',c:1}]}]});assert.equal(cycle.ok,false);
console.log('PASS RC shared MPC exact displacement, load transfer, affine offset and cycle rejection');

const direct=solveRcLapNetwork({...input,pDeltaMethod:'direct'});assert.equal(direct.ok,true);assert.ok(Math.abs(direct.displacements[6]-r.displacements[6])<1e-10);
import {designContext} from './fixtures/p24/context.js';
const ctx=designContext();try{
 const m=ctx.model;m.nodes=nodes.map((n,i)=>({...n,...(i%2===0?{support:'fixed'}:{})}));m.members=[{id:'M1',type:'frame',n1:'A',n2:'B',matId:'concrete',secId:'rc3060'},{id:'M2',type:'frame',n1:'C',n2:'D',matId:'concrete',secId:'rc3060'}];m.analysisSettings.shearDeformation=false;m.analysisSettings.includeSelfWeight=false;m.analysisSettings.pDeltaMethod='direct';m.constraints=[tie];m.loadCombinations=[{id:'S',type:'service',factors:{D:1}}];m.loads=[{id:'F',type:'nodal',node:'B',case:'D',dir:'-x',P:100}];m.designDetails={reinforcement:m.members.map((member,i)=>({id:`R${i}`,version:1,memberId:member.id,start:0,end:1,bars:bars.map(b=>({...b,diameter:.02,area:Math.PI*.02**2/4})),cover:.04,barMaterialId:'steel@1'}))};
 const solved=await ctx.call('solve_rc_splice_model',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,comboId:'S',frameConvergence:true});assert.equal(solved.ok,true,JSON.stringify(solved));assert.equal(solved.generalConstraintsIncluded,true);assert.equal(solved.pDeltaIncluded,true);assert.ok(Math.abs(solved.originalNodes[0].reactions[0]-50)<1e-7);assert.ok(Math.abs(solved.originalNodes[2].reactions[0]-50)<1e-7);assert.ok(ctx.bridge.getRcSpliceSourceMetadata(solved.sourceId).analysisProof.constraintHash);
}finally{await ctx.dispose();}
console.log('PASS actual WebMCP general constraint/direct automatic refinement and source proof');
