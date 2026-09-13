import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {sha256Bytes,sha256,stableHash} from '../src/core/stableHash.js';
const expected=b=>createHash('sha256').update(b).digest('hex');
for(const n of [0,1,55,56,63,64,65,119,120,127,128,129,4096,1048576]){
 const backing=Uint8Array.from({length:n+17},(_,i)=>(i*73+11)%256), bytes=backing.subarray(7,7+n), before=bytes.slice();
 assert.equal(sha256Bytes(bytes),expected(bytes),`length ${n}`);
 assert.deepEqual(bytes,before);
 assert.equal(sha256Bytes(bytes.slice().buffer),expected(bytes));
}
assert.equal(sha256('한글 😀'),expected(Buffer.from('한글 😀')));
assert.equal(stableHash({b:2,a:1}),expected(Buffer.from('{"a":1,"b":2}')));
// Instrument allocations in the real module, independently of heap/GC timing.
const allocations=[];
const TrackedBytes=new Proxy(Uint8Array,{construct(target,args){
 const result=Reflect.construct(target,args); allocations.push(result.byteLength);return result;
}});
const context=vm.createContext({Uint8Array:TrackedBytes,Uint32Array,DataView,TextEncoder});
vm.runInContext(readFileSync(new URL('../src/core/stableHash.js',import.meta.url),'utf8').replaceAll('export function','function'),context);
const input=new Uint8Array(1024*1024+63);context.input=input;
assert.equal(vm.runInContext('sha256Bytes(input)',context),expected(input));
assert.ok(allocations.every(n=>n<=128),`hash scratch allocations must be bounded: ${allocations}`);
console.log('PASS SHA256 independent crypto equivalence, block/padding boundaries, offset views, immutable input and bounded scratch allocation');

const encodedLengths=[];
class TrackedEncoder extends TextEncoder { encode(text){encodedLengths.push(text.length);return super.encode(text);} }
context.TextEncoder=TrackedEncoder;
context.longText='가'.repeat(4095)+'😀'+'x'.repeat(4095)+'\ud800'+'나'.repeat(200000);
assert.equal(vm.runInContext('sha256(longText)',context),expected(Buffer.from(context.longText)));
assert.ok(encodedLengths.every(n=>n<=4096),`UTF8 encode chunks must be bounded: ${encodedLengths.slice(0,5)}`);
for(const text of ['','a'.repeat(55),'a'.repeat(56),'a'.repeat(63),'a'.repeat(64),'a'.repeat(65),'😀'.repeat(2049),'\ud800','\udfff','x\ud800y']){
 assert.equal(sha256(text),expected(Buffer.from(text)));
 context.text=text;context.TextEncoder=undefined;
 assert.equal(vm.runInContext('sha256(text)',context),expected(Buffer.from(text)),'fallback UTF8');
}
console.log('PASS bounded UTF8 hashing, chunk-spanning surrogate pairs and native/fallback replacement equivalence');

const {stableStringify}=await import('../src/core/stableHash.js');
const sparse=[];sparse.length=3;sparse[1]='한글';
const samples=[null,1,NaN,'\ud800',{a:undefined,z:Infinity,b:[undefined,NaN]},sparse,new Date('2026-09-12T00:00:00Z'),{c:{toJSON(){return undefined;}},a:1},new String('hi'),{text:'😀한"\\'.repeat(10000)}];
for(const sample of samples)assert.equal(stableHash(sample),expected(Buffer.from(stableStringify(sample))));
assert.throws(()=>stableHash(undefined),/JSON-serializable/);
assert.throws(()=>stableHash({n:1n}),/BigInt/);
const cyclic={};cyclic.self=cyclic;assert.throws(()=>stableHash(cyclic),/circular/);
context.TextEncoder=TrackedEncoder;context.sample={text:'한'.repeat(100000),other:[1,2,3]};
// Stable hashing must not construct the complete canonical JSON string.
vm.runInContext('canonicalStringify = () => { throw Error("WHOLE_CANONICAL_STRING"); }',context);
assert.equal(vm.runInContext('stableHash(sample)',context),expected(Buffer.from(stableStringify(context.sample))));
console.log('PASS streamed canonical identity equivalence and no complete canonical string');

const selfJson={toJSON(){return this;}};assert.throws(()=>stableHash(selfJson),/circular toJSON/);
const x={},y={};x.toJSON=()=>y;y.toJSON=()=>x;assert.throws(()=>stableHash(x),/circular toJSON/);
let seed=12345;
const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
for(let i=0;i<100;i++){
 const obj={};for(let j=0;j<20;j++)obj[String(rnd())]=[rnd()/3,String.fromCharCode(rnd()%65536),j%2?undefined:null];
 assert.equal(stableHash(obj),expected(Buffer.from(stableStringify(obj))));
}
console.log('PASS canonical randomized Unicode/key ordering and cyclic toJSON rejection');
