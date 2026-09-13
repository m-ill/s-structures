import assert from 'node:assert/strict';
import {planDirectory,prepareDirectory,getDirectoryConnection,PUBLIC_SITE_URL} from '../src/agentHarness/directory.js';
import {createHarnessFiles} from '../src/agentHarness/package.js';
const contents=new Map(),directories=new Set(['']);let deny=false;
function dir(prefix=''){
 return {name:'project-fixture',async getDirectoryHandle(name,{create=false}={}){
  const path=prefix+name+'/';if(create)directories.add(path);if(!directories.has(path))throw {name:'NotFoundError'};return dir(path);
 },async getFileHandle(name,{create=false}={}){
  const path=prefix+name;if(create&&!contents.has(path))contents.set(path,'');if(!contents.has(path))throw {name:'NotFoundError'};
  return {getFile:async()=>({text:async()=>contents.get(path)}),createWritable:async()=>{if(deny)throw {name:'NotAllowedError'};let value;return {write:async text=>{value=text;},close:async()=>contents.set(path,value),abort:async()=>{}};}};
 }};
}
const files=createHarnessFiles(PUBLIC_SITE_URL);contents.set('AGENTS.md','user-owned');
const plan=await planDirectory(dir(),files);assert.equal(plan.preserveCount,1);assert.equal(contents.size,1);
assert.equal((await prepareDirectory(dir(),files)).prepared,true);assert.equal(contents.get('AGENTS.md'),'user-owned');
assert.equal(getDirectoryConnection().agentVerified,false);assert.equal((await planDirectory(dir(),files)).createCount,0);
contents.set('.sstructures/state.json','user-state');const before=JSON.stringify([...contents]);
assert.equal((await prepareDirectory(dir(),files)).prepared,false);assert.equal(JSON.stringify([...contents]),before);
await assert.rejects(planDirectory(dir(),{'../outside':'x'}),/INVALID_PACKAGE_PATH/);
contents.clear();directories.clear();directories.add('');deny=true;
await assert.rejects(prepareDirectory(dir(),files));assert.equal(getDirectoryConnection().status,'incomplete');
console.log('PASS directory preparation: preview, preserve, repeat, conflict, invalid path, permission failure; no agent connection claim');
