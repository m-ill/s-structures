export const RESOURCE_BUDGET_VERSION = 'p21-managed-memory-v1';
const MiB=1024*1024;
export const DEFAULT_RESOURCE_BUDGETS=Object.freeze({managedBytes:256*MiB,workerAdmissionBytes:512*MiB,analysisQueue:8,reportReaders:2,reportQueue:8});
// Conservative retained-data accounting; this is not a measurement of the JS heap.
export function retainedBytes(value,seen=new Set()) {
  if(value==null)return 8;
  if(typeof value==='string')return 24+value.length*2;
  if(typeof value!=='object')return 8;
  if(seen.has(value))return 0;seen.add(value);
  if(ArrayBuffer.isView(value))return 64+retainedBytes(value.buffer,seen);
  if(value instanceof ArrayBuffer)return 32+value.byteLength;
  if(value instanceof Map)return 64+[...value].reduce((sum,[key,item])=>sum+retainedBytes(key,seen)+retainedBytes(item,seen),0);
  if(value instanceof Set)return 64+[...value].reduce((sum,item)=>sum+retainedBytes(item,seen),0);
  return 64+Object.entries(value).reduce((sum,[key,item])=>sum+retainedBytes(key,seen)+retainedBytes(item,seen),0);
}
export function createResourceBudget({maxBytes=DEFAULT_RESOURCE_BUDGETS.managedBytes}={}) {
  if(!Number.isSafeInteger(maxBytes)||maxBytes<1)throw new Error('RESOURCE_BUDGET_INVALID');
  const owners=new Map();let total=0,peak=0,sequence=0;
  return Object.freeze({
    nextOwner:name=>`${name}:${++sequence}`,
    reserve(owner,bytes) {
      if(!Number.isSafeInteger(bytes)||bytes<0)throw new Error('RESOURCE_SIZE_INVALID');
      const proposed=total-(owners.get(owner)||0)+bytes;
      if(proposed>maxBytes)throw Object.assign(new Error('MANAGED_MEMORY_BUDGET_EXCEEDED'),{code:'MANAGED_MEMORY_BUDGET_EXCEEDED',details:{owner,requestedBytes:bytes,totalBytes:total,maxBytes}});
      owners.set(owner,bytes);total=proposed;peak=Math.max(peak,total);
    },
    release(owner){total-=owners.get(owner)||0;owners.delete(owner);},
    snapshot:()=>({version:RESOURCE_BUDGET_VERSION,accounting:'conservative-retained-data-estimate',maxBytes,totalBytes:total,peakBytes:peak,owners:Object.fromEntries(owners)}),
  });
}
export class BudgetMap extends Map {
  constructor(budget,name,{maxEntries=128,maxBytes=Infinity,measure=retainedBytes}={}) {super();this.budget=budget;this.owner=budget.nextOwner(name);this.sizes=new Map();this.bytes=0;this.maxEntries=maxEntries;this.maxBytes=maxBytes;this.measure=measure;}
  set(key,value) {
    if(!this.has(key)&&this.size>=this.maxEntries)throw Object.assign(new Error('RESOURCE_ENTRY_LIMIT'),{code:'RESOURCE_ENTRY_LIMIT',owner:this.owner});
    const size=this.measure([key,value]),bytes=this.bytes-(this.sizes.get(key)||0)+size;
    if(bytes>this.maxBytes)throw Object.assign(new Error('RESOURCE_STORE_BUDGET_EXCEEDED'),{code:'RESOURCE_STORE_BUDGET_EXCEEDED',owner:this.owner});
    this.budget.reserve(this.owner,bytes);this.bytes=bytes;this.sizes.set(key,size);return super.set(key,value);
  }
  setCopy(key,value) {
    const previous=this.get(key),existed=this.has(key);
    this.set(key,value); // Reserve retained bytes before allocating the isolated copy.
    try {super.set(key,structuredClone(value));return this;} catch(error){if(existed)this.set(key,previous);else this.delete(key);throw error;}
  }
  delete(key){if(!this.has(key))return false;this.bytes-=this.sizes.get(key)||0;this.sizes.delete(key);const result=super.delete(key);this.budget.reserve(this.owner,this.bytes);return result;}
  clear(){super.clear();this.sizes.clear();this.bytes=0;this.budget.release(this.owner);}
  refresh(key){if(this.has(key))this.set(key,this.get(key));}
}
export function createBoundedQueue({activeLimit=2,queueLimit=8}={}) {
  let active=0,disposed=false;const queue=[];
  const error=code=>Object.assign(new Error(code),{code});
  function pump(){while(!disposed&&active<activeLimit&&queue.length){const item=queue.shift();active++;Promise.resolve().then(()=>{if(disposed)throw error('QUEUE_DISPOSED');return item.run();}).then(item.resolve,item.reject).finally(()=>{active--;pump();});}}
  return {run(run){if(disposed)return Promise.reject(error('QUEUE_DISPOSED'));if(active>=activeLimit&&queue.length>=queueLimit)return Promise.reject(error('RESOURCE_QUEUE_FULL'));return new Promise((resolve,reject)=>{queue.push({run,resolve,reject});pump();});},snapshot:()=>({active,queued:queue.length,activeLimit,queueLimit}),dispose(){disposed=true;for(const item of queue.splice(0))item.reject(error('QUEUE_DISPOSED'));}};
}
