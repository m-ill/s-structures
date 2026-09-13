import {buildDetailDrawings} from '../src/report/phase24/detailDrawings.js';
import assert from 'node:assert/strict';
import {designContext} from './fixtures/p24/context.js';
const ctx=designContext(),m=ctx.model;
try{
 m.nodes=[{id:'A',x:0,y:0,z:0,support:'fixed'},{id:'B',x:0,y:0,z:3}];m.members=[{id:'AB',type:'frame',n1:'A',n2:'B',matId:'concrete',secId:'C@1'}];
 m.loadCases=[{id:'D',type:'dead',name:'D'}];m.loads=[{id:'F',type:'nodal',node:'B',dir:'-z',P:10,case:'D'}];m.loadCombinations=[{id:'U',type:'strength',name:'U',factors:{D:1.4}}];m.analysisCases=[{id:'E',name:'E',kind:'static',status:'not-run',settings:{comboId:'U',pDeltaMethod:'off'}}];
 const c=.13+.01/Math.sqrt(2),h=.23+.01/Math.sqrt(2),bars=[[-h,-c],[-.24,0],[-h,c],[0,.14],[h,c],[.24,0],[h,-c],[0,-.14]].map(([y,z])=>({y,z,diameter:20}));
 const detail={type:'reinforcement-record',id:'R',name:'synthetic column',version:1,sourceNote:'synthetic',memberId:'AB',start:0,end:1,cover:.04,barMaterialId:'steel@1',bars,stirrupDiameter:10,stirrupSpacing:150,stirrupLegs:2,memberRole:'compression-member',reinforcementForm:'single-deformed',stirrupForm:'closed-rectangular-two-leg',confinementStandard:'KDS-142050-2022',confinementSystem:'ordinary-tied-column',tieClosure:'standard-135',tieHookTail:.06,tieBendInsideRadius:.02,tieFirstStart:.075,tieFirstEnd:.05,topAnchorBolts:false,crossTieHookSides:['left','right'],crossTiePlaneOffsets:['0.024','0.012'],fabricationShape:'L90',endSetbackStart:.04,endSetbackEnd:.04,bendInsideRadius:.06,hookTailLength:.24,crossTieBarPairs:['2:6','4:8']};
 const preview=await ctx.call('preview_design_changes',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,requestId:'cross-preview',commands:[{type:'section-record',id:'C',name:'400 square',version:1,shape:'RECT',dimensionUnit:'mm',B:400,H:600,sourceNote:'synthetic'},detail]});
 assert.equal((await ctx.call('apply_design_changes',{handle:preview.handle,requestId:'cross-apply'})).ok,true);
 assert.deepEqual((await ctx.call('get_design_records',{channel:'reinforcement',id:'R'})).rows[0].crossTieBarPairs,['2:6','4:8']);
 const run=await ctx.bridge.runElasticWorkflow({plan:ctx.bridge.planElasticWorkflow({caseIds:['E']}),requestId:'cross-run'});assert.equal(run.ok,true);
 const evaluation=await ctx.call('evaluate_practical_design',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,sources:[{analysisRunId:run.steps[0].analysisRunId,comboId:'U'}]});
 const check=ctx.bridge.getPracticalDesignSnapshot(evaluation.evaluationId).checks.find(c=>c.checkId==='rc-confinement');assert.equal(check.status,'NG',JSON.stringify(check));assert.equal(check.supports.supportedBarIndices.length,8);assert.equal(check.supports.fabricationApproved,false);assert.ok(check.codeReferences.some(r=>r.clause.includes('4.4.2(3)')));
 const snapshot=ctx.bridge.getPracticalDesignSnapshot(evaluation.evaluationId);
 const geometry=snapshot.preparedDetails.reinforcement['R@1'].crossTies;
 assert.deepEqual(check.geometry,geometry);assert.equal(geometry.pieces.length,2);assert.equal(geometry.status,'NG');assert.equal(geometry.actualPathAssembly.status,'NG');assert.ok(geometry.actualPathAssembly.checks.some(c=>c.status==='NG'&&Number.isFinite(c.witness?.plane)));
 assert.deepEqual(check.outerHoop,snapshot.preparedDetails.reinforcement['R@1'].outerHoop);
 assert.ok(check.outerHoop.actualPathAssembly.checks.length>0);
 const drawings=buildDetailDrawings(snapshot),qs=drawings.quantities.filter(q=>q.kind==='cross-tie');
 assert.equal(qs.length,2);assert.equal(qs[0].planeOffset,.024);assert.ok(qs[0].cutLength>0);assert.ok(qs[0].count>0);assert.equal(qs[0].fabricationApproved,false);
 assert.ok(drawings.pages[0].commands.some(c=>c.text?.includes('크로스타이 형상 NG')));
 console.log('PASS actual WebMCP prepared longitudinal end-path collision in confinement and drawing result');
}finally{await ctx.dispose();}
