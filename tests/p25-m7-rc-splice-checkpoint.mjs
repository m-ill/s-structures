import assert from 'node:assert/strict';
import {createRcSpliceExecution} from '../src/compute/product/rcSpliceExecution.js';
import {createResourceBudget} from '../src/core/resourceBudget.js';
import {stableHash} from '../src/core/stableHash.js';
import {RC_SPLICE_MODEL_VERSION as version,RC_SPATIAL_ABSOLUTE_TOLERANCES} from '../src/metadata/rcSplicePolicy.js';
const identity={inputHash:'current',buildBound:true};
const result={version,spatialAbsoluteTolerances:RC_SPATIAL_ABSOLUTE_TOLERANCES,ok:true,comboId:'S',combination:{id:'S'},segments:[],originalNodes:[],memberForceSources:{},stressIntegrationConvergenceVerified:true,spatialTolerance:.002,spatialTrace:[{change:null},{change:.001,stressChange:.001,slipChange:.001,displacementChange:.001}],frameTrace:[{change:null},{change:.001}],frameRefinement:{convergenceVerified:true,tolerance:.002},elasticRangeSatisfied:true,designTransferAllowed:false,globalMethodQualified:false};
const wrap=(r=result)=>{const resultHash=stableHash(r),sourceId=`rc-splice-${stableHash({inputHash:identity.inputHash,comboId:r.comboId,resultHash})}`;const body={version:'p25-rc-splice-state-v1',latestSourceId:sourceId,records:[[sourceId,{...r,inputIdentity:identity,inputHash:identity.inputHash,resultHash,sourceId}]]};return {...body,checksum:stableHash(body)};};
const create=()=>{const budget=createResourceBudget();return {budget,service:createRcSpliceExecution({bridge:{getWorkflowInputIdentity:()=>identity},budget})};};
const {service,budget}=create(),state=wrap();assert.equal(service.restoreState(state).count,1);assert.equal(service.readCombination(state.latestSourceId,'S').ok,true);
const exported=JSON.parse(JSON.stringify(service.exportState()));assert.equal(exported.checksum,state.checksum);assert.throws(()=>service.restoreState(state),{code:'RC_SPLICE_RESTORE_REQUIRES_EMPTY_RUNTIME'});service.dispose();assert.equal(budget.snapshot().totalBytes,0);
for(const bad of [wrap({...result,version:'old'}),wrap({...result,frameTrace:[{change:1}]}),wrap({...result,globalMethodQualified:true})])assert.throws(()=>create().service.restoreState(bad),{code:'RC_SPLICE_CHECKPOINT_INVALID'});
const corrupt=structuredClone(state);corrupt.records[0][1].segments.push({});assert.throws(()=>create().service.restoreState(corrupt),{code:'RC_SPLICE_CHECKPOINT_INVALID'});
const tinyBudget=createResourceBudget({maxBytes:100});const tiny=createRcSpliceExecution({bridge:{getWorkflowInputIdentity:()=>identity},budget:tinyBudget});assert.throws(()=>tiny.restoreState(state),{code:'MANAGED_MEMORY_BUDGET_EXCEEDED'});assert.equal(tinyBudget.snapshot().totalBytes,0);assert.equal(tiny.context().sources.length,0);
const unbound=structuredClone(state);unbound.records[0][1].inputIdentity.buildBound=false;const {checksum:oldChecksum,...unboundBody}=unbound;unbound.checksum=stableHash(unboundBody);const unboundService=create().service;unboundService.restoreState(unbound);assert.equal(unboundService.metadata(state.latestSourceId).stale,true);assert.throws(()=>unboundService.readCombination(state.latestSourceId,'S'),{code:'STALE_INPUT'});unboundService.dispose();
identity.inputHash='changed';const stale=create().service;stale.restoreState(exported);assert.equal(stale.metadata(state.latestSourceId).stale,true);assert.throws(()=>stale.readCombination(state.latestSourceId,'S'),{code:'STALE_INPUT'});stale.dispose();
console.log('PASS splice checkpoint integrity, qualification, convergence, stale input and release');

assert.throws(()=>create().service.restoreState(wrap({...result,pDeltaIncluded:true,pDeltaMethod:'direct',secondOrderTrace:[]})),{code:'RC_SPLICE_CHECKPOINT_INVALID'});

import {rcSpliceDesignSource} from '../src/compute/product/rcSpliceDesignSource.js';
const trace=[{iteration:0,axialChange:1,displacementChange:null,equilibriumResidual:0},{iteration:1,axialChange:0,displacementChange:0,equilibriumResidual:0}];
const firstOrderMomentComparison={version:'p25-direct-moment-comparison-v4-winkler',limit:1.4,absoluteTolerance:1e-9,relativeTolerance:1e-9,units:{moment:'kN.m',position:'m'},members:{AB:{status:'NOT_CHECKED',reason:'MOMENT_COMPARISON_SOURCE_REQUIRED',fullMemberQualified:false}},fullMemberQualified:false,designTransferAllowed:false};
const momentComparisonSummary={version:firstOrderMomentComparison.version,comparisonHash:stableHash(firstOrderMomentComparison),comparedMemberCount:1,continuousMemberCount:0,exceedingMemberCount:0,additionalAnalysisCount:0,fullMemberQualified:false};
const direct={...result,memberForceSources:{AB:{}},pDeltaIncluded:true,pDeltaMethod:'direct',secondOrderTrace:trace,firstOrderMomentComparison,momentComparisonSummary};
const goodDirect=create().service;assert.equal(goodDirect.restoreState(wrap(direct)).count,1);goodDirect.dispose();
for(const altered of [{pDeltaIncluded:false},{pDeltaMethod:'off'},{secondOrderTrace:trace.map((r,i)=>({...r,iteration:i+1}))},{secondOrderTrace:[trace[0],{...trace[1],axialChange:.01}]},{secondOrderTrace:[trace[0],{...trace[1],equilibriumResidual:NaN}]}]){
 const bad={...direct,...altered};assert.throws(()=>create().service.restoreState(wrap(bad)),{code:'RC_SPLICE_CHECKPOINT_INVALID'});assert.throws(()=>rcSpliceDesignSource(bad),{code:'RC_SPLICE_SECOND_ORDER_PROOF_REQUIRED'});
}
console.log('PASS shared second-order proof rejects missing, mismatched, nonfinite and unconverged records');

for(const spatialAbsoluteTolerances of [undefined,{}, {...RC_SPATIAL_ABSOLUTE_TOLERANCES,stressMPa:1}, {...RC_SPATIAL_ABSOLUTE_TOLERANCES,slipM:NaN}, {...RC_SPATIAL_ABSOLUTE_TOLERANCES,extra:1}]){
 const bad={...result,spatialAbsoluteTolerances};assert.throws(()=>create().service.restoreState(wrap(bad)),{code:'RC_SPLICE_CHECKPOINT_INVALID'});assert.throws(()=>rcSpliceDesignSource(bad),{code:'RC_SPLICE_SPATIAL_PROOF_REQUIRED'});
}
console.log('PASS absolute convergence tolerances must match the active numerical owner');

for(const altered of [{spatialTolerance:1},{frameRefinement:{convergenceVerified:true,tolerance:1}},{spatialTrace:[result.spatialTrace[0],{change:NaN},result.spatialTrace[1]]}]){
 const bad={...result,...altered};assert.throws(()=>create().service.restoreState(wrap(bad)),{code:'RC_SPLICE_CHECKPOINT_INVALID'});assert.throws(()=>rcSpliceDesignSource(bad),{code:'RC_SPLICE_SPATIAL_PROOF_REQUIRED'});
}

for(const altered of [
 {firstOrderMomentComparison:undefined}, {momentComparisonSummary:undefined},
 {momentComparisonSummary:{...momentComparisonSummary,comparisonHash:'wrong'}},
 {momentComparisonSummary:{...momentComparisonSummary,continuousMemberCount:1}},
 {memberForceSources:{AB:{},CD:{}}},
 ...[{limit:2},{version:'old'},{fullMemberQualified:true},{designTransferAllowed:true}].map(patch=>{const c={...firstOrderMomentComparison,...patch};return {firstOrderMomentComparison:c,momentComparisonSummary:{...momentComparisonSummary,comparisonHash:stableHash(c)}};})
]){
 const bad={...direct,...altered};const runtime=create();
 assert.throws(()=>runtime.service.restoreState(wrap(bad)),{code:'RC_SPLICE_CHECKPOINT_INVALID'});
 assert.equal(runtime.budget.snapshot().totalBytes,0);
 assert.throws(()=>rcSpliceDesignSource(bad),{code:'RC_SPLICE_SECOND_ORDER_PROOF_REQUIRED'});
 runtime.service.dispose();
}
console.log('PASS Direct comparison coverage, summary and policy integrity at restore and design transfer');

import {validDirectMomentComparison} from '../src/metadata/directMomentComparisonPolicy.js';
for(const status of ['WITHIN_RECOVERY_INTERVALS','EXCEEDS_IN_RECOVERY_INTERVALS','WITHIN_AT_RECORDED_STATIONS','EXCEEDS_AT_RECORDED_STATIONS']){
 const continuous=status.includes('RECOVERY_INTERVALS');
 const c={...firstOrderMomentComparison,members:{AB:{status,intervalCoverageVerified:continuous,fullMemberQualified:false}}};
 const s={...momentComparisonSummary,comparisonHash:stableHash(c),continuousMemberCount:Number(continuous),exceedingMemberCount:Number(status.startsWith('EXCEEDS_'))};
 assert.equal(validDirectMomentComparison({...direct,firstOrderMomentComparison:c,momentComparisonSummary:s}),true,status);
 c.members.AB.intervalCoverageVerified=!continuous;s.comparisonHash=stableHash(c);
 assert.equal(validDirectMomentComparison({...direct,firstOrderMomentComparison:c,momentComparisonSummary:s}),false,status);
}
