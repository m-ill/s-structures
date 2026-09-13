import assert from 'node:assert/strict';
import {designContext} from './fixtures/p24/context.js';
import {resolveMaterialRecord} from '../src/materials/registry.js';
import {concreteEffectiveModulus} from '../src/materials/concreteCreep.js';
const ctx=designContext();
const command={type:'material-record',id:'time-concrete',name:'Time concrete',version:1,kind:'concrete',E:30000,nu:.2,density:2.4,fck:30,sourceReference:'synthetic concrete specification',edition:'test',sourceNote:'synthetic',basisStatus:'assumed',product:'concrete',grade:'30',creepCoefficient:2,creepLoadingAgeDays:7,creepEvaluationAgeDays:365,creepElasticModulusAtLoading:25000,creepReference:'synthetic measured creep data at stated ages'};
try{
 const schema=(await ctx.call('get_design_input_schema',{type:'material-record'})).schema;
 assert.ok(schema.properties.creepCoefficient);assert.ok(schema.properties.creepReference);
 assert.ok(schema.properties.shrinkageMicrostrain);assert.ok(schema.properties.shrinkageReference);
 const preview=await ctx.call('preview_design_changes',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,requestId:'creep-preview',commands:[command]});
 assert.equal(preview.ok,true,JSON.stringify(preview));await ctx.call('apply_design_changes',{handle:preview.handle,requestId:'creep-apply'});
 const record=resolveMaterialRecord(ctx.model,'time-concrete@1'),r=concreteEffectiveModulus(record);
 assert.equal(r.effectiveE,25000/3);assert.equal(record.elastic.E,30000);assert.equal(r.designTransferAllowed,false);
 assert.equal(r.loadingAgeDays,7);assert.equal(r.evaluationAgeDays,365);
 const zero=structuredClone(record);zero.creep.coefficient=0;assert.equal(concreteEffectiveModulus(zero).effectiveE,25000);
 const bad={...command,id:'bad-time'};delete bad.creepReference;
 await assert.rejects(ctx.call('preview_design_changes',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,requestId:'bad-creep',commands:[bad]}));
 const reversed=structuredClone(record);reversed.creep.evaluationAgeDays=1;assert.throws(()=>concreteEffectiveModulus(reversed),/CONCRETE_CREEP_INPUT_INVALID/);
 const shrink={...command,id:'shrink-c',shrinkageMicrostrain:300,shrinkageReference:'specified free shrinkage over the stated age interval'};
 const sh=await ctx.call('preview_design_changes',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,requestId:'shrink-input',commands:[shrink]});
 await ctx.call('apply_design_changes',{handle:sh.handle,requestId:'shrink-apply'});
 const effect=concreteEffectiveModulus(resolveMaterialRecord(ctx.model,'shrink-c@1'));assert.equal(effect.shrinkageInitialStrain,-.0003);assert.equal(effect.shrinkageIncluded,true);
 await assert.rejects(ctx.call('preview_design_changes',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,requestId:'shrink-missing',commands:[{...shrink,id:'shrink-bad',shrinkageReference:''}]}));
 console.log('PASS concrete creep source/age input through real WebMCP, effective modulus and incomplete/reversed input rejection');
}finally{await ctx.dispose();}
