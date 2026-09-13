import assert from 'node:assert/strict';
import {designContext} from './fixtures/p24/context.js';
import {evaluatePracticalDesign} from '../src/design/evaluation/practicalEvaluation.js';
const ctx=designContext(),m=ctx.model;
m.nodes=[{id:'A',x:0,y:0,z:0,support:'fixed'},{id:'B',x:3,y:0,z:0}];
m.members=[{id:'AB',n1:'A',n2:'B',type:'frame',matId:'concrete',secId:'rc3060'}];
m.loadCases=[{id:'D',name:'D',type:'dead'}];
m.loads=[{id:'F',type:'nodal',node:'B',P:1,dir:'-z',case:'D'}];
m.loadCombinations=[{id:'U',name:'U',type:'strength',factors:{D:1.4}}];
const base={type:'reinforcement-record',name:'synthetic region',version:1,memberId:'AB',cover:0.04,barMaterialId:'steel@1',bars:[{y:0.2,z:-0.08,diameter:20},{y:0.2,z:0.08,diameter:20},{y:-0.2,z:-0.08,diameter:20},{y:-0.2,z:0.08,diameter:20}],stirrupDiameter:10,stirrupSpacing:150,stirrupLegs:2,sourceNote:'synthetic',strengthStandard:'KDS-142020-2022',reinforcementForm:'single-deformed',shearStandard:'KDS-142022-2022',shearScope:'ordinary-prismatic-no-opening',concreteWeight:'normal',stirrupForm:'closed-rectangular-two-leg'};
try {
 const commands=[{...base,id:'left',start:0,end:0.5},{...base,id:'right',start:0.5,end:1}];
 const preview=await ctx.call('preview_design_changes',{requestId:'p25-regions',inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,commands});
 assert.equal(preview.ok,true,JSON.stringify(preview));
 assert.equal((await ctx.call('apply_design_changes',{requestId:'p25-regions-apply',handle:preview.handle})).ok,true);
 const rows=(await ctx.call('get_design_records',{channel:'reinforcement'})).rows;
 assert.deepEqual(rows.map(x=>[x.id,x.start,x.end]),[['left',0,0.5],['right',0.5,1]]);
 const set={ok:true,anyOk:true,combo:{id:'U'},memberResults:{AB:{xs:[1.5],N:[0],Vy:[1],Vz:[1],T:[0],My:[0],Mz:[1]}}};
 const r=evaluatePracticalDesign(m,{byCombo:{U:set}},{resultSet:set});
 for(const id of ['rc-section-strength','rc-shear-y','rc-shear-z']){
  const check=r.checks.find(x=>x.checkId===id);
  assert.equal(check.detailId,'right',JSON.stringify(check));
  assert.ok(['OK','NG'].includes(check.status));
 }
 const before=JSON.stringify(m);
 await assert.rejects(ctx.call('preview_design_changes',{requestId:'p25-overlap',inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,commands:[{...base,id:'overlap',start:0.4,end:0.6}]}),/MODEL_VALIDATION_FAILED/);
 assert.equal(JSON.stringify(m),before);
 const moved=await ctx.call('preview_design_changes',{requestId:'p25-move-boundary',inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,commands:[{...commands[0],version:2,end:0.6},{...commands[1],version:2,start:0.6}]});
 assert.equal((await ctx.call('apply_design_changes',{requestId:'p25-move-apply',handle:moved.handle})).ok,true);
 assert.equal((await ctx.call('get_design_records',{channel:'reinforcement',id:'left'})).rows[0].end,0.6);
 assert.equal((await ctx.call('undo_design_input',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash})).ok,true);
 assert.deepEqual((await ctx.call('get_design_records',{channel:'reinforcement'})).rows,rows);
 console.log('PASS P25 WebMCP adjacent input/read, strength/shear boundary ownership and overlap rejection');
}finally{await ctx.dispose();}
