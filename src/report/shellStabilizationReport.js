export const SHELL_STABILIZATION_REPORT_VERSION = 'p14-m9-shell-stabilization-report-v1';

export function buildShellStabilizationReport(qualification = null) {
  return {
    version: SHELL_STABILIZATION_REPORT_VERSION,
    available: Boolean(qualification),
    status: qualification?.status || 'not-run',
    qualificationHash: qualification?.qualificationHash || null,
    blockers: qualification?.blockers || [],
    modes: qualification?.modes || [],
    claim: qualification?.claim || { id: 'P3S2-SS', crossSolverEquivalent: false },
    benchmarkExecutionStarted: false,
    designTransferAllowed: false,
    limitations: ['P3S2-SS is a custom S-Structures stabilization criterion and is not claimed as STRIX P3S2 equivalence.'],
  };
}
