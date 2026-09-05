export const PUSHOVER_QUALIFICATION_REPORT_VERSION = 'p14-m10-pushover-qualification-report-v1';

export function buildPushoverQualificationReport(input = {}) {
  const result = input.result || null;
  const fixtureComparison = input.fixtureComparison || null;
  const rollbackAudit = input.rollbackAudit || null;
  return {
    version: PUSHOVER_QUALIFICATION_REPORT_VERSION,
    available: Boolean(result || fixtureComparison),
    productionRun: result ? {
      resultHash: result.resultHash,
      controlStrategy: result.control?.strategy,
      termination: result.termination,
      stepCount: result.summary?.stepCount,
      rejectedStepCount: result.summary?.rejectedStepCount,
      checkpointHash: result.internal?.handoffCheckpoint?.integrityHash || null,
      maximumBaseShear: result.summary?.maxBaseShear,
      maximumControlDisplacement: result.summary?.maxControlDisplacement,
    } : null,
    fixtureComparison,
    rollbackAudit,
    benchmarkExecutionStarted: false,
    designTransferAllowed: false,
    limitations: ['SP1 independent pre-peak comparison and post-peak production corpus remain separate release gates.'],
  };
}
