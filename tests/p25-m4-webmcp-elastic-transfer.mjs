import assert from 'node:assert/strict';
import {designContext} from './fixtures/p24/context.js';
import {validateStoredDesignDetails} from '../src/modeling/designDetailValidation.js';
const ctx=designContext(),m=ctx.model;
m.nodes=[{id:'A',x:0,y:0,z:0,support:'fixed'},{id:'B',x:4,y:0,z:0}];m.members=[{id:'AB',type:'frame',n1:'A',n2:'B',matId:'concrete',secId:'rc3060'}];
const reinforcement={type:'reinforcement-record',id:'R',name:'test',version:1,memberId:'AB',start:0,end:1,cover:.04,barMaterialId:'steel@1',sourceNote:'synthetic',bars:[{y:-.2,z:-.08,diameter:20},{y:-.2,z:.08,diameter:20}],lapRequired:true};
const splice={type:'splice-record',id:'SP',name:'lap',version:1,sourceNote:'synthetic',memberId:'AB',reinforcementId:'R@1',barIndices:['1'],start:.25,end:.65,offsetY:.02,offsetZ:0,spliceType:'tension-B',spliceSystem:'ordinary-no-seismic-detail',continuationSide:'offset-toward-end',transferStiffness:80000,transferElasticSlipLimit:.001,transferReference:'synthetic linear interface only'};
try{
 const preview=await ctx.call('preview_design_changes',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,requestId:'transfer-preview',commands:[reinforcement,splice]});
 assert.ok(preview.handle,JSON.stringify(preview));assert.equal((await ctx.call('apply_design_changes',{handle:preview.handle,requestId:'transfer-apply'})).ok,true);
 assert.deepEqual(validateStoredDesignDetails(m),[]);
 const args={inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,spliceId:'SP',barIndex:1,force:10};
 const r=await ctx.call('evaluate_splice_elastic_transfer',args);assert.equal(r.status,'CALCULATED',JSON.stringify(r));assert.equal(r.sectionCoupling.condensedStiffness.length,6);assert.ok(Math.abs(r.sectionCoupling.sectionEndForces[3]-10)<1e-8);assert.ok(Math.abs(r.sectionCoupling.sectionEndForces[4]-.8)<1e-8);assert.ok(Math.abs(r.sectionCoupling.sectionEndForces[5]+1.9)<1e-8);assert.equal(r.sectionCoupling.concreteIncluded,false);assert.equal(r.sectionCoupling.globalAssemblyIncluded,false);assert.equal(r.boundaryElement.stiffness.length,4);[-10,0,0,10].forEach((v,i)=>assert.ok(Math.abs(r.boundaryElement.endForces[i]-v)<1e-8));assert.equal(r.boundaryElement.globalAssemblyIncluded,false);assert.equal(r.spliceVersion,1);assert.equal(r.transferReference,splice.transferReference);assert.equal(r.elasticRangeSatisfied,true);
 assert.equal(r.rcHostCoupling.status,'CALCULATED',JSON.stringify(r.rcHostCoupling));assert.equal(r.rcHostCoupling.originalSteelReplaced,true);assert.equal(r.rcHostCoupling.physicalSteelPieceCount,3);assert.equal(r.rcHostCoupling.globalAssemblyIncluded,false);assert.ok(r.rcHostCoupling.endForces[6]>10);assert.equal(r.rcHostCoupling.components.concreteGross.energy,0);
 assert.equal(r.frameCoupling.stiffness.length,12);assert.equal(r.frameCoupling.refinementConverged,true);assert.ok(Math.abs(r.frameCoupling.endForces[6]-10)<.01);assert.equal(r.frameCoupling.globalAssemblyIncluded,false);assert.ok(r.frameCoupling.internalDofCount<=128);
 assert.ok(Math.abs(r.stations[8].force1-5)<1e-10);assert.equal(r.additionalStrengthCredit,false);assert.equal(r.globalRedistributionIncluded,false);assert.ok(r.codeReferences.length>0);assert.ok(r.codeReferences.every(x=>x.governsCalculation===false));
 const high=await ctx.call('evaluate_splice_elastic_transfer',{...args,force:1000});assert.equal(high.status,'NOT_CHECKED');assert.equal(high.reason,'SPLICE_TRANSFER_ELASTIC_RANGE_EXCEEDED');assert.equal(high.rcHostCoupling.status,'NOT_CHECKED');assert.equal(high.rcHostCoupling.reason,'RC_LAP_HOST_ELASTIC_RANGE_EXCEEDED');
 await assert.rejects(ctx.call('evaluate_splice_elastic_transfer',{...args,barIndex:2}),{code:'SPLICE_TRANSFER_BAR_NOT_SELECTED'});
 await assert.rejects(ctx.call('evaluate_splice_elastic_transfer',{...args,inputHash:'0'.repeat(64)}),{code:'STALE_INPUT'});
 const next={...splice,version:2};delete next.transferReference;
 await assert.rejects(ctx.call('preview_design_changes',{inputHash:args.inputHash,requestId:'missing-ref',commands:[next]}),{code:'SPLICE_TRANSFER_INPUT_REQUIRED'});
 assert.equal(m.designDetails.splices.length,1);
 console.log('PASS actual WebMCP atomic transfer input, canonical restore validation, mechanics, explicit force provenance and range/stale rejection');
}finally{await ctx.dispose();}
