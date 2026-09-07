import assert from 'node:assert/strict';
import {jetVariable,jetMul,jetSin,jetScale,isSecondOrderJet} from '../src/nonlinear/math/secondOrderJet.js';
const x=jetVariable(0.4,0,12), y=jetVariable(0.7,1,12);
const r=jetSin(jetMul(x,y));
assert.ok(Math.abs(r.gradient[0]-0.7*Math.cos(0.28))<1e-15);
assert.ok(Math.abs(r.hessian[1]-(Math.cos(0.28)-0.28*Math.sin(0.28)))<1e-15);
for(const channel of ['gradient','hessian'])for(const invalid of [NaN,Infinity,-Infinity]){
  const v=jetVariable(1,0,12);assert.equal(isSecondOrderJet(v),true);
  v[channel][v[channel].length-1]=invalid;
  assert.equal(isSecondOrderJet(v),false,'A previously valid mutable jet must be revalidated');
  assert.throws(()=>jetScale(v,2),{code:'JET_CONTRACT_INVALID'});
}
const overflow=jetVariable(1,0,2);overflow.hessian[3]=Number.MAX_VALUE;
assert.throws(()=>jetScale(overflow,2),{code:'JET_DERIVATIVE_NONFINITE'});
console.log('PASS analytic mixed derivative, mutable tail corruption, derivative overflow');
