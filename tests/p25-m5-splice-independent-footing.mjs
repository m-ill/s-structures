import {columnTransferSpliceProof} from '../src/design/foundation/columnTransferSpliceProof.js';
import assert from 'node:assert/strict';
import {designContext} from './fixtures/p24/context.js';
import {evaluateProvidedFooting} from '../src/design/foundation/providedFooting.js';
const explicitPath=process.env.P25_FOOTING_SPLICE_LAYOUT==='1',ctx=designContext(),m=ctx.model;
try{
 m.nodes=[{id:'A',x:0,y:0,z:0,support:'fixed'},{id:'B',x:0,y:0,z:3}];m.members=[{id:'AB',type:'frame',n1:'A',n2:'B',matId:'concrete',secId:'rc3060'}];m.loadCases=[{id:'D',type:'dead',name:'D'}];m.loads=[{id:'F',type:'nodal',node:'B',P:10,dir:'-z',case:'D'}];m.loadCombinations=[{id:'U',type:'strength',name:'U',factors:{D:1.4}}];m.analysisCases=[{id:'E',name:'E',kind:'static',status:'not-run',settings:{comboId:'U',pDeltaMethod:'off'}}];
 const ground={type:'ground-record',id:'G',name:'synthetic',version:1,sourceNote:'test',sourceReference:'fixture',basisStatus:'specified',allowableBearing:150,bearingBasis:'gross'};
 const columnBars={type:'reinforcement-record',id:'R',name:'continuous column bars',version:1,sourceNote:'synthetic',memberId:'AB',start:0,end:1,cover:.04,barMaterialId:'steel@1',reinforcementForm:'single-deformed',barCoating:'uncoated',lapRequired:false,bars:[-1,1].flatMap(y=>[-1,1].map(z=>({y:y*.2,z:z*.08,diameter:20})))};
 const footing={columnTransferType:'cast-in-place-continuous-straight-bars',columnMemberId:'AB',columnEmbedmentLength:.3,columnDevelopmentAbove:.3,barShape:'straight',shrinkageRestraint:'ordinary-not-severely-restrained',type:'foundation-record',id:'F',name:'synthetic',version:1,sourceNote:'test',nodeId:'A',foundationType:'isolated',B:2,L:2,thickness:.5,cover:.05,materialId:'concrete@1',groundId:'G@1',barMaterialId:'steel@1',bottomDiameterB:16,bottomDiameterL:16,bottomSpacingB:150,bottomSpacingL:150,topDiameterB:16,topDiameterL:16,topSpacingB:150,topSpacingL:150,footingWeightCaseId:'D',reactionBasis:'superstructure-only',columnWidth:.6,columnDepth:.3,flexureStandard:'KDS-142020-2022',concreteWeight:'normal',barCoating:'uncoated',punchingStandard:'KDS-142022-2022',punchingMomentMethod:'conservative-perimeter-shear',punchingPerimeterScope:'interior-solid-no-openings'};

 footing.aggregateMaxSize=.02;
 if(explicitPath)Object.assign(columnBars,{fabricationShape:'straight',endSetbackStart:.04,endSetbackEnd:.04,startExtension:.34,endExtension:.04});
 async function apply(commands,id){const p=await ctx.call('preview_design_changes',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,requestId:id+'-preview',commands});assert.equal((await ctx.call('apply_design_changes',{handle:p.handle,requestId:id})).ok,true);}
 async function evaluate(id){const run=await ctx.bridge.runElasticWorkflow({plan:ctx.bridge.planElasticWorkflow({caseIds:['E']}),requestId:id});assert.equal(run.ok,true);return ctx.call('evaluate_practical_design',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,sources:[{analysisRunId:run.steps[0].analysisRunId,comboId:'U'}]});}
 await apply([ground,columnBars,footing],'inputs');const first=await evaluate('before');
 const before=ctx.bridge.getPracticalDesignSnapshot(first.evaluationId);
 const independent=['foundation-depth','foundation-spacing','foundation-distribution','foundation-anchorage'];
 const stored=m.designDetails.foundations.find(f=>f.id==='F');
 const withoutReaction=evaluateProvidedFooting(m,stored,{combo:{id:'U'},reactions:{}});
 assert.equal(withoutReaction['foundation-anchorage'].status,'OK');
 const thin=evaluateProvidedFooting(m,{...stored,thickness:.1},{combo:{id:'U'},reactions:{}});assert.equal(thin['foundation-depth'].status,'NG');assert.equal(thin['foundation-bearing'].reason,'CONCURRENT_REACTION_REQUIRED');
 const unqualified=evaluateProvidedFooting(m,{...stored,barShape:undefined},{combo:{id:'U'},reactions:{}});assert.equal(unqualified['foundation-anchorage'].status,'NOT_CHECKED');assert.equal(unqualified['foundation-anchorage'].reason,'STRAIGHT_NORMAL_UNCOATED_FOOTING_BAR_SCOPE_REQUIRED');
 await apply([{type:'splice-record',id:'SP',name:'SP',version:1,sourceNote:'synthetic',memberId:'AB',reinforcementId:'R@1',barIndices:['1','2','3','4'],start:.3,end:.6,offsetY:.02,offsetZ:0,spliceType:'tension-B',spliceSystem:'ordinary-no-seismic-detail',continuationSide:'offset-toward-end'}],'splice');
 const proofModel=structuredClone(m);Object.assign(proofModel.designDetails.reinforcement[0],{fabricationShape:'straight',endSetbackStart:.04,endSetbackEnd:.04,startExtension:.34,endExtension:.04});
 const proof=columnTransferSpliceProof(proofModel,stored);assert.equal(proof.status,'OK',JSON.stringify(proof));assert.equal(proof.rows.length,4);assert.equal(proof.rows[0].interval.from,-.3);assert.equal(proof.rows[0].interval.to,.3);
 const short=structuredClone(proofModel);short.designDetails.reinforcement[0].startExtension=.1;assert.equal(columnTransferSpliceProof(short,stored).status,'NOT_CHECKED');
 const shifted=structuredClone(proofModel);shifted.designDetails.splices[0].continuationSide='offset-toward-start';assert.equal(columnTransferSpliceProof(shifted,stored).status,'NOT_CHECKED');
 const second=await evaluate('after'),after=ctx.bridge.getPracticalDesignSnapshot(second.evaluationId);
 for(const id of independent){const a=before.checks.find(c=>c.checkId===id),b=after.checks.find(c=>c.checkId===id);assert.equal(b.status,a.status,id);assert.equal(b.ratio,a.ratio,id);assert.equal(b.referenceLayoutResult,undefined,id);assert.ok(b.codeReferences?.length,id);}
 const transfer=after.checks.find(c=>c.checkId==='foundation-column-transfer');if(explicitPath){assert.equal(transfer.status,'OK',JSON.stringify(transfer));assert.equal(transfer.spliceLayoutProof.status,'OK');assert.equal(transfer.spliceLayoutProof.rows.length,4);assert.equal(transfer.spliceLayoutProof.strengthTransferQualified,false);}else {assert.equal(transfer.incomplete,true);assert.ok(transfer.incompleteReasons.includes('SPLICE_PIECE_STATION_LAYOUT_REVIEW_REQUIRED'));}assert.equal(second.summary.complete,false);
 const artifact=await ctx.call('export_design_drawings',{evaluationId:second.evaluationId,format:'json'});const parts=[];let next=0;
 do{const part=await ctx.call('get_design_drawing_artifact',{artifactId:artifact.artifactId,offset:next});parts.push(Buffer.from(part.content,'base64'));next=part.nextOffset;}while(next!==null);
 const report=JSON.parse(Buffer.concat(parts).toString());if(explicitPath)assert.equal(report.checks.find(c=>c.checkId==='foundation-column-transfer').spliceLayoutProof.status,'OK');for(const id of independent)assert.equal(report.checks.find(c=>c.checkId===id).status,after.checks.find(c=>c.checkId===id).status);
 console.log('PASS independent footing checks survive column splice paths and missing reactions; transfer remains pending through WebMCP/JSON');
}finally{await ctx.dispose();}
