import assert from 'node:assert/strict';
import {designContext} from './fixtures/p24/context.js';
const ctx=designContext(),m=ctx.model;
try{
 m.nodes=[{id:'A',x:0,y:0,z:0,support:'fixed'},{id:'B',x:3,y:0,z:0}];m.members=[{id:'AB',type:'frame',n1:'A',n2:'B',matId:'concrete',secId:'C@1'}];
 m.loadCases=[{id:'D',type:'dead',name:'D'}];m.loads=[{id:'F',type:'nodal',node:'B',dir:'-z',P:1,case:'D'}];m.loadCombinations=[{id:'U',type:'strength',name:'U',factors:{D:1.4}}];m.analysisCases=[{id:'E',name:'E',kind:'static',status:'not-run',settings:{comboId:'U',pDeltaMethod:'off'}}];
 const c=.05+.01/Math.sqrt(2),bars=[-1,1].flatMap(y=>[-1,1].map(z=>({y:y*c,z:z*c,diameter:20})));
 const detail={type:'reinforcement-record',id:'R',name:'synthetic anchor column',version:1,sourceNote:'synthetic',memberId:'AB',start:0,end:1,cover:.04,barMaterialId:'steel@1',bars,stirrupDiameter:10,stirrupSpacing:100,stirrupLegs:2,memberRole:'flexural-member',reinforcementForm:'single-deformed',stirrupForm:'closed-rectangular-two-leg',confinementStandard:'KDS-142050-2022',confinementSystem:'ordinary-flexural-member',tieClosure:'standard-135',tieHookTail:.06,tieBendInsideRadius:.02,tieFirstStart:.05,tieFirstEnd:.05,topAnchorBolts:false,anchorBoltTieEnd:'end'};
 const preview=await ctx.call('preview_design_changes',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,requestId:'anchor-preview',commands:[{type:'section-record',id:'C',name:'240 square',version:1,shape:'RECT',dimensionUnit:'mm',B:240,H:240,sourceNote:'synthetic'},detail]});
 assert.equal((await ctx.call('apply_design_changes',{handle:preview.handle,requestId:'anchor-apply'})).ok,true);
 const run=await ctx.bridge.runElasticWorkflow({plan:ctx.bridge.planElasticWorkflow({caseIds:['E']}),requestId:'anchor-run'});
 const result=await ctx.call('evaluate_practical_design',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,sources:[{analysisRunId:run.steps[0].analysisRunId,comboId:'U'}]});
 const check=ctx.bridge.getPracticalDesignSnapshot(result.evaluationId).checks.find(c=>c.checkId==='rc-confinement');
 assert.equal(check.status,'OK',JSON.stringify(check));assert.ok(check.codeReferences.some(r=>r.clause.includes('4.4.1')));assert.equal(check.codeBasis.status,'CLAUSE_APPLIED');assert.equal(check.compressionReinforcementCoverage,'all-provided-longitudinal-bars');
 assert.equal((await ctx.call('get_design_records',{channel:'reinforcement',id:'R'})).rows[0].confinementSystem,'ordinary-flexural-member');
 const regions=await ctx.call('preview_design_changes',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,requestId:'beam-regions',commands:[{...detail,version:2,end:.5},{...detail,id:'R2',start:.5,stirrupSpacing:500}]});
 assert.ok(regions.handle,JSON.stringify(regions));await ctx.call('apply_design_changes',{handle:regions.handle,requestId:'beam-regions-apply'});
 const rerun=await ctx.bridge.runElasticWorkflow({plan:ctx.bridge.planElasticWorkflow({caseIds:['E']}),requestId:'beam-regions-run'});
 const reviewed=await ctx.call('evaluate_practical_design',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,sources:[{analysisRunId:rerun.steps[0].analysisRunId,comboId:'U'}]});
 const regional=ctx.bridge.getPracticalDesignSnapshot(reviewed.evaluationId).checks.find(c=>c.checkId==='rc-confinement');
 assert.equal(regional.status,'NG',JSON.stringify(regional));assert.equal(regional.detailId,'R2');assert.ok(regional.locationCoverage.failedLocations.some(r=>r.detailId==='R2'));
 console.log('PASS actual WebMCP flexural tie input -> elastic analysis -> provided KDS confinement check');
}finally{await ctx.dispose();}
