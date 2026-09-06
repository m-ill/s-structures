export const PHASE8_PERFORMANCE_BASELINE_VERSION = 'p8-m0-performance-baseline-v1';
export const PHASE8_REFERENCE_PROFILE_VERSION = 'p8-m0-reference-profile-v1';
export const PHASE8_WORKLOAD_FIXTURE_VERSION = 'p8-m0-workload-fixtures-v1';

export const PHASE8_REFERENCE_PROFILE_CONTRACT = Object.freeze({
  version: PHASE8_REFERENCE_PROFILE_VERSION,
  requiredFields: Object.freeze([
    'hardware.cpu',
    'hardware.logicalCores',
    'hardware.memoryBytes',
    'os.platform',
    'os.release',
    'browser.name',
    'browser.version',
    'browser.userAgent',
    'powerMode',
    'backend.id',
    'backend.build',
  ]),
  samplePolicy: Object.freeze({ warmupRuns: 1, measuredRuns: 5, statistics: ['median', 'p95', 'peakMemoryBytes', 'resultBytes'] }),
});

export const PHASE8_WORKLOAD_FIXTURES = Object.freeze([
  workload('PERF-PUSH-S', 'S', 1000, 1500, { gravitySteps: 10, savedSteps: 50 }),
  workload('PERF-PUSH-M', 'M', 10000, 15000, { gravitySteps: 20, savedSteps: 100 }),
  workload('PERF-PUSH-L', 'L', 50000, 75000, { gravitySteps: 20, savedSteps: 100, limitedAssignments: true }),
  workload('PERF-NLTH-S', 'S', 1000, 1500, { inputSteps: 5000, activeComponents: 1 }),
  workload('PERF-NLTH-M', 'M', 10000, 15000, { minimumActiveDof: 5000, inputSteps: 20000 }),
  workload('PERF-RESULT-M', 'M', 10000, 15000, { operations: ['history-slice', 'chart', 'envelope', 'report'] }),
]);

export const PHASE8_UX_PERFORMANCE_BUDGET = Object.freeze({
  version: PHASE8_PERFORMANCE_BASELINE_VERSION,
  inputAcknowledgementP95Ms: 100,
  progressUpdateMaxMs: 1000,
  cancelAcknowledgementMaxMs: 2000,
  mediumPreflightMaxMs: 5000,
  cachedPopupInitialRenderMaxMs: 500,
  chartInteractionP95Ms: 100,
  memoryAvailableFractionMax: 0.6,
  engineeringTargets: Object.freeze({
    pushMediumMaxMs: 10 * 60 * 1000,
    nlthMediumMaxMs: 30 * 60 * 1000,
    peakAnalysisMemoryMaxBytes: Math.trunc(1.5 * 1024 ** 3),
  }),
  status: 'contract-fixed-baseline-measurement-pending-production-backend',
});

export function buildPhase8PerformanceBaseline() {
  return {
    version: PHASE8_PERFORMANCE_BASELINE_VERSION,
    referenceProfileContract: PHASE8_REFERENCE_PROFILE_CONTRACT,
    workloads: PHASE8_WORKLOAD_FIXTURES,
    budget: PHASE8_UX_PERFORMANCE_BUDGET,
  };
}

function workload(id, tier, activeDofMax, elementMax, execution) {
  return Object.freeze({
    version: PHASE8_WORKLOAD_FIXTURE_VERSION,
    id,
    tier,
    limits: Object.freeze({ activeDofMax, elementMax }),
    execution: Object.freeze(execution),
  });
}
