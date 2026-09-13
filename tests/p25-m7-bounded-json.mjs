import assert from 'node:assert/strict';
import {encodeBoundedJson} from '../src/report/phase24/boundedJson.js';
const value={text:'한글 😀 " \\ \n\u0000',missing:undefined,numbers:[1,-0,Infinity,NaN,null,undefined],nested:{a:true,b:[],c:{},date:new Date('2026-09-11T00:00:00Z')},large:'가'.repeat(4095)+'😀'+'\u0001'.repeat(5000)};
assert.equal(new TextDecoder().decode(encodeBoundedJson(value)),JSON.stringify(value,null,2));
const large={text:'😀한'.repeat(200000)};
assert.equal(new TextDecoder().decode(encodeBoundedJson(large)),JSON.stringify(large,null,2));
assert.throws(()=>encodeBoundedJson(large,{maxBytes:100}),/ARTIFACT_SIZE_LIMIT/);
const cycle={};cycle.self=cycle;assert.throws(()=>encodeBoundedJson(cycle),/JSON_CYCLE/);
const exact={a:'한글'},length=new TextEncoder().encode(JSON.stringify(exact,null,2)).length;
assert.equal(encodeBoundedJson(exact,{maxBytes:length}).length,length);
assert.throws(()=>encodeBoundedJson(exact,{maxBytes:length-1}),/ARTIFACT_SIZE_LIMIT/);
console.log('PASS bounded JSON byte equivalence, surrogate boundaries, escaping, exact byte limit and cycle rejection');

const sparse=[];sparse.length=3;sparse[1]='x';
for(const v of [sparse,{a:new Number(2),b:new String('한'),c:new Boolean(false)},'\ud800',{'\udfff':'\ud800'},42,null])assert.equal(new TextDecoder().decode(encodeBoundedJson(v)),JSON.stringify(v,null,2));
assert.throws(()=>encodeBoundedJson({n:1n}),/JSON_BIGINT/);
let calls=0;assert.throws(()=>encodeBoundedJson({toJSON(){return ++calls===1?'x':'longer';}}),/JSON_CHANGED/);
