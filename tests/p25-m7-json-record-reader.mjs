import assert from 'node:assert/strict';
import {readJsonRecord} from '../src/ui/jsonRecordReader.js';
import {stableHash} from '../src/core/stableHash.js';
import {jsonTextWindow} from '../src/core/jsonTextWindow.js';
const value={values:Array.from({length:5000},(_,i)=>i),text:'철근 😀'},hash=stableHash(value);
const read=p=>({ok:true,stale:false,offset:p.offset,encoding:'json-text-utf16',checkHash:hash,...jsonTextWindow(value,p)});
assert.deepEqual((await readJsonRecord(read)).value,value);
await assert.rejects(readJsonRecord(p=>({...read(p),stale:true})),/STALE/);
await assert.rejects(readJsonRecord(p=>({...read(p),chunk:'',nextOffset:p.offset})),/CHUNK/);
await assert.rejects(readJsonRecord(p=>({...read(p),totalChars:3000000})),/SIZE/);
await assert.rejects(readJsonRecord(p=>({...read(p),checkHash:'0'.repeat(64)})),/HASH/);
let count=0;await assert.rejects(readJsonRecord(p=>({...read(p),checkHash:++count>1?'1'.repeat(64):hash})),/CHANGED/);
console.log('PASS bounded JSON record paging, stable content hash and stale/non-progress/oversize refusal');

const controller=new AbortController();await assert.rejects(readJsonRecord(p=>{controller.abort();return read(p);},{signal:controller.signal}),/CANCEL/);
await assert.rejects(readJsonRecord(p=>{const row=read(p);return {...row,stale:p.offset===row.totalChars};}),/STALE/);
