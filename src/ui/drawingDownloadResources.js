import {createResourceBudget} from '../core/resourceBudget.js';
const fail=code=>{throw Object.assign(Error(code),{code});};

// Main UI passes its shared budget. Standalone hosts receive a bounded budget.
// Reserve the assembled bytes, Blob copy and bounded base64/chunk overhead.
export function createDrawingDownloadResources({target,budget=createResourceBudget()}){
 const leases=new Set();
 const free=entry=>{if(entry.done&&entry.url===null){budget.release(entry.owner);leases.delete(entry);}};
 const revoke=entry=>{
  if(entry.timer!==null){target.clearTimeout?.(entry.timer);entry.timer=null;}
  if(entry.url!==null){
   try{target.URL.revokeObjectURL(entry.url);}catch{return false;}
   entry.url=null;
  }
  free(entry);return true;
 };
 return {
  acquire(byteLength){
   if(!Number.isSafeInteger(byteLength)||byteLength<1||byteLength>32*1024*1024)fail('DRAWING_ARTIFACT_SIZE_LIMIT');
   if(leases.size>=8)fail('DRAWING_DOWNLOAD_RESOURCE_LIMIT');
   const owner=budget.nextOwner('practical-drawing-download');
   budget.reserve(owner,byteLength*2+65536);
   const entry={owner,url:null,timer:null,done:false};leases.add(entry);
   return {
    createUrl(bytes,mime){
     if(entry.done||entry.url!==null)fail('DRAWING_DOWNLOAD_LEASE_INVALID');
     if(!(bytes instanceof Uint8Array)||bytes.byteLength!==byteLength)fail('DRAWING_ARTIFACT_SIZE_LIMIT');
     entry.url=target.URL.createObjectURL(new target.Blob([bytes],{type:mime}));
     const url=entry.url;
     try{entry.timer=target.setTimeout(()=>revoke(entry),1000);}catch(error){revoke(entry);throw error;}
     return url;
    },
    release(){entry.done=true;free(entry);},
   };
  },
  // A pending read still owns its buffer until its caller's finally runs.
  // Failed URL revocation retains the reservation and can be retried here.
  clearUrls(){for(const entry of [...leases])revoke(entry);},
 };
}
