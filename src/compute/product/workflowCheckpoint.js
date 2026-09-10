import { sha256 } from '../../core/stableHash.js';
export const WORKFLOW_CHECKPOINT_VERSION='p21-workflow-checkpoint-v1';
const failure=code=>Object.assign(new Error(code),{code});
export function createWorkflowCheckpointRepository({indexedDB=globalThis.indexedDB,storage}={}) {
  async function database(){
    if(!indexedDB)throw failure('CHECKPOINT_STORAGE_UNAVAILABLE');
    return new Promise((resolve,reject)=>{
      const request=indexedDB.open('SStructuresPhase21',1);
      request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('checkpoints'))request.result.createObjectStore('checkpoints');};
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(failure('CHECKPOINT_STORAGE_UNAVAILABLE'));
      request.onblocked=()=>reject(failure('CHECKPOINT_STORAGE_BLOCKED'));
    });
  }
  async function operation(mode,key,value){
    if(storage)return mode==='readwrite'?storage.put(key,value):storage.get(key);
    const db=await database();
    try {return await new Promise((resolve,reject)=>{
      const tx=db.transaction('checkpoints',mode),store=tx.objectStore('checkpoints');let result;
      const request=mode==='readwrite'?store.put(value,key):store.get(key);
      request.onsuccess=()=>{result=request.result;};
      tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(failure('CHECKPOINT_STORAGE_TRANSACTION_FAILED'));tx.onabort=()=>reject(failure('CHECKPOINT_STORAGE_TRANSACTION_ABORTED'));
    });} finally {db.close();}
  }
  async function read(projectId){
    const saved=await operation('readonly',projectId);
    if(!saved)throw failure('CHECKPOINT_NOT_FOUND');
    if(saved.version!==WORKFLOW_CHECKPOINT_VERSION||typeof saved.content!=='string'||sha256(saved.content)!==saved.sha256)throw failure('CHECKPOINT_HASH_MISMATCH');
    const bundle=JSON.parse(saved.content);
    if(bundle.version!==WORKFLOW_CHECKPOINT_VERSION||bundle.projectId!==projectId)throw failure('CHECKPOINT_IDENTITY_MISMATCH');
    return {bundle,sha256:saved.sha256,byteLength:new TextEncoder().encode(saved.content).byteLength,savedAt:saved.savedAt};
  }
  return {
    async save(projectId,bundle){
      if(typeof projectId!=='string'||!projectId.trim())throw failure('PROJECT_ID_REQUIRED');
      const content=JSON.stringify({...bundle,version:WORKFLOW_CHECKPOINT_VERSION,projectId});
      const sha=sha256(content),savedAt=new Date().toISOString();
      await operation('readwrite',projectId,{version:WORKFLOW_CHECKPOINT_VERSION,content,sha256:sha,savedAt});
      const verified=await read(projectId);if(verified.sha256!==sha)throw failure('CHECKPOINT_READBACK_MISMATCH');
      return {ok:true,projectId,sha256:sha,byteLength:verified.byteLength,savedAt,durable:true};
    },
    read,
    async inspect(projectId){const saved=await read(projectId);return {ok:true,projectId,sha256:saved.sha256,byteLength:saved.byteLength,savedAt:saved.savedAt,durable:true,designRunIds:saved.bundle.reports.map(([id])=>id),interruptedJobs:saved.bundle.interruptedJobs||[]};},
  };
}
