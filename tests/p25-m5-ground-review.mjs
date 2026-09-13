import assert from 'node:assert/strict';
import {groundReviewScope as rawScope,evaluateGroundReview as rawReview} from '../src/design/foundation/groundReview.js';
const context={loadLedger:{ok:true,totalN:110,components:[{factor:1,factoredPressure:2.5}]},contact:{ok:true,qmax:27.5,qmin:27.5}};
const groundReviewScope=(f,g,s,ctx=context)=>rawScope(f,g,s,ctx),evaluateGroundReview=(f,g,s,ctx=context)=>rawReview(f,g,s,ctx);
const f={id:'F',version:1,nodeId:'A',B:2,L:2},g={id:'G',version:1,allowableBearing:200},s={combo:{id:'S'},reactions:{A:{rz:100}}};
const missing=evaluateGroundReview(f,g,s);assert.equal(missing.status,'NOT_CHECKED');
const reviewed={...g,reviewer:'fixture reviewer',reviewDocument:'fixture report',reviewEdition:'1',reviewDate:'2026-09-11',reviewEvidenceSha256:'a'.repeat(64),reviewScopeHash:missing.scopeHash,reviewMethod:'external settlement and bearing analysis',reviewConditions:'synthetic only',reviewKdsReferences:'external report clause references',reviewConclusion:'accepted'};
assert.equal(groundReviewScope(f,reviewed,s),missing.scopeHash);
assert.equal(evaluateGroundReview(f,reviewed,s).status,'OK');
assert.equal(evaluateGroundReview(f,{...reviewed,reviewConclusion:'rejected'},s).status,'NG');
assert.equal(evaluateGroundReview({...f,B:3},reviewed,s).reason,'GROUND_REVIEW_SCOPE_CHANGED');
assert.equal(evaluateGroundReview(f,reviewed,{...s,reactions:{A:{rz:101}}}).reason,'GROUND_REVIEW_SCOPE_CHANGED');
assert.equal(evaluateGroundReview(f,{...reviewed,reviewEvidenceSha256:'fake'},s).status,'NOT_CHECKED');
assert.equal(evaluateGroundReview(f,reviewed,s).calculatedByApplication,false);
console.log('PASS explicit external ground review, immutable scope, evidence and changed demand rejection');

const second={combo:{id:'S2'},reactions:{A:{rz:120}}},secondHash=groundReviewScope(f,g,second);
const multiple={...reviewed,reviewScopeHashes:[missing.scopeHash,secondHash]};delete multiple.reviewScopeHash;
assert.equal(evaluateGroundReview(f,multiple,s).status,'OK');assert.equal(evaluateGroundReview(f,multiple,second).status,'OK');
assert.equal(evaluateGroundReview(f,multiple,{...second,reactions:{A:{rz:121}}}).reason,'GROUND_REVIEW_SCOPE_CHANGED');
assert.equal(evaluateGroundReview(f,multiple,{combo:{id:'S3'},reactions:second.reactions}).reason,'GROUND_REVIEW_SCOPE_CHANGED');
assert.equal(evaluateGroundReview(f,{...multiple,reviewScopeHash:missing.scopeHash},s).reason,'GROUND_REVIEW_SCOPE_FORMAT_INVALID');
for(const hashes of [[],[missing.scopeHash,missing.scopeHash],['*'],Array.from({length:51},(_,i)=>i.toString(16).padStart(64,'0'))])assert.equal(evaluateGroundReview(f,{...multiple,reviewScopeHashes:hashes},s).status,'NOT_CHECKED');
const report=evaluateGroundReview(f,multiple,second);assert.deepEqual(report.evidence.reviewScopeHashes,multiple.reviewScopeHashes);assert.equal(report.matchedScopeHash,secondHash);assert.equal(report.calculatedByApplication,false);
console.log('PASS one external document explicitly bound to multiple combinations; changed, absent and malformed scopes rejected');
assert.notEqual(groundReviewScope(f,g,s),groundReviewScope(f,g,s,{...context,loadLedger:{...context.loadLedger,totalN:120}}));
assert.notEqual(groundReviewScope(f,g,s),groundReviewScope(f,g,s,{...context,contact:{ok:true,qmax:40,qmin:15}}));
assert.equal(rawReview(f,reviewed,s).reason,'GROUND_REVIEW_CALCULATION_CONTEXT_REQUIRED');
const {stableHash}=await import('../src/core/stableHash.js');
const oldScope=stableHash({version:'p25-ground-review-scope-v1',footing:{id:'F',nodeId:'A',B:2,L:2},ground:{id:'G',allowableBearing:200},comboId:'S',reaction:{rz:100}});
assert.equal(evaluateGroundReview(f,{...reviewed,reviewScopeHash:oldScope},s).reason,'GROUND_REVIEW_SCOPE_CHANGED');
assert.equal(evaluateGroundReview(f,reviewed,s,{loadLedger:{ok:false},contact:context.contact}).reason,'GROUND_REVIEW_CALCULATION_CONTEXT_REQUIRED');



const {designContext}=await import('./fixtures/p24/context.js');
const {practicalCommandFromRecord,validatePracticalCommand}=await import('../src/modeling/practicalInputContract.js');
const ctx=designContext(),model=ctx.model;
try{
 model.nodes=[{id:'A',x:0,y:0,z:0,support:'fixed'},{id:'B',x:0,y:0,z:3}];model.members=[{id:'AB',type:'frame',n1:'A',n2:'B',matId:'concrete',secId:'rc3060'}];
 model.loadCases=[{id:'D',name:'D',type:'dead'}];model.loads=[{id:'F',type:'nodal',node:'B',P:10,dir:'-z',case:'D'}];
 model.loadCombinations=[{id:'S1',name:'S1',type:'service',factors:{D:1}},{id:'S2',name:'S2',type:'service',factors:{D:1.2}}];
 model.analysisCases=model.loadCombinations.map(c=>({id:'E-'+c.id,name:c.id,kind:'static',status:'not-run',settings:{comboId:c.id,pDeltaMethod:'off'}}));
 const ground={type:'ground-record',id:'G',name:'synthetic ground',version:1,sourceNote:'synthetic only',sourceReference:'fixture',basisStatus:'specified',allowableBearing:200,bearingBasis:'gross'};
 const footing={type:'foundation-record',id:'F',name:'synthetic footing',version:1,sourceNote:'synthetic only',nodeId:'A',foundationType:'isolated',B:2,L:2,thickness:.5,cover:.05,materialId:'concrete@1',groundId:'G@1',footingWeightCaseId:'D',reactionBasis:'superstructure-only',columnWidth:.6,columnDepth:.3};
 const apply=async(commands,key)=>{const preview=await ctx.call('preview_design_changes',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,requestId:key+'-preview',commands});assert.equal((await ctx.call('apply_design_changes',{handle:preview.handle,requestId:key+'-apply'})).ok,true);};
 const evaluate=async key=>{const run=await ctx.bridge.runElasticWorkflow({plan:ctx.bridge.planElasticWorkflow({caseIds:model.analysisCases.map(c=>c.id)}),requestId:key});assert.equal(run.ok,true);return ctx.call('evaluate_practical_design',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,sources:run.steps.map(step=>({analysisRunId:step.analysisRunId,comboId:model.analysisCases.find(c=>c.id===step.caseId).settings.comboId}))});};
 await apply([ground,footing],'ground-input');const baseline=await evaluate('ground-before');
 const before=ctx.bridge.getPracticalDesignSnapshot(baseline.evaluationId).checks.filter(c=>c.checkId==='foundation-ground-review');assert.equal(before.length,2);assert.ok(before.every(c=>c.status==='NOT_CHECKED'));
 const external={...ground,version:2,...Object.fromEntries(Object.entries(multiple).filter(([key])=>key.startsWith('review'))),reviewScopeHashes:before.map(c=>c.scopeHash)};
 assert.notEqual(external.reviewScopeHashes[0],external.reviewScopeHashes[1]);
 assert.ok((await ctx.call('get_design_input_schema',{type:'ground-record'})).schema.properties.reviewScopeHashes);
 validatePracticalCommand(external);assert.throws(()=>validatePracticalCommand({...external,reviewScopeHash:external.reviewScopeHashes[0]}));
 await apply([external,{...footing,version:2,groundId:'G@2'}],'ground-review');const after=await evaluate('ground-after');
 const rows=ctx.bridge.getPracticalDesignSnapshot(after.evaluationId).checks.filter(c=>c.checkId==='foundation-ground-review');assert.equal(rows.length,2);assert.ok(rows.every(c=>c.status==='OK'&&c.calculatedByApplication===false&&c.evidenceAuthentication==='user-supplied'));
 assert.deepEqual(rows.map(c=>c.matchedScopeHash).sort(),external.reviewScopeHashes.toSorted());assert.equal(after.summary.complete,false);
 const stored=(await ctx.call('get_design_records',{channel:'ground',id:'G'})).rows.at(-1);assert.deepEqual(practicalCommandFromRecord('ground-record',stored).reviewScopeHashes,external.reviewScopeHashes);

 const {evaluateProvidedFooting}=await import('../src/design/foundation/providedFooting.js');
 const finalSnapshot=ctx.bridge.getPracticalDesignSnapshot(after.evaluationId),set=finalSnapshot.sets.find(x=>x.set.combo.id==='S1').set;
 const finalFooting=(await ctx.call('get_design_records',{channel:'foundations',id:'F'})).rows.at(-1),changed=structuredClone(model);
 changed.loadCombinations.find(c=>c.id==='S1').factors.D=1.1;
 const altered=evaluateProvidedFooting(changed,finalFooting,set);
 assert.equal(altered['foundation-ground-review'].reason,'GROUND_REVIEW_SCOPE_CHANGED','same reaction and combo ID cannot reuse review after footing load factor changes');
 console.log('PASS actual two-combination WebMCP external review scopes, ground/footing version rebinding and unchanged incomplete design');
}finally{await ctx.dispose();}
