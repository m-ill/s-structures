// Cancellation acknowledgement does not prove that a synchronous Worker stopped.
export const WORKER_CANCEL_GRACE_MS = 5000;

export async function runWithBoundedWorkerCancellation({signal,run,cancel,dispose,graceMs=WORKER_CANCEL_GRACE_MS}) {
  if (!Number.isFinite(graceMs) || graceMs < 0) throw new Error('INVALID_CANCEL_GRACE');
  const cancelled=()=>Object.assign(new Error('Worker cancellation required termination.'),{code:'CANCELLED',forcedTermination:true});
  if(signal?.aborted) throw Object.assign(new Error('Analysis cancelled before Worker start.'),{code:'CANCELLED'});
  let timer,termination,requested=false,rejectForced;
  const forced=new Promise((_,reject)=>{rejectForced=reject;});
  const abort=()=>{
    if(requested)return;requested=true;
    try { Promise.resolve(cancel()).catch(()=>{}); } catch { /* Still contain the Worker at the deadline. */ }
    timer=setTimeout(()=>{
      termination=Promise.resolve().then(dispose);
      termination.then(()=>rejectForced(cancelled()),rejectForced);
    },graceMs);
  };
  signal?.addEventListener?.('abort',abort,{once:true});
  try { return await Promise.race([Promise.resolve().then(()=>{
    if(signal?.aborted)throw Object.assign(new Error('Analysis cancelled before Worker start.'),{code:'CANCELLED'});
    return run();
  }),forced]); }
  finally {
    clearTimeout(timer);signal?.removeEventListener?.('abort',abort);
    // Do not start the next queued job before native termination settles.
    if(termination)await termination;
  }
}
