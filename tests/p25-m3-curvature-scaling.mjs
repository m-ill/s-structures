import assert from 'node:assert/strict';
import {integrateCurvatureSegments} from '../src/design/rc/curvatureIntegration.js';
import {integrateCurvature} from '../src/design/rc/kdsServiceability.js';
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<=Math.abs(expected)*2e-13,`${actual} != ${expected}`);
for(const scale of [1e-20,1,1e20]){
 const segments=[{x0:0,x1:2,k0:scale,k1:scale}];
 const r=integrateCurvatureSegments(segments,'chord');
 close(r.maxAbs,scale/2);close(r.extrema[0].x,1);
 const single=integrateCurvature([0,2],[scale,scale],'chord');
 close(single.maxAbs,r.maxAbs);assert.deepEqual(single.extrema,r.extrema);
 // A sign-changing linear curvature has two stationary points at (3±sqrt(3))/6.
 const reversal=integrateCurvatureSegments([{x0:0,x1:1,k0:scale,k1:-scale}],'chord');
 assert.equal(reversal.extrema.length,2);
 close(reversal.maxAbs,scale*Math.sqrt(3)/108);
 const split=integrateCurvatureSegments([{x0:0,x1:.3,k0:scale,k1:.4*scale},{x0:.3,x1:1,k0:.4*scale,k1:-scale}],'chord');
 close(split.maxAbs,reversal.maxAbs);
}
// Near-constant curvature: the naive quadratic formula loses the interior root.
const nearly=integrateCurvatureSegments([{x0:0,x1:1,k0:1,k1:1+1e-14}],'chord');
close(nearly.maxAbs,.125);close(nearly.extrema[0].x,.5);
assert.throws(()=>integrateCurvatureSegments([{x0:0,x1:1e200,k0:1e200,k1:1e200}],'chord'),/CURVATURE_RESULT_NONFINITE/);
console.log('PASS curvature scaling, cancellation-resistant extrema, subdivision and shared single/regional owner');
