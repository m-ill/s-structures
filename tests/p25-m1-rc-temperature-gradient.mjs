import {resolveMaterialRecord} from '../src/materials/registry.js';
import {rcSpatialRelativeChange} from '../src/metadata/rcSplicePolicy.js';
import assert from 'node:assert/strict';
import {rcThermalInitialStrains} from '../src/compute/product/rcThermalInitialStrains.js';
import {designContext} from './fixtures/p24/context.js';
const element={H:.6,thermalExpansion:{concrete:1e-5,steel:2e-5}};
const thermal=rcThermalInitialStrains({type:'tgradient',dTtop:20,dTbot:0},element,.5);assert.ok(Math.abs(thermal.strains.concrete[2]+1/6000)<1e-15);assert.ok(Math.abs(thermal.strains.steel[2]+1/3000)<1e-15);assert.equal(thermal.depth,.6);
assert.throws(()=>rcThermalInitialStrains({type:'tgradient',dTtop:20,dTbot:0,h:0},element,1),{code:'RC_MODEL_TEMPERATURE_DEPTH_REQUIRED'});
const ctx=designContext();try{
 const m=ctx.model;m.nodes=[{id:'A',x:0,y:0,z:0,support:'fixed'},{id:'B',x:3,y:0,z:0}];m.members=[{id:'AB',type:'frame',n1:'A',n2:'B',matId:'concrete',secId:'rc3060'}];m.analysisSettings.shearDeformation=false;m.analysisSettings.includeSelfWeight=false;m.analysisSettings.pDeltaMethod='off';m.loadCombinations=[{id:'S',type:'service',factors:{D:.5}}];m.loads=[];m.loadCases=[{id:'D',type:'dead',name:'D'}];
 const preview=await ctx.call('preview_design_changes',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,requestId:'thermal-input',commands:[{type:'load',mode:'create',value:{id:'T',type:'tgradient',member:'AB',case:'D',dTtop:20,dTbot:0,h:.6,hUnit:'m',alpha:1e-5,alphaUnit:'1/degC',unit:'degC'}}]});
 assert.equal((await ctx.call('apply_design_changes',{handle:preview.handle,requestId:'thermal-apply'})).ok,true);
 m.designDetails={reinforcement:[{id:'R',version:1,memberId:'AB',start:0,end:1,bars:[-.2,.2].flatMap(y=>[-.08,.08].map(z=>({y,z,diameter:.02,area:Math.PI*.02**2/4}))),cover:.04,barMaterialId:'steel@1'}]};
 const r=await ctx.call('solve_rc_splice_model',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,comboId:'S',frameConvergence:true});assert.equal(r.ok,true,JSON.stringify(r));assert.equal(r.temperatureIncluded,true);assert.ok(Math.abs(r.originalNodes[1].displacements[2]+.00075)<1e-9);assert.ok(Math.abs(r.originalNodes[1].displacements[4]-.0005)<1e-9);assert.ok(Math.max(...r.originalNodes[0].reactions.map(Math.abs))<1e-7);assert.ok(r.loadSources.every(s=>s.type==='tgradient'&&s.depth===.6&&s.externalNodalLoadAdded===false));
 m.nodes[1].support='fixed';const fixed=await ctx.call('solve_rc_splice_model',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,comboId:'S'});assert.equal(fixed.ok,true,JSON.stringify(fixed));const Ec=resolveMaterialRecord(m,'concrete').elastic.E,Es=resolveMaterialRecord(m,'steel@1').elastic.E,steelI=m.designDetails.reinforcement[0].bars.reduce((sum,b)=>sum+b.area*b.y*b.y,0),EI=1000*(Ec*.3*.6**3/24+(Es-Ec/2)*steelI);assert.ok(Math.abs(fixed.segments[0].localEndForces[11]-EI/6000)<1e-8);
}finally{await ctx.dispose();}
console.log('PASS material-specific gradient, factor/depth validation and actual free cantilever curvature sign');

assert.ok(rcSpatialRelativeChange(0,1e-14,'stressMPa')<.002);assert.ok(rcSpatialRelativeChange(0,2e-9,'stressMPa')>.002);assert.ok(rcSpatialRelativeChange(100,101,'stressMPa')>.002);
