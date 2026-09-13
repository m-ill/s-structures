import {resolveMaterialRecord} from '../src/materials/registry.js';
import assert from 'node:assert/strict';
import {rcLapFrame} from '../src/solver/rcLapFrame.js';
const L=3,area=.0003,bars=[-.2,.2].flatMap(y=>[-.08,.08].map(z=>({y,z,area}))),base={length:L,B:.3,H:.6,Ec:25000,Es:200000,bars,laps:[],subdivisions:8},zero=Array(12).fill(0),strain=[.0002,.0001,-.00015];
const free=[...zero];free[6]=strain[0]*L;free[8]=strain[1]*L*L/2;free[10]=-strain[1]*L;free[7]=strain[2]*L*L/2;free[11]=strain[2]*L;
const released=rcLapFrame({...base,endDisplacements:free,initialStrains:{concrete:strain,steel:strain}});assert.ok(Math.max(...released.endForces.map(Math.abs))<1e-8);assert.ok(released.maximumSteelStress<1e-8);assert.equal(released.initialStrainIncluded,true);
const fixed=rcLapFrame({...base,endDisplacements:zero,initialStrains:{concrete:[.0002,0,0],steel:[.0003,0,0]}});const N=-(25000*1000*(.18-4*area)*.0002+200000*1000*4*area*.0003);assert.ok(Math.abs(fixed.endForces[6]-N)<1e-8);assert.ok(Math.abs(fixed.maximumSteelStress-60)<1e-9);
const lap={barIndex:0,offset:{y:-.18,z:-.08,area},transferStiffness:80000,continuationSide:'offset-toward-end',boundarySlips:[0,0,0,0]};const joined=rcLapFrame({...base,laps:[lap],endDisplacements:free,initialStrains:{concrete:strain,steel:strain}});assert.ok(Math.max(...joined.endForces.map(Math.abs),...joined.slipAssembly.forces.map(Math.abs))<1e-8);
assert.throws(()=>rcLapFrame({...base,endDisplacements:zero,initialStrains:{steel:[NaN,0,0]}}),{code:'RC_LAP_INITIAL_STRAIN_INVALID'});
console.log('PASS independent RC thermal/eigenstrain free extension/curvature, differential restraint and retained lap slip ports');

import {designContext} from './fixtures/p24/context.js';
const ctx=designContext();try{
 const m=ctx.model;m.nodes=[{id:'A',x:0,y:0,z:0,support:'fixed'},{id:'B',x:3,y:0,z:0,support:'fixed'}];m.members=[{id:'AB',type:'frame',n1:'A',n2:'B',matId:'concrete',secId:'rc3060'}];m.analysisSettings.shearDeformation=false;m.analysisSettings.includeSelfWeight=false;m.analysisSettings.pDeltaMethod='off';m.loadCombinations=[{id:'S',type:'service',factors:{D:.5}}];m.loads=[{id:'TEMP',type:'temperature',member:'AB',case:'D',dT:20,alpha:1e-5}];m.designDetails={reinforcement:[{id:'R',version:1,memberId:'AB',start:0,end:1,bars:bars.map(b=>({...b,diameter:.02,area:Math.PI*.02**2/4})),cover:.04,barMaterialId:'steel@1'}]};
 const solved=await ctx.call('solve_rc_splice_model',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,comboId:'S',frameConvergence:true});assert.equal(solved.ok,true,JSON.stringify(solved));assert.equal(solved.temperatureIncluded,true);assert.equal(solved.frameRefinement.convergenceVerified,true);assert.ok(solved.loadSources.every(r=>r.type==='temperature'&&r.initialStrain.concrete===.0001&&r.externalNodalLoadAdded===false));assert.ok(Math.abs(solved.originalNodes[0].reactions[0]+solved.originalNodes[1].reactions[0])<1e-8);assert.ok(solved.originalNodes[0].reactions[0]>0);
 const first=solved;delete m.loads[0].alpha;m.materials.find(x=>x.id==='concrete').alpha=1e-5;const steel=resolveMaterialRecord(m,'steel@1');m.materials.push({...steel,scope:'project',elastic:{...steel.elastic,alpha:2e-5}});
 const different=await ctx.call('solve_rc_splice_model',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,comboId:'S'});assert.equal(different.ok,true,JSON.stringify(different));assert.ok(different.originalNodes[0].reactions[0]>first.originalNodes[0].reactions[0]);
}finally{await ctx.dispose();}
console.log('PASS actual WebMCP uniform temperature, once-only combination factor, automatic refinement and distinct material alpha');
