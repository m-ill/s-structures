import { getNonlinearCapability } from '../capabilities.js';

// A numerical result cannot approve itself. No independent qualification bundle
// is currently installed for these engines; successful runs stay candidate.
export function resolveProductQualification({engineId,ok,stale=false,modelHash,settingsHash,buildIdentity}) {
  const capability=getNonlinearCapability(engineId);
  return {
    qualification:!ok?'invalid':capability?.production?'candidate':'unsupported',
    designBlocked:true,designTransferAllowed:false,
    designBlockReason:!ok?'NONLINEAR_RUN_FAILED':stale?'NONLINEAR_RESULT_STALE':'P19_INDEPENDENT_QUALIFICATION_PENDING',
    qualificationBinding:{engineId,modelHash,settingsHash,buildIdentity},
  };
}
