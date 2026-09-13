const unconfirmed=new Set(['WORKER_TERMINATION_UNCONFIRMED','CANDIDATE_WORKER_TERMINATION_FAILED','CANDIDATE_WORKER_TERMINATION_TIMEOUT']);
const infrastructure=new Set(['CANDIDATE_WORKER_UNAVAILABLE','CANDIDATE_WORKER_FAILED','CANDIDATE_WORKER_EXITED']);
export const isCandidateWorkerFailure=error=>unconfirmed.has(error?.code)||infrastructure.has(error?.code);
// Publish a small terminal record within the job's pre-reserved status space.
// Baseline evaluations and application receipts have separate owners.
export function recordCandidateWorkerFailure(job,error){
 job.discardedCandidateCount=job.candidates.length;job.candidates=[];job.best=null;
 job.status='failed';job.error=String(error.code||'WORKER_TERMINATION_UNCONFIRMED').slice(0,128);
 job.workerTerminationUnconfirmedAtFailure=unconfirmed.has(error.code);
}
