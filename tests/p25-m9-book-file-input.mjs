import assert from 'node:assert/strict';
import {installNativeBookFileInput} from '../src/ui/nativeBookFileInput.js';
let listener,legacy=0,imports=0,current='original';const errors=[];
const input={files:[],value:'chosen',addEventListener(_n,fn){listener=fn;},removeEventListener(){},dispatchEvent(event){listener(event);if(!event.stopped)legacy++;}};
class TestEvent{stopImmediatePropagation(){this.stopped=true;}}
const target={Event:TestEvent,document:{getElementById:id=>id==='fileInput'?input:null},alert:message=>errors.push(message)};
installNativeBookFileInput(target,{importBook(){imports++;}},{getInputHash:()=>current});
const choose=async payload=>{input.files=[{size:50,text:async()=>JSON.stringify(payload)}];await listener(new TestEvent());};
await choose({format:'s-structures-product-book',version:2});assert.equal(imports,1);assert.equal(legacy,0);
await choose({pages:[]});assert.equal(legacy,1,'legacy event forwarded once');assert.equal(imports,1);
input.files=[{size:50,text:async()=>{current='edited';return JSON.stringify({format:'s-structures-product-book'});}}];await listener(new TestEvent());
assert.equal(imports,1);assert.ok(errors.at(-1).includes('STALE_INPUT'));
input.files=[{size:1e9,text:async()=>{throw Error('must not read oversized input');}}];await listener(new TestEvent());
assert.ok(errors.at(-1).includes('BOOK_IMPORT_FILE_LIMIT'));
assert.equal(legacy,1);
console.log('PASS product Book routing, legacy fallback, stale read and preallocation size guard');
