import assert from 'node:assert/strict';
import {createWorkflowCheckpointRepository} from '../src/compute/product/workflowCheckpoint.js';
const data=new Map(),storage={get:async k=>structuredClone(data.get(k)),put:async(k,v)=>data.set(k,structuredClone(v)),delete:async k=>data.delete(k)};
const repo=createWorkflowCheckpointRepository({storage});
const practical={version:'test',checksum:'one',evaluations:[['e',{id:'e'}]],plans:[],jobs:[],applications:[]};
const bundle={modelBook:{},inputIdentity:{},catalog:{version:'test',analyses:[],designs:[]},reports:[],practical};
await repo.save('p24',bundle);
assert.deepEqual((await repo.read('p24')).bundle.practical,practical);repo.releaseRead();
assert.equal((await repo.matches('p24',bundle)).matches,true);
assert.equal((await repo.matches('p24',{...bundle,practical:{...practical,checksum:'two'}})).matches,false);
console.log(JSON.stringify({ok:true,test:'practical checkpoint roundtrip and dirty detection'}));

const withRc={...bundle,rcService:{version:'p25-rc-service-state-v1',records:[],checksum:'rc-one'}};
await repo.save('p24-rc',withRc);
assert.deepEqual((await repo.read('p24-rc')).bundle.rcService,withRc.rcService);repo.releaseRead();
assert.equal((await repo.matches('p24-rc',withRc)).matches,true);
assert.equal((await repo.matches('p24-rc',{...withRc,rcService:{...withRc.rcService,checksum:'rc-two'}})).matches,false);
