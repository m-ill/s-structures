import assert from 'node:assert/strict';
import {estimateCandidateEvaluationWorkingSet} from '../src/compute/product/candidateEvaluationWorkingSet.js';
import {createResourceBudget,retainedBytes} from '../src/core/resourceBudget.js';
const model={nodes:[]},sets=[{set:{memberResults:{A:{xs:Array(100).fill(0)}}}}],proof=[{secondOrderTrace:Array(3).fill({residual:0})}];
const one=estimateCandidateEvaluationWorkingSet({model,sets,analysisProof:proof});const two=estimateCandidateEvaluationWorkingSet({model,sets:[...sets,structuredClone(sets[0])],analysisProof:proof});assert.ok(two.estimatedBytes>one.estimatedBytes);assert.equal(one.components.setCopies,retainedBytes(sets)*3);assert.equal(one.measuredHeap,false);
const result={checks:Array(100).fill({status:'NG',data:'a'.repeat(100)}),preparedDetails:{}};const after=estimateCandidateEvaluationWorkingSet({model,sets,analysisProof:proof,result});assert.equal(after.estimatedBytes-one.estimatedBytes,retainedBytes(result)*2);
const budget=createResourceBudget({maxBytes:one.estimatedBytes-1});assert.throws(()=>budget.reserve('candidate',one.estimatedBytes),{code:'MANAGED_MEMORY_BUDGET_EXCEEDED'});assert.equal(budget.snapshot().totalBytes,0);
console.log('PASS candidate evaluation accounts for fresh multi-combination sets, proof and returned prepared records');

const {estimateCandidateProposalWorkingSet}=await import('../src/compute/product/candidateProposalWorkingSet.js');
const proposal=estimateCandidateProposalWorkingSet({model,checks:result.checks,input:{foundationId:'F'}});
assert.equal(proposal.measuredHeap,false);
assert.equal(proposal.components.modelCopies,retainedBytes(model)*3);
assert.ok(estimateCandidateProposalWorkingSet({model:{nodes:Array.from({length:100},(_,id)=>({id,x:id}))},checks:result.checks,input:{}}).estimatedBytes>proposal.estimatedBytes);
console.log('PASS proposal admission covers transient model/index and check-derived data');
