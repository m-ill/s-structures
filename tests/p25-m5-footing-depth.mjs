import assert from 'node:assert/strict';
import {evaluateFootingDepth} from '../src/design/foundation/footingDepth.js';
import {foundationDepthProposal} from '../src/compute/product/foundationDepthProposal.js';
const f={foundationType:'isolated',thickness:.2,cover:.05,reinforcement:{bottomB:{diameter:.016},bottomL:{diameter:.02},topB:{diameter:.032},topL:{diameter:.032}}};
const result=evaluateFootingDepth(f);
assert.equal(result.status,'NG');
assert.ok(Math.abs(result.axisChecks[0].provided-.142)<1e-12);
assert.ok(Math.abs(result.axisChecks[1].provided-.124)<1e-12);
assert.ok(result.codeReferences.some(r=>r.clause==='4.2.1(5)'));
assert.deepEqual(evaluateFootingDepth({...f,reinforcement:{...f.reinforcement,topB:{diameter:.01}}}),result,'upper tension steel must not change depth above bottom steel');
const checks=[{...result,id:'DEPTH',checkId:'foundation-depth',entityId:'foundation:A'}];
const proposal=foundationDepthProposal({nodeId:'A',thickness:.2},checks);
assert.equal(proposal.ok,true);assert.equal(proposal.edits[0].thickness,.25);
assert.equal(evaluateFootingDepth({...f,...proposal.edits[0]}).status,'OK');
assert.equal(foundationDepthProposal({nodeId:'OTHER',thickness:.2},checks).ok,false);
assert.equal(evaluateFootingDepth({...f,foundationType:'pile'}).status,'NOT_CHECKED');
assert.equal(evaluateFootingDepth({...f,reinforcement:{bottomB:{diameter:.016}}}).incomplete,true);
assert.equal(evaluateFootingDepth({...f,reinforcement:{bottomB:{diameter:.016}}}).status,'NG');
console.log('PASS bottom-steel depth, axis stacking, no top-face substitution and thickness proposal');

const {foundationRepairProposal}=await import('../src/compute/product/foundationRepairProposal.js');
const composite=foundationRepairProposal({nodeId:'A',thickness:.2,columnEmbedmentLength:.1,columnDevelopmentAbove:.1},[...checks,{id:'DEV',entityId:'foundation:A',checkId:'foundation-column-transfer',requiredBelow:.5,requiredAbove:.2,criteria:[{id:'embedment-envelope',capacity:.14},{id:'column-region-envelope',capacity:3}]}],{});
assert.ok(composite.edits[0].thickness>.55,'larger development requirement must survive depth merge');
assert.ok(composite.basisCheckIds.includes('DEV')&&composite.basisCheckIds.includes('DEPTH'));

const missing=evaluateFootingDepth({...f,thickness:.3,reinforcement:{bottomB:{diameter:.016}}});assert.equal(missing.status,'NOT_CHECKED');assert.equal(missing.reason,'FOOTING_BOTTOM_DEPTH_INPUT_REQUIRED');assert.equal(missing.ratio,null);
