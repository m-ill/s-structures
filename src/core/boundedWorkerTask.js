const failure=code=>Object.assign(new Error(code),{code});
export async function createModuleWorker(url){
 if(typeof Worker!=='undefined')return new Worker(url,{type:'module'});
 if(typeof process!=='undefined'&&process.versions?.node){const {Worker:NodeWorker}=await import('node:worker_threads');return new NodeWorker(url,{type:'module'});}
 throw failure('TASK_WORKER_UNAVAILABLE');
}
export async function runBoundedWorkerTask({payload,timeoutMs,terminationTimeoutMs=1000,signal,workerFactory,onTerminationUnconfirmed,onTerminationConfirmed}){
 if(signal?.aborted)throw failure('CANCELLED');
 if(!Number.isFinite(timeoutMs)||timeoutMs<=0)throw failure('TASK_TIMEOUT');
 if(!Number.isFinite(terminationTimeoutMs)||terminationTimeoutMs<=0||terminationTimeoutMs>30000)throw failure('TASK_TERMINATION_TIMEOUT_INVALID');
 return new Promise((resolve,reject)=>{
  let done=false,timer,worker,exitConfirmed=false,quarantined=false,factoryPending=false;
  const proofExit=()=>{exitConfirmed=true;if(quarantined){quarantined=false;onTerminationConfirmed?.();}};
  const unconfirmed=()=>{if(quarantined)return;try{onTerminationUnconfirmed?.();quarantined=!!onTerminationUnconfirmed;}catch{/* Preserve task settlement if an observer fails. */}};
  const terminate=w=>{try{return Promise.resolve(w?.terminate());}catch(error){return Promise.reject(error);}};
  const cleanup=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);if(worker?.removeEventListener){worker.removeEventListener('message',message);worker.removeEventListener('error',error);}else{worker?.off?.('message',message);worker?.off?.('error',error);worker?.off?.('exit',exit);}return terminate(worker);};
  const finish=(err,value)=>{
   if(done)return;done=true;
   const finishingWorker=worker;
   if(!worker&&factoryPending)unconfirmed();
   if(onTerminationUnconfirmed)worker?.once?.('exit',proofExit);
   const settle=()=>{finishingWorker?.off?.('exit',proofExit);err?reject(err):resolve(value);};
   let terminationExpired=false;
   const terminationTimer=setTimeout(()=>{
    if(exitConfirmed){settle();return;}
    terminationExpired=true;unconfirmed();
    reject(failure('TASK_WORKER_TERMINATION_TIMEOUT'));
   },terminationTimeoutMs);
   cleanup().then(()=>{
    clearTimeout(terminationTimer);
    if(terminationExpired){finishingWorker?.off?.('exit',proofExit);proofExit();}else settle();
   },()=>{
    clearTimeout(terminationTimer);
    if(exitConfirmed){if(!terminationExpired)settle();return;}
    unconfirmed();
    if(!terminationExpired)reject(failure('TASK_WORKER_TERMINATION_FAILED'));
   });
  };
  const abort=()=>finish(failure('CANCELLED'));
  const message=event=>{const data=worker.addEventListener?event.data:event;data?.ok?finish(null,data.result):finish(failure(data?.code||'TASK_WORKER_FAILED'));};
  const error=()=>finish(failure('TASK_WORKER_FAILED'));
  const exit=()=>{exitConfirmed=true;finish(failure('TASK_WORKER_EXITED'));};
  signal?.addEventListener('abort',abort,{once:true});
  if(signal?.aborted){abort();return;}
  timer=setTimeout(()=>finish(failure('TASK_TIMEOUT')),timeoutMs);
  factoryPending=true;
  Promise.resolve().then(()=>done?null:workerFactory()).then(created=>{
   factoryPending=false;
   if(done){
    if(onTerminationUnconfirmed)created?.once?.('exit',proofExit);
    terminate(created).then(()=>{created?.off?.('exit',proofExit);proofExit();},()=>{if(exitConfirmed)created?.off?.('exit',proofExit);else unconfirmed();});
    return;
   }worker=created;
   if(worker.addEventListener){worker.addEventListener('message',message);worker.addEventListener('error',error);}else{worker.on('message',message);worker.on('error',error);worker.on('exit',exit);}
   try{worker.postMessage(payload);}catch{finish(failure('TASK_WORKER_INPUT_FAILED'));}
  }).catch(error=>{factoryPending=false;if(done){proofExit();return;}finish(failure(error?.code||'TASK_WORKER_UNAVAILABLE'));});
 });
}
