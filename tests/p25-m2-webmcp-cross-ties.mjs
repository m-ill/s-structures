import {buildDetailDrawings} from '../src/report/phase24/detailDrawings.js';
import assert from 'node:assert/strict';
import {designContext} from './fixtures/p24/context.js';
const ctx=designContext(),m=ctx.model;
try{
 m.nodes=[{id:'A',x:0,y:0,z:0,support:'fixed'},{id:'B',x:0,y:0,z:3}];m.members=[{id:'AB',type:'frame',n1:'A',n2:'B',matId:'concrete',secId:'C@1'}];
 m.loadCases=[{id:'D',type:'dead',name:'D'}];m.loads=[{id:'F',type:'nodal',node:'B',dir:'-z',P:10,case:'D'}];m.loadCombinations=[{id:'U',type:'strength',name:'U',factors:{D:1.4}}];m.analysisCases=[{id:'E',name:'E',kind:'static',status:'not-run',settings:{comboId:'U',pDeltaMethod:'off'}}];
 const c=.13+.01/Math.sqrt(2),bars=[[-c,-c],[-.14,0],[-c,c],[0,.14],[c,c],[.14,0],[c,-c],[0,-.14]].map(([y,z])=>({y,z,diameter:20}));
 const detail={type:'reinforcement-record',id:'R',name:'synthetic column',version:1,sourceNote:'synthetic',memberId:'AB',start:0,end:1,cover:.04,barMaterialId:'steel@1',bars,stirrupDiameter:10,stirrupSpacing:200,stirrupLegs:2,memberRole:'compression-member',reinforcementForm:'single-deformed',stirrupForm:'closed-rectangular-two-leg',confinementStandard:'KDS-142050-2022',confinementSystem:'ordinary-tied-column',tieClosure:'standard-135',tieHookTail:.06,tieBendInsideRadius:.02,tieFirstStart:.1,tieFirstEnd:.1,fabricationShape:'straight',endSetbackStart:.04,endSetbackEnd:.04,topAnchorBolts:false,crossTieHookSides:['left','right'],crossTiePlaneOffsets:['0.015','0.015'],crossTieBarPairs:['2:6','4:8']};
 const preview=await ctx.call('preview_design_changes',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,requestId:'cross-preview',commands:[{type:'section-record',id:'C',name:'400 square',version:1,shape:'RECT',dimensionUnit:'mm',B:400,H:400,sourceNote:'synthetic'},detail]});
 assert.equal((await ctx.call('apply_design_changes',{handle:preview.handle,requestId:'cross-apply'})).ok,true);
 assert.deepEqual((await ctx.call('get_design_records',{channel:'reinforcement',id:'R'})).rows[0].crossTieBarPairs,['2:6','4:8']);
 const run=await ctx.bridge.runElasticWorkflow({plan:ctx.bridge.planElasticWorkflow({caseIds:['E']}),requestId:'cross-run'});assert.equal(run.ok,true);
 const evaluation=await ctx.call('evaluate_practical_design',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,sources:[{analysisRunId:run.steps[0].analysisRunId,comboId:'U'}]});
 const check=ctx.bridge.getPracticalDesignSnapshot(evaluation.evaluationId).checks.find(c=>c.checkId==='rc-confinement');assert.equal(check.status,'NG',JSON.stringify(check));assert.equal(check.supports.supportedBarIndices.length,8);assert.equal(check.supports.fabricationApproved,false);assert.ok(check.codeReferences.some(r=>r.clause.includes('4.4.2(3)')));
 const snapshot=ctx.bridge.getPracticalDesignSnapshot(evaluation.evaluationId);
 const geometry=snapshot.preparedDetails.reinforcement['R@1'].crossTies;
 assert.deepEqual(check.geometry,geometry);assert.equal(geometry.pieces.length,2);assert.equal(geometry.status,'NG');assert.ok(geometry.assembly.checks.some(c=>c.kind==='cross-tie-pair'&&c.status==='NG')); // Same-plane cross ties collide.
 const drawings=buildDetailDrawings(snapshot),qs=drawings.quantities.filter(q=>q.kind==='cross-tie');
 assert.equal(qs.length,2);assert.equal(qs[0].planeOffset,.015);assert.ok(qs[0].cutLength>0);assert.ok(qs[0].count>0);assert.equal(qs[0].fabricationApproved,false);
 assert.ok(drawings.pages[0].commands.some(c=>c.text?.includes('크로스타이 형상 NG')));
 assert.deepEqual(drawings.quantities.find(q=>q.kind==='stirrup').perimeterGeometry,snapshot.preparedDetails.reinforcement['R@1'].outerHoop);
 assert.equal(snapshot.preparedDetails.reinforcement['R@1'].outerHoop.status,'OK');
 const plan=await ctx.call('plan_design_candidates',{evaluationId:evaluation.evaluationId,memberId:'AB',regionConstraints:[{detailId:'R',crossTieLayerSteps:[.012],perimeterYCounts:[4],perimeterZCounts:[4]}],sectionCandidates:[{B:420,H:420}],maxCandidates:1,maxMillis:10000});
 const start=await ctx.call('start_design_candidates',{planId:plan.planId,requestId:'cross-repair-job'});let job;
 for(let i=0;i<500;i++){job=await ctx.call('get_design_candidates',{jobId:start.jobId});if(job.status!=='running')break;await new Promise(r=>setTimeout(r,10));}
 assert.ok(job.best,JSON.stringify(job));
 const receipt=await ctx.call('apply_design_candidate_and_review',{jobId:job.jobId,candidateId:job.best.candidateId,requestId:'cross-repair-apply'});
 assert.equal(receipt.followUp.status,'completed',JSON.stringify(receipt));
 const records=(await ctx.call('get_design_records',{channel:'reinforcement',id:'R'})).rows;
 assert.deepEqual(records.find(r=>r.version===2).crossTiePlaneOffsets,['0.012','0.024','0.036','0.048']);
 assert.equal(records.find(r=>r.version===2).bars.length,12);
 assert.deepEqual(records.find(r=>r.version===2).crossTieBarPairs,['2:6','3:7','9:10','11:12']);
 assert.ok(Math.abs(records.find(r=>r.version===2).bars[1].y+.15)<1e-10);
 const repaired=ctx.bridge.getPracticalDesignSnapshot(receipt.followUp.evaluationId).checks.find(c=>c.checkId==='rc-confinement');
 assert.equal(repaired.status,'OK',JSON.stringify(repaired));
 assert.ok(repaired.geometry.assembly.checks.filter(c=>c.kind==='cross-tie-pair').every(c=>c.status==='OK'));
 assert.equal(repaired.outerHoop.actualPathAssembly.status,'OK');
 assert.ok(repaired.outerHoop.actualPathAssembly.checks.every(c=>c.centerlineLowerBound===c.centerlineUpperBound));
 assert.equal(repaired.geometry.fabricationApproved,false);assert.equal(repaired.geometry.contactCoverage.status,'OK');
 console.log('PASS actual WebMCP cross-tie pair storage and eight-bar confinement evaluation');
}finally{await ctx.dispose();}
