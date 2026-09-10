import { sha256 } from '../../core/stableHash.js';
import { retainedBytes } from '../../core/resourceBudget.js';
export const WORKFLOW_CHECKPOINT_VERSION='p21-workflow-checkpoint-v2';
const LEGACY='p21-workflow-checkpoint-v1';
const failure=code=>Object.assign(new Error(code),{code});

// Count serialized characters before allocating the JSON string. Aliases count
// each time they occur in JSON; only ancestor cycles are rejected.
export function checkpointJsonLength(value,stack=new Set(),arrayItem=false) {
  if(value===null)return 4;
  const type=typeof value;
  if(type==='string') {
    let n=2;
    for(let i=0;i<value.length;i++) {
      const c=value.charCodeAt(i);
      if(c===34||c===92||[8,9,10,12,13].includes(c))n+=2;
      else if(c<32)n+=6;
      else if(c>=0xd800&&c<=0xdbff&&value.charCodeAt(i+1)>=0xdc00&&value.charCodeAt(i+1)<=0xdfff){n+=2;i++;}
      else if(c>=0xd800&&c<=0xdfff)n+=6;
      else n++;
    }
    return n;
  }
  if(type==='number')return Number.isFinite(value)?String(value).length:4;
  if(type==='boolean')return value?4:5;
  if(['undefined','function','symbol'].includes(type))return arrayItem?4:undefined;
  if(type==='bigint')throw failure('CHECKPOINT_JSON_INVALID');
  if(typeof value.toJSON==='function')return checkpointJsonLength(value.toJSON(),stack,arrayItem);
  if(stack.has(value))throw failure('CHECKPOINT_JSON_CYCLE');
  stack.add(value);let n=2,count=0;
  if(Array.isArray(value))for(let i=0;i<value.length;i++){n+=checkpointJsonLength(value[i],stack,true)+(count++?1:0);}
  else for(const key of Object.keys(value)){const size=checkpointJsonLength(value[key],stack);if(size!==undefined)n+=checkpointJsonLength(key)+1+size+(count++?1:0);}
  stack.delete(value);return n;
}
function segmentsFor(bundle) {
  const rows=[{path:['modelBook'],value:bundle.modelBook},{path:['inputIdentity'],value:bundle.inputIdentity},{path:['interruptedJobs'],value:bundle.interruptedJobs||[]}];
  for(const kind of ['analyses','designs'])bundle.catalog[kind].forEach((value,i)=>rows.push({path:['catalog',kind,i],value}));
  bundle.reports.forEach(([id,report],i)=>{
    rows.push({path:['reports',i,0],value:id});
    for(const [key,value] of Object.entries(report))if(value!==undefined)rows.push({path:['reports',i,1,key],value});
  });
  return rows;
}
export function createWorkflowCheckpointRepository({indexedDB=globalThis.indexedDB,storage,budget}={}) {
  const io=budget?.nextOwner('checkpoint-io'),readOwner=budget?.nextOwner('checkpoint-read');
  const reserve=bytes=>budget?.reserve(io,bytes),release=()=>budget?.release(io);
  async function database(){
    if(!indexedDB)throw failure('CHECKPOINT_STORAGE_UNAVAILABLE');
    return new Promise((resolve,reject)=>{
      const request=indexedDB.open('SStructuresPhase21',1);let blocked=false;
      request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('checkpoints'))request.result.createObjectStore('checkpoints');};
      request.onsuccess=()=>{if(blocked)request.result.close();else resolve(request.result);};
      request.onerror=()=>reject(failure('CHECKPOINT_STORAGE_UNAVAILABLE'));
      request.onblocked=()=>{blocked=true;reject(failure('CHECKPOINT_STORAGE_BLOCKED'));};
    });
  }
  async function get(key){
    if(storage)return storage.get(key);
    const db=await database();
    try{return await new Promise((resolve,reject)=>{
      const tx=db.transaction('checkpoints','readonly'),request=tx.objectStore('checkpoints').get(key);let value;
      request.onsuccess=()=>{value=request.result;};tx.oncomplete=()=>resolve(value);
      tx.onerror=tx.onabort=()=>reject(failure('CHECKPOINT_STORAGE_TRANSACTION_FAILED'));
    });}finally{db.close();}
  }
  async function header(projectId){
    const saved=await get(projectId);
    if(!saved)throw failure('CHECKPOINT_NOT_FOUND');
    if(![LEGACY,WORKFLOW_CHECKPOINT_VERSION].includes(saved.version)||typeof saved.content!=='string'||sha256(saved.content)!==saved.sha256)throw failure('CHECKPOINT_HASH_MISMATCH');
    const manifest=JSON.parse(saved.content);
    if(manifest.version!==saved.version||manifest.projectId!==projectId)throw failure('CHECKPOINT_IDENTITY_MISMATCH');
    if(saved.version!==LEGACY){
      if(!Array.isArray(manifest.segments)||manifest.segments.length>1024)throw failure('CHECKPOINT_MANIFEST_INVALID');
      const paths=new Set(),keys=new Set();
      for(const s of manifest.segments){
        if(typeof s.key!=='string'||!s.key.startsWith('p21:segment:')||!Array.isArray(s.path)||!s.path.length||s.path.length>5||s.path.some(p=>['__proto__','constructor','prototype'].includes(p)||!(typeof p==='string'||Number.isSafeInteger(p)&&p>=0))||paths.has(JSON.stringify(s.path))||keys.has(s.key)||!Number.isSafeInteger(s.characters)||s.characters<0||!Number.isSafeInteger(s.retainedBytes)||s.retainedBytes<0)throw failure('CHECKPOINT_MANIFEST_INVALID');
        paths.add(JSON.stringify(s.path));keys.add(s.key);
      }
    }
    return {saved,manifest};
  }
  async function segment(s,parse=false){
    reserve(s.characters*12+s.retainedBytes+4096);
    try{
      const row=await get(s.key);
      if(typeof row?.content!=='string'||row.content.length!==s.characters||sha256(row.content)!==s.sha256)throw failure('CHECKPOINT_HASH_MISMATCH');
      return parse?JSON.parse(row.content):undefined;
    }finally{release();}
  }
  async function inspect(projectId){
    const {saved,manifest}=await header(projectId);
    if(saved.version!==LEGACY)for(const s of manifest.segments)await segment(s);
    return {ok:true,projectId,sha256:saved.sha256,byteLength:manifest.byteLength??new TextEncoder().encode(saved.content).byteLength,savedAt:saved.savedAt,durable:true,designRunIds:manifest.designRunIds??manifest.reports.map(([id])=>id),interruptedJobs:manifest.interruptedJobs||[]};
  }
  async function read(projectId){
    const {saved,manifest}=await header(projectId);
    if(saved.version===LEGACY){budget?.reserve(readOwner,retainedBytes(manifest));return {bundle:manifest,sha256:saved.sha256,savedAt:saved.savedAt};}
    const bundle={version:WORKFLOW_CHECKPOINT_VERSION,projectId,catalog:{version:manifest.catalogVersion,analyses:[],designs:[]},reports:[]};let retained=4096;
    try{
      for(const s of manifest.segments){
        retained+=s.retainedBytes;budget?.reserve(readOwner,retained);
        const value=await segment(s,true);let cursor=bundle;
        for(let i=0;i<s.path.length-1;i++){const p=s.path[i];cursor[p]??=typeof s.path[i+1]==='number'?[]:{};cursor=cursor[p];}
        cursor[s.path.at(-1)]=value;
      }
      return {bundle,sha256:saved.sha256,byteLength:manifest.byteLength,savedAt:saved.savedAt};
    }catch(error){budget?.release(readOwner);throw error;}
  }
  async function save(projectId,bundle){
    if(typeof projectId!=='string'||!projectId.trim())throw failure('PROJECT_ID_REQUIRED');
    const generation=globalThis.crypto.randomUUID(),rows=segmentsFor(bundle),savedAt=new Date().toISOString();
    const manifest={version:WORKFLOW_CHECKPOINT_VERSION,projectId,catalogVersion:bundle.catalog.version,segments:[],byteLength:0,designRunIds:bundle.reports.map(([id])=>id),interruptedJobs:bundle.interruptedJobs||[]};
    function encode(row,index){
      const characters=checkpointJsonLength(row.value),retained=retainedBytes(row.value);
      reserve(characters*12+retained+4096);
      const content=JSON.stringify(row.value),key=`p21:segment:${JSON.stringify([projectId,generation,index])}`;
      manifest.segments.push({key,path:row.path,sha256:sha256(content),characters,retainedBytes:retained});
      manifest.byteLength+=new TextEncoder().encode(content).byteLength;
      return {key,value:{content}};
    }
    function finish(){const content=JSON.stringify(manifest);return {version:WORKFLOW_CHECKPOINT_VERSION,content,sha256:sha256(content),savedAt};}
    let saved;
    if(storage){
      // Test adapters publish the manifest last. Production uses one atomic IDB transaction.
      const previous=await storage.get(projectId);
      try{for(let i=0;i<rows.length;i++){const item=encode(rows[i],i);await storage.put(item.key,item.value);release();}saved=finish();await storage.put(projectId,saved);}
      finally{release();}
      if(previous?.version===WORKFLOW_CHECKPOINT_VERSION&&storage.delete)for(const s of JSON.parse(previous.content).segments)await storage.delete(s.key);
    }else{
      const db=await database();
      try{await new Promise((resolve,reject)=>{
        const tx=db.transaction('checkpoints','readwrite'),store=tx.objectStore('checkpoints');let index=0,cause;
        tx.oncomplete=resolve;tx.onerror=()=>{};tx.onabort=()=>reject(cause||failure('CHECKPOINT_STORAGE_TRANSACTION_ABORTED'));
        const previous=store.get(projectId);
        previous.onsuccess=()=>{
          try{if(previous.result?.version===WORKFLOW_CHECKPOINT_VERSION)for(const s of JSON.parse(previous.result.content).segments)store.delete(s.key);next();}
          catch(error){cause=error;tx.abort();}
        };
        function next(){
          release();
          try{
            if(index===rows.length){saved=finish();store.put(saved,projectId);return;}
            const item=encode(rows[index],index++);store.put(item.value,item.key).onsuccess=next;
          }catch(error){cause=error;tx.abort();}
        }
      });}finally{release();db.close();}
    }
    const verified=await inspect(projectId);
    if(verified.sha256!==saved.sha256)throw failure('CHECKPOINT_READBACK_MISMATCH');
    return verified;
  }
  async function matches(projectId,bundle){
    const {saved,manifest}=await header(projectId);
    if(saved.version===LEGACY)return {matches:sha256(JSON.stringify(manifest.catalog))===sha256(JSON.stringify(bundle.catalog))&&sha256(JSON.stringify(manifest.reports))===sha256(JSON.stringify(bundle.reports)),sha256:saved.sha256};
    const rows=segmentsFor({...bundle,modelBook:null,inputIdentity:null}).filter(r=>['catalog','reports'].includes(r.path[0]));
    const expected=manifest.segments.filter(s=>['catalog','reports'].includes(s.path[0]));
    if(rows.length!==expected.length)return {matches:false};
    for(let i=0;i<rows.length;i++){
      const row=rows[i],s=expected[i];if(JSON.stringify(row.path)!==JSON.stringify(s.path))return {matches:false};
      reserve(checkpointJsonLength(row.value)*12+4096);
      try{if(sha256(JSON.stringify(row.value))!==s.sha256)return {matches:false};}finally{release();}
      await segment(s);
    }
    return {matches:true,sha256:saved.sha256};
  }
  return {save,read,inspect,matches,releaseRead:()=>budget?.release(readOwner)};
}
