import assert from 'node:assert/strict';
import {candidateCompletionBlockers} from '../src/compute/product/candidateCompletionBlockers.js';
const checks=[{entityId:'M',comboId:'U',checkId:'rc-cover',status:'NOT_CHECKED',blockerKind:'input-required',requiredInputFields:['coverStandard'],reason:'DESIGN_STANDARD_SELECTION_REQUIRED'},{entityId:'M',comboId:'U',checkId:'rc-confinement',status:'NG',ratio:2,incomplete:true,methodReviewRequired:true,reason:'HOOP_COLLISION'},{entityId:'F',comboId:'S',checkId:'foundation-bearing',status:'NOT_CHECKED',reason:'UNKNOWN'},{entityId:'M',comboId:'S',checkId:'rc-deflection',status:'OK',ratio:.2,incomplete:true,qualification:'frame-method-qualification-pending'}];
const result=candidateCompletionBlockers(checks,['M']);
assert.equal(result.total,4);assert.equal(result.counts.input,1);assert.equal(result.counts.designNg,1);assert.equal(result.counts.method,2);assert.equal(result.counts.review,1);
assert.deepEqual(result.rows[0].requiredInputFields,['coverStandard']);assert.equal(result.rows[2].withinAffectedScope,false);assert.equal(result.rows[3].withinAffectedScope,true);
assert.equal(candidateCompletionBlockers([{status:'N_A',checkId:'rc-deflection'}],[]).total,0);
assert.equal(candidateCompletionBlockers(Array.from({length:100},(_,i)=>({...checks[0],entityId:String(i)})),[]).rows.length,80);
assert.equal(result.automaticInputSelectionAllowed,false);
console.log('PASS candidate completion blockers distinguish input, NG, method and unresolved review');

const record={entityId:'foundation:A',checkId:'foundation-flexure',status:'NOT_CHECKED',blockerKind:'input-required',requiredInputRecords:[{type:'foundation-record',nodeId:'A'}],inputTargets:[{type:'reinforcement-record',id:'R',version:1,memberId:'M'}]};
const diagnostic=candidateCompletionBlockers([record],['foundation:A']);assert.equal(diagnostic.counts.input,1);assert.deepEqual(diagnostic.rows[0].requiredInputRecords,record.requiredInputRecords);assert.deepEqual(diagnostic.rows[0].inputTargets,record.inputTargets);diagnostic.rows[0].requiredInputRecords[0].nodeId='changed';assert.equal(record.requiredInputRecords[0].nodeId,'A');

const missingFoundation={entityId:'foundation:A',checkId:'foundation-bearing',status:'NOT_CHECKED',blockerKind:'input-required',requiredInputRecords:[{type:'foundation-record',nodeId:'A'}]};
const repeated=Array.from({length:100},(_,i)=>({...missingFoundation,comboId:'S'+i}));
const later={...missingFoundation,entityId:'foundation:B',requiredInputRecords:[{type:'foundation-record',nodeId:'B'}]};
const grouped=candidateCompletionBlockers([...repeated,later],[]);
assert.equal(grouped.rows.length,80);assert.equal(grouped.inputActions.rows.length,2);
assert.equal(grouped.inputActions.rows[0].affectedCheckCount,100);assert.deepEqual(grouped.inputActions.rows[1].target,{type:'foundation-record',nodeId:'B'});
assert.equal(grouped.inputActions.rows[0].action,'create');assert.equal(grouped.inputActions.rows[0].evidenceTruncated,true);assert.equal(grouped.inputActions.automaticValuesSelected,false);
const update={...checks[0],inputTargets:[{type:'reinforcement-record',id:'R',version:2,memberId:'M'}]};
const combined=candidateCompletionBlockers([update,{...update,requiredInputFields:['aggregateMaxSize']}],['M']).inputActions.rows[0];
assert.equal(combined.action,'update');assert.deepEqual(combined.requiredInputFields,['coverStandard','aggregateMaxSize']);assert.equal(combined.affectedCheckCount,2);
assert.equal(candidateCompletionBlockers([checks[0]],[]).inputActions.unmappedCheckCount,1);
const capped=candidateCompletionBlockers(Array.from({length:82},(_,i)=>({...missingFoundation,requiredInputRecords:[{type:'foundation-record',nodeId:String(i)}]})),[]).inputActions;
assert.equal(capped.rows.length,80);assert.equal(capped.omittedTargetOccurrences,2);assert.equal(capped.truncated,true);
console.log('PASS deduplicated bounded input actions cover checks beyond the detailed-row cap without inventing values');

const concreteInput=candidateCompletionBlockers([{...checks[0],requiredInputFields:['fck','notARegisteredField'],inputTargets:[{type:'material-record',id:'CONC',version:2}]}],[]).inputActions.rows[0];
assert.deepEqual(concreteInput.requiredInputFields,['fck']);
console.log('PASS input actions use all material-kind schema fields and exclude unregistered fields');

const failed=candidateCompletionBlockers([{entityId:'M',checkId:'rc-strength',status:'FAILED',reason:'SECTION_SOLVER_DID_NOT_CONVERGE',incomplete:true}],['M']);
assert.equal(failed.counts.failure,1);assert.equal(failed.counts.designNg,0);assert.equal(failed.counts.review,0);assert.deepEqual(failed.rows[0].kinds,['failure']);
console.log('PASS computational failure is distinct from calculated design NG and review');

const recordOnly=candidateCompletionBlockers([{entityId:'foundation:A',checkId:'foundation-bearing',status:'NOT_CHECKED',requiredInputRecords:[{type:'foundation-record',nodeId:'A'}]}],[]);
assert.equal(recordOnly.counts.input,1);assert.equal(recordOnly.inputActions.rows[0].action,'create');assert.equal(recordOnly.counts.review,0);
console.log('PASS explicit required record is actionable without a redundant blockerKind flag');

const targeted=candidateCompletionBlockers([{entityId:'M',checkId:'material-test-evidence',status:'NOT_CHECKED',blockerKind:'input-required',requiredInputFields:['barBatch','stirrupBatch','testReportProduct'],inputTargets:[{type:'reinforcement-record',id:'R',version:1,requiredInputFields:['barBatch']},{type:'reinforcement-record',id:'R',version:1,requiredInputFields:['stirrupBatch','bogus']},{type:'material-record',id:'S',version:1,requiredInputFields:['testReportProduct']},{type:'reinforcement-record',id:'R2',version:1,requiredInputFields:['barProduct']}]}],['M']).inputActions;
assert.equal(targeted.rows.length,3);assert.deepEqual(targeted.rows[2].requiredInputFields,['barProduct']);assert.deepEqual(targeted.rows[0].requiredInputFields,['barBatch','stirrupBatch']);assert.equal(targeted.rows[0].affectedCheckCount,1);assert.equal(targeted.rows[0].evidence.length,1);assert.deepEqual(targeted.rows[1].requiredInputFields,['testReportProduct']);
console.log('PASS per-target fields merge repeated roles without cross-target contamination or double-counting');
