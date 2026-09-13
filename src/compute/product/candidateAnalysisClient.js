import {createModuleWorker,runBoundedWorkerTask} from '../../core/boundedWorkerTask.js';
import {workerBudgetObservers} from '../../core/workerBudgetObservers.js';
const createWorker=()=>createModuleWorker(new URL('./candidateAnalysisWorker.js',import.meta.url));
export const runRcSpliceWorker=args=>run({...args,operation:'rc-splice-model'});
export const runRcServiceWorker=args=>run({...args,operation:'rc-service-iteration'});
export const runCandidateAnalysis=args=>run({...args,operation:'analysis'});
export const runCandidateSpliceRefinement=args=>run({...args,operation:'candidate-splice-refinement'});
export const runCandidateGeometry=args=>run({...args,operation:'candidate-geometry'});
export const runCandidateEvaluation=args=>run({...args,operation:'evaluation'});
async function run({model,settings,sets,mechanicsLaw,operation,timeoutMs,signal,budget,workerReservationBytes,workerReservationOwner,workerFactory=createWorker}){
 // Independent of subscribers: a shared-computation caller can cancel while
 // this worker is still terminating or serving another subscriber.
 // A non-shared workflow can hand over its pre-clone reservation. Reserve on
 // the same owner so a failed termination quarantines the actual working set
 // without reserving a second identical copy.
 const owner=workerReservationOwner??budget?.nextOwner('candidate-worker-active');
 if(budget)budget.reserve(owner,workerReservationBytes);
 try{return await runBoundedWorkerTask({payload:{model,settings,sets,mechanicsLaw,operation},timeoutMs,signal,workerFactory,...(budget?workerBudgetObservers(budget,owner,'CANDIDATE_WORKER_EXIT_UNCONFIRMED'):{})});}
 catch(error){if(error.code?.startsWith('TASK_')){error.code=error.code.replace('TASK_','CANDIDATE_');error.message=error.code;}throw error;}
 finally{if(budget)budget.release(owner);}
}
