import assert from 'node:assert/strict';
import {readDrawingArtifact} from '../src/ui/drawingArtifactReader.js';
import {sha256Bytes} from '../src/core/stableHash.js';
const bytes=Uint8Array.from({length:30000},(_,i)=>i%251),manifest={artifactId:'a',byteLength:bytes.length,sha256:sha256Bytes(bytes),mime:'application/pdf'};
const read=({offset,limit})=>({ok:true,stale:false,artifactId:'a',sha256:manifest.sha256,byteLength:bytes.length,encoding:'base64',offset,nextOffset:offset+limit<bytes.length?offset+limit:null,content:Buffer.from(bytes.subarray(offset,offset+limit)).toString('base64')});
assert.deepEqual(await readDrawingArtifact(manifest,read),bytes);
await assert.rejects(readDrawingArtifact(manifest,p=>({...read(p),stale:true})),/STALE/);
await assert.rejects(readDrawingArtifact(manifest,p=>({...read(p),nextOffset:p.offset})),/CHUNK/);
await assert.rejects(readDrawingArtifact(manifest,p=>({...read(p),content:'AA=='})),/CHUNK/);
await assert.rejects(readDrawingArtifact({...manifest,sha256:'0'.repeat(64)},p=>({...read(p),sha256:'0'.repeat(64)})),/HASH/);
let calls=0;await assert.rejects(readDrawingArtifact({...manifest,byteLength:33*1024*1024},()=>{calls++;}),/SIZE/);assert.equal(calls,0);
const controller=new AbortController();await assert.rejects(readDrawingArtifact(manifest,p=>{controller.abort();return read(p);},{signal:controller.signal}),/CANCEL/);
console.log('PASS bounded contiguous artifact reconstruction, exact length/hash, stale/malformed rejection and cancellation');

await assert.rejects(readDrawingArtifact(manifest,p=>({...read(p),stale:p.offset===bytes.length})),/STALE/);
