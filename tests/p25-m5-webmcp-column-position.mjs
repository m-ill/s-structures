import {evaluateColumnTransfer} from '../src/design/foundation/columnTransfer.js';
import {resolveFootingLoadLedger} from '../src/design/foundation/footingLoadLedger.js';
import assert from 'node:assert/strict';
import {stagePracticalDesignInput} from '../src/modeling/practicalDesignInputs.js';
import {validateModel} from '../src/core/validation.js';
import {designContext} from './fixtures/p24/context.js';
import {buildDetailDrawings} from '../src/report/phase24/detailDrawings.js';
import {validateStoredDesignDetails} from '../src/modeling/designDetailValidation.js';
const ctx=designContext(),m=ctx.model;
try{
 m.nodes=[{id:'A',x:0,y:0,z:0,support:'fixed'},{id:'B',x:0,y:0,z:3}];m.members=[{id:'AB',type:'frame',n1:'A',n2:'B',matId:'concrete',secId:'rc3060'}];m.loadCases=[{id:'D',type:'dead',name:'D'}];m.loads=[{id:'F',type:'nodal',node:'B',P:10,dir:'-z',case:'D'}];m.loadCombinations=[{id:'U',type:'strength',name:'U',factors:{D:1.4}}];m.analysisCases=[{id:'E',name:'E',kind:'static',status:'not-run',settings:{comboId:'U',pDeltaMethod:'off'}}];
 const ground={type:'ground-record',id:'G',name:'synthetic',version:1,sourceNote:'test',sourceReference:'fixture',basisStatus:'specified',allowableBearing:150,bearingBasis:'gross'};
 const columnBars={type:'reinforcement-record',id:'R',name:'continuous column bars',version:1,sourceNote:'synthetic',memberId:'AB',start:0,end:1,cover:.04,barMaterialId:'steel@1',reinforcementForm:'single-deformed',barCoating:'uncoated',lapRequired:false,bars:[-1,1].flatMap(y=>[-1,1].map(z=>({y:y*.2,z:z*.08,diameter:20})))};
 const footing={columnOffsetX:.2,columnOffsetY:-.1,reactionMomentReference:'column-center',columnTransferType:'cast-in-place-continuous-straight-bars',columnMemberId:'AB',columnEmbedmentLength:.3,columnDevelopmentAbove:.3,barShape:'straight',shrinkageRestraint:'ordinary-not-severely-restrained',type:'foundation-record',id:'F',name:'synthetic',version:1,sourceNote:'test',nodeId:'A',foundationType:'isolated',B:2,L:2,thickness:.5,cover:.05,materialId:'concrete@1',groundId:'G@1',barMaterialId:'steel@1',bottomDiameterB:16,bottomDiameterL:16,bottomSpacingB:150,bottomSpacingL:150,topDiameterB:16,topDiameterL:16,topSpacingB:150,topSpacingL:150,footingWeightCaseId:'D',reactionBasis:'superstructure-only',columnWidth:.6,columnDepth:.3,flexureStandard:'KDS-142020-2022',concreteWeight:'normal',barCoating:'uncoated',punchingStandard:'KDS-142022-2022',punchingMomentMethod:'conservative-perimeter-shear',punchingPerimeterScope:'interior-solid-no-openings'};
 assert.ok((await ctx.call('get_design_input_schema',{type:'foundation-record'})).schema.properties.topDiameterB);
 const staging=structuredClone(m);for(const c of [ground,columnBars,footing])stagePracticalDesignInput(staging,c,[]);assert.equal(validateModel(staging).ok,true,JSON.stringify(validateModel(staging)));
 const preview=await ctx.call('preview_design_changes',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,requestId:'footing-preview',commands:[ground,columnBars,footing]});
 assert.equal((await ctx.call('apply_design_changes',{handle:preview.handle,requestId:'footing-apply'})).ok,true);
 const stored=(await ctx.call('get_design_records',{channel:'foundations',id:'F'})).rows[0];assert.equal(stored.reinforcement.topB.diameter,.016);assert.deepEqual(validateStoredDesignDetails(m),[]);
 const run=await ctx.bridge.runElasticWorkflow({plan:ctx.bridge.planElasticWorkflow({caseIds:['E']}),requestId:'footing-source'});assert.equal(run.ok,true);
 const result=await ctx.call('evaluate_practical_design',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,sources:[{analysisRunId:run.steps[0].analysisRunId,comboId:'U'}]});
 const snapshot=ctx.bridge.getPracticalDesignSnapshot(result.evaluationId),checks=snapshot.checks;
 assert.equal(stored.columnOffsetX,.2);assert.equal(stored.columnOffsetY,-.1);assert.equal(stored.reactionMomentReference,'column-center');
 const flex=checks.find(row=>row.checkId==='foundation-flexure');assert.ok(flex.axisChecks,JSON.stringify(flex));
 assert.equal(flex.axisChecks.find(row=>row.axis==='B'&&row.side===1).cutCoordinate,.5);
 const ledger=flex.loadLedger;assert.ok(Math.abs(ledger.totalMy+ledger.columnN*.2)<1e-8);assert.ok(Math.abs(ledger.totalMx+ledger.columnN*.1)<1e-8);
 const punching=checks.find(row=>row.checkId==='foundation-punching');assert.equal(punching.transfer.actions.columnOffsetX,.2);assert.equal(punching.transfer.actions.columnOffsetY,-.1);
 assert.equal(punching.unit,'kPa');
 // The punching ratio covers the required bar extension as well as the shear
 // stress (ratioBasis: maximum-shear-and-required-extension), so the stress
 // pair matches shearRatio and the reported ratio is the governing maximum.
 assert.equal(punching.ratioBasis,'maximum-shear-and-required-extension');
 assert.ok(Math.abs(punching.shearRatio-punching.demand/punching.capacity)<1e-10);
 assert.equal(punching.ratio,Math.max(punching.shearRatio,punching.extensionRatio));
 const detail=snapshot.preparedDetails.foundations['F@1'];assert.equal(detail.columnBars.length,4);
 assert.ok(Math.abs(detail.columnBars.reduce((n,b)=>n+b.x,0)/4-.2)<1e-12);assert.ok(Math.abs(detail.columnBars.reduce((n,b)=>n+b.y,0)/4+.1)<1e-12);
 let text='',offset=0;do{const row=await ctx.call('get_practical_design_check',{evaluationId:result.evaluationId,checkId:punching.id,offset,limit:4096});text+=row.chunk;offset=row.nextOffset;}while(offset!==null);
 assert.deepEqual(JSON.parse(text),punching);
 const drawings=buildDetailDrawings(snapshot),page=drawings.pages.find(row=>row.commands.some(c=>c.kind==='text'&&c.text.includes('기둥 편심 X 200 / Y -100')));assert.ok(page);
 const exported=await ctx.call('export_design_drawings',{evaluationId:result.evaluationId,format:'json'});const chunks=[];offset=0;
 do{const row=await ctx.call('get_design_drawing_artifact',{artifactId:exported.artifactId,offset});chunks.push(Buffer.from(row.content,'base64'));offset=row.nextOffset;}while(offset!==null);
 const artifact=JSON.parse(Buffer.concat(chunks).toString());assert.deepEqual(artifact.pages,drawings.pages);
 const edgePreview=await ctx.call('preview_design_changes',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,requestId:'corner-preview',commands:[{...footing,version:2,columnOffsetX:.7,columnOffsetY:.85,punchingPerimeterScope:'rectangular-solid-no-openings'}]});
 assert.equal((await ctx.call('apply_design_changes',{handle:edgePreview.handle,requestId:'corner-apply'})).ok,true);
 const cornerRun=await ctx.bridge.runElasticWorkflow({plan:ctx.bridge.planElasticWorkflow({caseIds:['E']}),requestId:'corner-run'});
 const cornerReview=await ctx.call('evaluate_practical_design',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,sources:[{analysisRunId:cornerRun.steps[0].analysisRunId,comboId:'U'}]});
 const cornerSnapshot=ctx.bridge.getPracticalDesignSnapshot(cornerReview.evaluationId),punch=cornerSnapshot.checks.find(row=>row.checkId==='foundation-punching');
 assert.ok(['OK','NG'].includes(punch.status),JSON.stringify(punch));assert.equal(punch.perimeter.columnPosition,'corner');assert.equal(punch.perimeter.segments.length,2);assert.equal(punch.transfer.actions.momentReference,'critical-perimeter-centroid');assert.equal(punch.methodReviewRequired,true);assert.equal(punch.codeBasis.status,'NOT_ESTABLISHED');
 assert.equal(cornerSnapshot.checks.find(row=>row.checkId==='foundation-anchorage').status,'NG');
 assert.equal(punch.unit,'kPa');assert.ok(Math.abs(punch.shearRatio-punch.demand/punch.capacity)<1e-10);assert.equal(punch.ratio,Math.max(punch.shearRatio,punch.extensionRatio));
 const prepared=cornerSnapshot.preparedDetails.foundations['F@2'].punchingPerimeter;assert.deepEqual(punch.perimeter,prepared.equivalent[0]);
 assert.ok(buildDetailDrawings(cornerSnapshot).pages.some(p=>p.commands.some(c=>c.kind==='text'&&c.text.includes('펀칭 위험둘레 corner'))));
 assert.equal((await ctx.call('undo_design_input',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash})).ok,true);
 console.log('PASS actual WebMCP offset footing typed input/store, analysis, result query, prepared column bars, JSON drawing and undo');
}finally{await ctx.dispose();}
