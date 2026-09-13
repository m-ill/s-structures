import assert from 'node:assert/strict';
import {jsonTextWindow} from '../src/core/jsonTextWindow.js';
const sparse=[];sparse.length=3;sparse[1]='😀';
const value={a:'한😀"\\\n'.repeat(5000),omit:undefined,sparse,other:[NaN,Infinity,undefined],date:new Date('2026-09-12T00:00:00Z')};
const full=JSON.stringify(value);
for(const offset of [0,1,100,4095,4096,full.length-5,full.length]){
 const r=jsonTextWindow(value,{offset,limit:11});assert.equal(r.chunk,full.slice(offset,offset+11));assert.equal(r.totalChars,full.length);assert.equal(r.nextOffset,offset+11<full.length?offset+11:null);
}
assert.throws(()=>jsonTextWindow(value,{offset:full.length+1,limit:10}),/PAGINATION_INVALID/);
const original=JSON.stringify;
try{JSON.stringify=v=>{assert.ok(v===null||typeof v!=='object','do not serialize complete objects');if(typeof v==='string')assert.ok(v.length<=4096,'do not serialize complete long strings');return original(v);};assert.equal(jsonTextWindow(value,{offset:100,limit:100}).chunk,full.slice(100,200));}finally{JSON.stringify=original;}
const cycle={};cycle.self=cycle;assert.throws(()=>jsonTextWindow(cycle),/JSON_CYCLE/);
console.log('PASS compact JSON UTF16 windows, surrogate boundaries, native equivalence and no complete object/string serialization');
