import assert from 'node:assert/strict';
import {kdsMemberShear} from '../src/design/rc/kdsShear.js';
const input={fck:24,fy:235,bw:600,h:300,d:240,Ag:180000,Av:2*Math.PI*10**2/4,s:150,N:0,V:0};
const zero=kdsMemberShear(input);assert.equal(zero.status,'OK');assert.equal(zero.usedConcreteOnly,true);
for(const N of [5.1410478232874744e-17,-5.1410478232874744e-17]){
 const actual=kdsMemberShear({...input,N,V:2.441210207054813e-16});
 assert.equal(actual.status,zero.status,'roundoff sign cannot turn an unloaded member into spacing NG');
 assert.equal(actual.Vc,zero.Vc);assert.equal(actual.demand,0);
 assert.equal(actual.forceNormalization.rawAxial,N);assert.equal(actual.forceNormalization.rawShear,2.441210207054813e-16);
}
const tension=kdsMemberShear({...input,N:1e-6,V:1e-5});assert.equal(tension.Vc,0);assert.equal(tension.status,'NG');assert.equal(tension.reason,'SHEAR_REINFORCEMENT_SPACING_EXCEEDED');
assert.equal(tension.demand,1e-5);assert.equal(tension.forceNormalization,undefined);
const loaded=kdsMemberShear({...input,N:50,V:100});assert.equal(loaded.Vc,0);assert.equal(loaded.status,'NG');
const shearOnly=kdsMemberShear({...input,V:100}),noisyAxial=kdsMemberShear({...input,N:5e-17,V:100});
assert.equal(noisyAxial.Vc,shearOnly.Vc);assert.equal(noisyAxial.status,shearOnly.status);assert.equal(noisyAxial.demand,100);
const tolerance=64*Number.EPSILON*4320;
const justAbove=kdsMemberShear({...input,N:2*tolerance,V:2*tolerance});assert.equal(justAbove.Vc,0);assert.equal(justAbove.forceNormalization,undefined);
assert.equal(kdsMemberShear({...input,V:-1e-17}).status,'NOT_CHECKED','negative demand remains invalid rather than being normalized');
assert.deepEqual(input,{fck:24,fy:235,bw:600,h:300,d:240,Ag:180000,Av:2*Math.PI*10**2/4,s:150,N:0,V:0});
console.log('PASS unloaded-member shear roundoff invariance, raw-demand evidence and real tension preserved');
