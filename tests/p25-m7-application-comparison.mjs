import assert from 'node:assert/strict';
import {applicationComparisonSummary} from '../src/compute/product/applicationComparisonSummary.js';
import {retainedBytes} from '../src/core/resourceBudget.js';
import {stableHash} from '../src/core/stableHash.js';
const full={afterEvaluationId:'E',counts:{matched:80,newNg:4},beforeCheckCount:80,afterCheckCount:80,
 completionBlockers:{total:80,counts:{input:80},rows:Array.from({length:80},(_,i)=>({entityId:`member${i}`,reason:'근거'.repeat(256)})),inputActions:{rows:[],truncated:false}},
 repairOutcome:{changedDetailCount:16,changedDetails:Array.from({length:16},(_,i)=>({type:'reinforcement-record',id:`${i}`+'x'.repeat(128),version:2})),pendingCheckCount:80,pendingChecks:[]},
 proposalProvenance:{basisCheckCount:8,basisCheckIds:Array.from({length:8},(_,i)=>String(i).repeat(64)),codeReferences:[]},designTransferAllowed:false};
const before=structuredClone(full),summary=applicationComparisonSummary(full);
assert.ok(retainedBytes(summary)<10200);
assert.equal(summary.detailsTruncated,true);assert.equal(summary.completionBlockers.truncated,true);
assert.equal(summary.completionBlockers.total,80);assert.deepEqual(summary.counts,full.counts);
assert.equal(summary.repairOutcome.changedDetailCount,16);
assert.deepEqual(full,before);assert.equal(summary.detailHash,stableHash(full));
assert.equal(summary.comparisonDetailQuery.checkId,stableHash(full));
assert.equal(summary.designTransferAllowed,false);
console.log('PASS large Korean reasons and long changed IDs remain hash-bound, bounded and explicitly truncated without changing counts or originals');

const withGeometry={...full,connectedGeometryChanges:{recordCount:100,fieldCount:2000,truncated:false,records:Array.from({length:100},(_,i)=>({id:`F${i}`,type:'foundation-record',beforeVersion:1,afterVersion:2,fields:Array.from({length:20},()=>({key:'columnWidth',before:.3,after:.35,unit:'m'}))}))}};
const geometrySummary=applicationComparisonSummary(withGeometry);
assert.ok(retainedBytes(geometrySummary)<=10000);assert.equal(geometrySummary.connectedGeometryChanges.truncated,true);assert.equal(geometrySummary.connectedGeometryChanges.fieldCount,2000);assert.equal(geometrySummary.detailHash,stableHash(withGeometry));assert.equal(withGeometry.connectedGeometryChanges.records.length,100);
console.log('PASS geometry comparison retains full totals/hash with explicitly bounded receipt');
