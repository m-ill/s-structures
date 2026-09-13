import assert from 'node:assert/strict';
import {missingRcRuleResult} from '../src/metadata/rcRuleInputDiagnostics.js';
const missing=missingRcRuleResult('rc-cover',[{id:'R',version:1}]);
assert.equal(missing.reason,'DESIGN_STANDARD_SELECTION_REQUIRED');assert.equal(missing.blockerKind,'input-required');
assert.deepEqual(missing.requiredInputFields,['coverStandard']);assert.equal(missing.supportedStandard,'KDS-142050-2022');
assert.equal(missing.status,'NOT_CHECKED');assert.equal(missing.designTransferAllowed,false);
const unsupported=missingRcRuleResult('rc-cover',[{id:'R',version:1,coverStandard:'KDS-142050-2022'}]);
assert.equal(unsupported.reason,'DESIGN_RULE_SCOPE_REVIEW_REQUIRED');assert.equal(unsupported.blockerKind,'scope-review-required');
assert.equal(missingRcRuleResult('unknown',[{id:'R'}]).reason,'RULE_UNAVAILABLE');
assert.equal(missingRcRuleResult('rc-cover',[]).reason,'MISSING_REINFORCEMENT');
console.log('PASS rule selection input distinguished from unsupported calculation scope without changing qualification');

const {practicalCheck}=await import('../src/design/evaluation/practicalEvaluation.js');
const foundation=practicalCheck('foundation:A','U','foundation-flexure',{status:'NOT_CHECKED',reason:'MISSING_FOUNDATION_GEOMETRY'});
assert.equal(foundation.blockerKind,'input-required');
assert.deepEqual(foundation.requiredInputRecords,[{type:'foundation-record',nodeId:'A'}]);
const joint=practicalCheck('joint:B','U','joint-shear',{status:'NOT_CHECKED',reason:'MISSING_CONNECTION_DETAILS'});
assert.deepEqual(joint.requiredInputRecords,[{type:'connection-record',nodeId:'B'}]);
const member=practicalCheck('M','U','rc-section-strength',{status:'NOT_CHECKED',reason:'MISSING_REINFORCEMENT'});
assert.deepEqual(member.requiredInputRecords,[{type:'reinforcement-record',memberId:'M'}]);
assert.equal(practicalCheck('foundation:A','U','foundation-flexure',{status:'NOT_CHECKED',reason:'AMBIGUOUS_FOUNDATION_DETAILS'}).blockerKind,undefined);
const {evaluateProvidedAnchorage}=await import('../src/design/rc/providedAnchorage.js');
const {designContext}=await import('./fixtures/p24/context.js');
const ctx=designContext();
try {
 const member={id:'M',secId:'rc3060',matId:'concrete',n1:'A',n2:'B'},detail={id:'R',version:1};
 const result=evaluateProvidedAnchorage(ctx.model,member,[detail]);
 assert.equal(result.reason,'ANCHORAGE_SCOPE_REQUIRED');assert.equal(result.blockerKind,'input-required');
 assert.deepEqual(result.requiredInputFields,['anchorageStandard','reinforcementForm','anchorageMode']);
 assert.deepEqual(result.inputTargets,[{type:'reinforcement-record',id:'R',version:1,memberId:member.id}]);
 const unsupported=evaluateProvidedAnchorage(ctx.model,member,[{...detail,anchorageStandard:'unsupported',reinforcementForm:'single-deformed',anchorageMode:'straight-tension'}]);
 assert.equal(unsupported.blockerKind,'scope-review-required');assert.deepEqual(unsupported.requiredInputFields,[]);
}finally{await ctx.dispose();}
console.log('PASS missing detail records and anchorage selectors expose targeted input needs without resolving ambiguity or unsupported standards');

assert.equal(practicalCheck('foundation:A','U','foundation-flexure',{reason:'MISSING_FOUNDATION_GEOMETRY'}).blockerKind,'input-required');
