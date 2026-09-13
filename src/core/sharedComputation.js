const error=code=>Object.assign(new Error(code),{code});
// Callers retain their admission reservations while subscribed.
export function createSharedComputation({maxActive=4}={}){
 const pending=new Map();let started=0,joined=0;
 function remove(key,row){if(pending.get(key)===row)pending.delete(key);}
 function settle(key,row,value,failure){remove(key,row);for(const subscriber of [...row.subscribers])subscriber.finish(value,failure);}
 return {
  run(key,produce,signal){
   if(signal?.aborted)return Promise.reject(error('CANCELLED'));
   let row=pending.get(key);
   if(!row){
    if(pending.size>=maxActive)return Promise.reject(error('SHARED_COMPUTATION_LIMIT'));
    row={controller:new AbortController(),subscribers:new Set()};pending.set(key,row);started++;
    Promise.resolve().then(()=>{if(row.controller.signal.aborted)throw error('CANCELLED');return produce(row.controller.signal);}).then(value=>settle(key,row,value),failure=>settle(key,row,null,failure));
   }else joined++;
   return new Promise((resolve,reject)=>{
    const subscriber={finish(value,failure){signal?.removeEventListener('abort',abort);row.subscribers.delete(subscriber);failure?reject(failure):resolve(value);}};
    const abort=()=>{subscriber.finish(null,error('CANCELLED'));if(!row.subscribers.size){remove(key,row);row.controller.abort();}};
    row.subscribers.add(subscriber);signal?.addEventListener('abort',abort,{once:true});
   });
  },
  snapshot:()=>({active:pending.size,started,joined,maxActive}),
  clear(){for(const [key,row] of [...pending]){settle(key,row,null,error('CANCELLED'));row.controller.abort();}},
 };
}
