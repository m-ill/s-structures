import assert from 'node:assert/strict';
import {prepareRcMemberServiceResponses,combineRcMemberServiceResponses} from '../src/design/rc/frameServiceResponse.js';
// Exact axial linear and lateral quadratic fields; rotation is dv/dx.
function response(c,bounds){const at=x=>[c*x,c*x*x,0,0,0,2*c*x];return prepareRcMemberServiceResponses(bounds.slice(1).map((end,i)=>({memberId:'AB',startX:bounds[i],endX:end,localDisplacements:[...at(bounds[i]),...at(end)]}))).AB;}
const a=response(.002,[0,3]),b=response(.003,[0,1,3]),c=response(.001,[0,2,3]);
const out=combineRcMemberServiceResponses([{response:a,factor:1},{response:b,factor:1},{response:c,factor:-1}]);
assert.ok(Math.abs(out.axialRelative.endChange-.012)<1e-12);
assert.ok(Math.abs(out['cantilever-start'].v.value-.036)<1e-12);
assert.ok(Math.abs(out.chord.v.maxAbs-.009)<1e-12);assert.ok(Math.abs(out.chord.v.x-1.5)<1e-12);
assert.equal(out.segments.length,3);assert.equal(out.designTransferAllowed,false);
assert.throws(()=>combineRcMemberServiceResponses([{response:{...a,length:4},factor:1}]),/SOURCE_MISMATCH/);
assert.throws(()=>combineRcMemberServiceResponses([{response:{...a,memberId:'other'},factor:1}]),/SOURCE_MISMATCH/);
assert.throws(()=>combineRcMemberServiceResponses([{response:a,factor:NaN}]),/STAGE_INPUT/);
assert.throws(()=>combineRcMemberServiceResponses(Array(4).fill({response:a,factor:1})),/STAGE_INPUT/);
console.log('PASS bounded staged axial/lateral fields with independent polynomial extrema');
