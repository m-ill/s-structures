import assert from 'node:assert/strict';
import {prepareRcMemberServiceResponses} from '../src/compute/product/rcMemberServiceResponses.js';
const segment={memberId:'M',startX:0,endX:2,localDisplacements:[0,0,0,0,0,0,0,8,0,0,0,12]};
// v=x^3 over [0,2]. Relative chord x^3-4x has its extremum at sqrt(4/3).
let response=prepareRcMemberServiceResponses([segment]).M;
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,`${a} != ${b}`);
near(response.chord.v.maxAbs,16/(3*Math.sqrt(3)));near(response.chord.v.x,2/Math.sqrt(3));
near(response['cantilever-start'].v.maxAbs,8);near(response['cantilever-end'].v.maxAbs,16);
const rigid={...segment,localDisplacements:[0,3,0,0,0,2,0,7,0,0,0,2]};
for(const value of Object.values(prepareRcMemberServiceResponses([rigid]).M).filter(x=>x?.v))near(value.v.maxAbs,0);
const left={...segment,endX:1,localDisplacements:[0,0,0,0,0,0,0,1,0,0,0,3]};
const right={...segment,startX:1,localDisplacements:[0,1,0,0,0,3,0,8,0,0,0,12]};
near(prepareRcMemberServiceResponses([right,left]).M.chord.v.maxAbs,response.chord.v.maxAbs);
assert.throws(()=>prepareRcMemberServiceResponses([{...right,startX:1.1},left]),/CONTINUITY/);
assert.throws(()=>prepareRcMemberServiceResponses([left,{...right,localDisplacements:right.localDisplacements.map((x,i)=>i===1?2:x)}]),/CONTINUITY/);
assert.equal(response.designTransferAllowed,false);assert.equal(response.loadParticularSolutionIncluded,false);
console.log('PASS exact piecewise cubic relative displacement extrema and rigid motion removal');

const transverse={...segment,localDisplacements:[0,0,0,0,0,0,0,0,8,0,-12,0]};
near(prepareRcMemberServiceResponses([transverse]).M.chord.w.maxAbs,response.chord.v.maxAbs);
assert.throws(()=>prepareRcMemberServiceResponses([{...segment,localDisplacements:segment.localDisplacements.map((v,i)=>i===8?NaN:v)}]),/INVALID/);
console.log('PASS both transverse rotation conventions and nonfinite rejection');

const {subtractRcMemberServiceResponses}=await import('../src/compute/product/rcMemberServiceResponses.js');
const doubled=prepareRcMemberServiceResponses([left,right].map(s=>({...s,localDisplacements:s.localDisplacements.map(v=>2*v)}))).M;
const delta=subtractRcMemberServiceResponses(doubled,response);
near(delta.chord.v.maxAbs,response.chord.v.maxAbs);
near(subtractRcMemberServiceResponses(response,response).chord.v.maxAbs,0);
assert.throws(()=>subtractRcMemberServiceResponses(response,{...response,length:3}),/MISMATCH/);
console.log('PASS total-minus-baseline displacement fields on differing meshes');

const {evaluateProvidedDeflection}=await import('../src/design/rc/kdsServiceability.js');
const model={nodes:[{id:'A',x:0,y:0,z:0,support:'fixed'},{id:'B',x:2,y:0,z:0}],loadCases:[{id:'D',type:'dead'},{id:'L',type:'live'}],loadCombinations:[{id:'T',type:'service',factors:{D:1,L:1}},{id:'D',type:'service',factors:{D:1}}]};
const member={id:'M',n1:'A',n2:'B'};
const detail={start:0,end:1,serviceabilityMode:'instant-live-frame',serviceCrackingComboId:'T',serviceBaselineComboId:'D',serviceDeflectionAxis:'v',serviceBoundary:'chord',serviceDeflectionLimit:'live-floor',nonstructuralDamageSensitive:false};
const sets={T:{ok:true,combo:{id:'T'},solverMethod:'rc-splice-frame',method:'off',memberServiceResponses:{M:doubled}},D:{ok:true,combo:{id:'D'},solverMethod:'rc-splice-frame',method:'off',memberServiceResponses:{M:response}}};
const evaluate=()=>evaluateProvidedDeflection(model,member,[detail],sets.T,sets);
let check=evaluate();assert.equal(check.status,'NG');near(check.demand,response.chord.v.maxAbs);near(check.capacity,2/360);assert.equal(check.incomplete,true);assert.ok(check.codeReferences.length);assert.equal(check.designTransferAllowed,false);
assert.equal(evaluateProvidedDeflection(model,member,[detail],sets.D,sets).status,'N_A');
model.loadCombinations[1].factors.L=1;assert.equal(evaluate().reason,'UNFACTORED_TOTAL_AND_DEAD_BASELINE_REQUIRED');delete model.loadCombinations[1].factors.L;
model.loadCases[0].enabled=false;assert.equal(evaluate().reason,'SERVICE_COMBINATION_CASE_UNAVAILABLE');delete model.loadCases[0].enabled;
sets.D.method='direct';assert.equal(evaluate().reason,'MATCHING_FRAME_SERVICE_SOURCES_REQUIRED');sets.D.method='off';
detail.serviceDeflectionAxis=null;assert.equal(evaluate().reason,'SERVICE_DEFLECTION_AXIS_REQUIRED');detail.serviceDeflectionAxis='v';
detail.nonstructuralDamageSensitive=true;assert.equal(evaluate().reason,'POST_ATTACHMENT_LONG_TERM_CHECK_REQUIRED');detail.nonstructuralDamageSensitive=false;
console.log('PASS frame serviceability input, combination and method guards retain KDS limit with incomplete qualification');

const axialParts=[{...left,localDisplacements:[3,0,0,0,0,0,2,0,0,0,0,0]},{...right,localDisplacements:[2,0,0,0,0,0,2.5,0,0,0,0,0]}];
const axial=prepareRcMemberServiceResponses(axialParts).M;
near(axial.axialRelative.endChange,-.5);
near(axial.axialRelative.minimum.value,-1);near(axial.axialRelative.minimum.x,1);
near(axial.axialRelative.maximum.value,0);
near(axial.axialRelative.maximumAbsolute.value,-1);
const translated=prepareRcMemberServiceResponses(axialParts.map(s=>({...s,localDisplacements:s.localDisplacements.map((v,i)=>[0,6].includes(i)?v+17:v)}))).M;
assert.deepEqual(translated.axialRelative,axial.axialRelative,'axial shortening excludes rigid translation');
const axialBaseline=prepareRcMemberServiceResponses([{...segment,localDisplacements:[3,0,0,0,0,0,3,0,0,0,0,0]}]).M;
assert.deepEqual(subtractRcMemberServiceResponses(axial,axialBaseline).axialRelative,axial.axialRelative);
near(subtractRcMemberServiceResponses(axial,axial).axialRelative.maximumAbsolute.value,0);
assert.equal(axial.axialRelative.units,'m');
