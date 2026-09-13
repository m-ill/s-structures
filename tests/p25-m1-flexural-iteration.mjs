import assert from 'node:assert/strict';
import {runFlexuralIteration} from '../src/compute/product/flexuralIteration.js';
import {createCantileverTipLoad} from '../src/index.js';
import {sectionOf} from '../src/core/catalogs.js';
import {stableHash} from '../src/core/stableHash.js';
const model=createCantileverTipLoad().model,member=model.members[0],section=sectionOf(model,member.secId),hash=stableHash(model);
const calculate=()=>({profiles:[{memberId:member.id,segments:[{start:0,end:1,Iy:section.Iy/2,Iz:section.Iz/2}]}],method:'synthetic-explicit-half-inertia',codeReferences:[]});
const result=await runFlexuralIteration(model,{calculateProfiles:calculate});
assert.equal(result.ok,true,JSON.stringify(result));
assert.equal(result.converged,true);assert.equal(result.designTransferAllowed,false);
assert.ok(result.trace.length>=3);
assert.ok(result.trace.at(-1).profileResidual<=1e-6);
assert.ok(result.trace.at(-1).displacementResidual<=1e-6);
assert.equal(stableHash(model),hash);
const expected=2*result.trace[0].maxDisplacement;
assert.ok(Math.abs(result.trace.at(-1).maxDisplacement-expected)<expected*1e-12);
const short=await runFlexuralIteration(model,{calculateProfiles:calculate,maxIterations:1});
assert.equal(short.ok,false);assert.equal(short.reason,'FLEXURAL_ITERATION_LIMIT');assert.equal(short.analysis,undefined);
const controller=new AbortController();
const cancelled=await runFlexuralIteration(model,{signal:controller.signal,calculateProfiles:()=>{controller.abort();return calculate();}});
assert.equal(cancelled.reason,'FLEXURAL_ITERATION_CANCELLED');assert.equal(cancelled.analysis,undefined);
const changed=structuredClone(model);
const stale=await runFlexuralIteration(changed,{calculateProfiles:()=>{changed.loads[0].P*=2;return calculate();}});
assert.equal(stale.reason,'STALE_FLEXURAL_ITERATION');assert.equal(stale.analysis,undefined);
console.log('PASS real flexural iteration, dual convergence, nonconvergence/cancellation/stale publication guards');

const oscillating=await runFlexuralIteration(model,{maxIterations:4,calculateProfiles:({iteration})=>{
 const p=calculate();for(const row of p.profiles[0].segments){row.Iy=section.Iy/(iteration%2?2:4);row.Iz=section.Iz/(iteration%2?2:4);}return p;
}});
assert.equal(oscillating.reason,'FLEXURAL_ITERATION_LIMIT');assert.equal(oscillating.trace.length,5);assert.equal(oscillating.analysis,undefined);
console.log('PASS oscillating stiffness cannot publish a converged result');

const {prepareFlexuralAnalysisModel}=await import('../src/compute/product/flexuralAnalysisProfile.js');
const near=await runFlexuralIteration(model,{calculateProfiles:({iteration})=>{
 const p=calculate();p.profiles[0].segments[0].Iz=section.Iz*(.5+iteration*1e-8);return p;
}});
assert.equal(near.ok,true);
const applied=prepareFlexuralAnalysisModel(model,{sourceModelHash:near.sourceModelHash,profiles:near.profiles});
assert.equal(near.appliedProfileHash,applied.profileHash);
assert.notEqual(near.appliedProfileHash,near.trace.at(-1).proposedProfileHash,'next proposed stiffness is not the stiffness used for returned forces');
for(const set of Object.values(near.analysis.byCombo)){
 assert.equal(set.stiffnessProvenance.appliedProfileHash,near.appliedProfileHash);
 assert.equal(set.stiffnessProvenance.sourceModelHash,near.sourceModelHash);
 assert.equal(set.stiffnessProvenance.globalMethodQualified,false);
}
