export function workerBudgetObservers(budget,owner,reason='WORKER_EXIT_UNCONFIRMED'){
 return {onTerminationUnconfirmed:()=>budget.quarantine(owner,reason),onTerminationConfirmed:()=>budget.confirmTermination(owner)};
}
