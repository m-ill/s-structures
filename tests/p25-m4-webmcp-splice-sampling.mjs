import assert from 'node:assert/strict';
import {designContext} from './fixtures/p24/context.js';
import {buildDetailDrawings} from '../src/report/phase24/detailDrawings.js';
const ctx=designContext(),m=ctx.model;
try{
 m.nodes=[{id:'A',x:0,y:0,z:0,support:'fixed'},{id:'B',x:4,y:0,z:0}];m.members=[{id:'AB',type:'frame',n1:'A',n2:'B',matId:'concrete',secId:'rc3060'}];
 m.loadCases=[{id:'D',type:'dead',name:'D'}];m.loads=[{id:'F',type:'nodal',node:'B',dir:'-z',P:1,case:'D'}];m.loadCombinations=[{id:'U',type:'strength',name:'U',factors:{D:1.4}}];m.analysisCases=[{id:'E',name:'E',kind:'static',status:'not-run',settings:{comboId:'U',pDeltaMethod:'off'}}];
 const bars={coverStandard:'KDS-142050-2022',coverExposure:'indoor',chlorideExposure:'none',fireCoverRequired:0,abrasionCoverRequired:0,coverExternalReference:'synthetic',type:'reinforcement-record',id:'R',name:'test',version:1,memberId:'AB',start:0,end:1,cover:.04,barMaterialId:'steel@1',sourceNote:'synthetic',bars:[{y:-.2,z:-.08,diameter:20},{y:-.2,z:.08,diameter:20}],reinforcementForm:'single-deformed',strengthStandard:'KDS-142020-2022',concreteWeight:'normal',barPosition:'other',barCoating:'uncoated',lapRequired:true,aggregateMaxSize:.02,stirrupDiameter:10,stirrupSpacing:150,stirrupLegs:2,startFabricationShape:'straight',endFabricationShape:'straight',endSetbackStart:.04,endSetbackEnd:.04};
 const splice={type:'splice-record',id:'SP',name:'test',version:1,sourceNote:'synthetic',memberId:'AB',reinforcementId:'R@1',barIndices:['1','2'],start:.401,end:.402,offsetY:.02,offsetZ:0,spliceType:'tension-B',spliceSystem:'ordinary-no-seismic-detail',continuationSide:'offset-toward-end'};
 const preview=await ctx.call('preview_design_changes',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,requestId:'path-preview',commands:[bars,splice]});
 assert.equal((await ctx.call('apply_design_changes',{handle:preview.handle,requestId:'path-apply'})).ok,true);
 assert.equal((await ctx.call('get_design_records',{channel:'splices',id:'SP'})).rows[0].continuationSide,'offset-toward-end');
 const run=await ctx.bridge.runElasticWorkflow({plan:ctx.bridge.planElasticWorkflow({caseIds:['E']}),requestId:'path-run'});assert.equal(run.ok,true);
 const evaluated=await ctx.call('evaluate_practical_design',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,sources:[{analysisRunId:run.steps[0].analysisRunId,comboId:'U'}]});
 const snapshot=ctx.bridge.getPracticalDesignSnapshot(evaluated.evaluationId),path=snapshot.preparedDetails.reinforcement['R@1'].bars[0].splicePath;
 assert.equal(path.status,'OK');assert.equal(path.pieces.length,2);assert.ok(Math.abs(path.totalCutLength-3.924)<1e-10);
 assert.equal(snapshot.checks.find(c=>c.checkId==='rc-stability').status,'N_A');
 const cover=snapshot.checks.find(c=>c.checkId==='rc-cover');assert.equal(cover.locationCoverage.counts.NOT_CHECKED,2);assert.ok(cover.locationCoverage.counts.OK>=4);
 const strength=snapshot.checks.find(c=>c.checkId==='rc-section-strength');assert.equal(strength.status,'NOT_CHECKED');assert.equal(strength.spliceLayoutEvaluated,true);assert.equal(strength.spliceSamplingCoverage.complete,true,JSON.stringify(strength.boundaryRecovery));assert.equal(strength.boundaryRecovery.status,'OK');assert.equal(strength.boundaryRecovery.sourceVerification.status,'OK');assert.ok(strength.boundaryRecovery.sourceVerification.stationCount>2);assert.equal(strength.boundaryRecovery.recovered,4);assert.ok(snapshot.demands.some(t=>t.side==='right'&&t.x===.401*4&&t.recoveryBasis==='stored-equilibrium-end-and-span-loads'));assert.equal(strength.spliceSamplingCoverage.demandInterpolated,false);assert.ok(strength.locationCoverage.counts.OK>0);assert.ok(strength.locationCoverage.counts.NOT_CHECKED>0);
 const drawings=buildDetailDrawings(snapshot);const q=drawings.quantities.find(q=>q.mark==='B1'&&q.detailId==='R');assert.equal(q.pieceCount,2);assert.equal(q.cutLength,null);assert.deepEqual(q.splicePath,path);
 assert.ok(drawings.pages[0].commands.some(c=>c.kind==='text'&&c.text.includes('조각 2개')));
 const reviewPlan=await ctx.call('plan_design_review',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,sources:[{analysisRunId:run.steps[0].analysisRunId,comboId:'U'}]});
 const review=await ctx.call('start_design_review',{handle:reviewPlan.handle,requestId:'path-review'});
 const stored=ctx.bridge.getDesignReview(review.designRunId).result.checks.find(c=>c.id===strength.id);assert.equal(stored.status,strength.status);assert.deepEqual(stored.locationCoverage,strength.locationCoverage);assert.deepEqual(stored.spliceSamplingCoverage,strength.spliceSamplingCoverage);
 console.log('PASS WebMCP narrow splice boundaries recovered from source end actions and loads in both reviews');
}finally{await ctx.dispose();}
