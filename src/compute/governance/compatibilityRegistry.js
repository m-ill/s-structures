export const PHASE9_COMPATIBILITY_REGISTRY_VERSION = 'p9-m10-compatibility-registry-v1';

export const PHASE9_COMPATIBILITY_REGISTRY = deepFreeze([
  entry({
    id: 'P9-COMPAT-SYNC-ANALYSIS',
    owner: 'product-analysis-service',
    module: 'src/compute/compatibility/syncFacade.js',
    symbols: ['analyzeModelSyncCompatibility'],
    allowedCallers: [],
    replacement: 'src/compute/product/analysisProductService.js',
    status: 'test-verification-only',
    removalGate: 'TEST_FIXTURE_MIGRATION',
  }),
  entry({
    id: 'P9-COMPAT-LEGACY-SNAPSHOT',
    owner: 'product-analysis-service',
    module: 'src/compute/product/legacyUiCompatibility.js',
    symbols: ['analyzeLegacyUiSnapshot'],
    allowedCallers: ['src/ui/indexBridge.js', 'src/ui/indexAgentApi.js', 'src/ui/m3State.js'],
    replacement: 'startAnalysisRun/getAnalysisRunStatus/getAnalysisRunResult',
    status: 'retained-approved-compatibility',
    removalGate: 'PUBLIC_API_BREAK_APPROVAL_REQUIRED',
  }),
  entry({
    id: 'P9-COMPAT-LEGACY-PUSHOVER',
    owner: 'product-analysis-service',
    module: 'src/compute/product/legacyUiCompatibility.js',
    symbols: ['runLegacyUiPushover'],
    allowedCallers: ['src/ui/indexBridge.js', 'src/ui/indexAgentApi.js'],
    replacement: 'startAnalysisRun/getAnalysisRunStatus/getAnalysisRunResult',
    status: 'retained-approved-compatibility',
    removalGate: 'PUBLIC_API_BREAK_APPROVAL_REQUIRED',
  }),
  entry({
    id: 'P9-COMPAT-P8-WORKER-PROTOCOL',
    owner: 'worker-runtime',
    module: 'src/nonlinear/product/jobManager.js',
    symbols: ['p8-m10-worker-protocol-v4'],
    allowedCallers: ['src/nonlinear/product/jobManager.js'],
    replacement: 'p9-compute-worker-protocol-v1',
    status: 'retained-approved-compatibility',
    removalGate: 'PERSISTED_JOB_PROTOCOL_MIGRATION',
  }),
  entry({
    id: 'P9-COMPAT-PUBLIC-NONLINEAR',
    owner: 'product-analysis-service',
    module: 'src/index.js',
    symbols: [],
    publicSymbols: [
      'runPushover',
      'runFormalPushover',
      'runNewmarkNlth',
      'runLegacyPreliminaryPushover',
      'runLegacySdofNewmarkTrace',
    ],
    allowedCallers: [],
    replacement: 'createAnalysisProductService',
    status: 'retained-approved-compatibility',
    removalGate: 'PUBLIC_API_BREAK_APPROVAL_REQUIRED',
  }),
]);

export function auditPhase9Compatibility({ callers = [], publicSymbols = [] } = {}) {
  const bySymbol = new Map();
  for (const row of PHASE9_COMPATIBILITY_REGISTRY) {
    for (const symbol of row.symbols) bySymbol.set(symbol, row);
  }
  const unexpectedCallers = [];
  const expiredCallers = [];
  for (const caller of callers) {
    const registration = bySymbol.get(caller.symbol);
    if (!registration || !registration.allowedCallers.includes(caller.caller)) {
      unexpectedCallers.push({ ...caller, registrationId: registration?.id || null });
      continue;
    }
    if (registration.status === 'expired') expiredCallers.push({ ...caller, registrationId: registration.id });
  }
  const registeredPublic = new Set(PHASE9_COMPATIBILITY_REGISTRY.flatMap((row) => row.publicSymbols));
  const unregisteredPublicSymbols = publicSymbols.filter((symbol) => !registeredPublic.has(symbol));
  const ownerless = PHASE9_COMPATIBILITY_REGISTRY.filter((row) => !row.owner || !row.removalGate).map((row) => row.id);
  return Object.freeze({
    version: PHASE9_COMPATIBILITY_REGISTRY_VERSION,
    ok: unexpectedCallers.length === 0 && expiredCallers.length === 0 && unregisteredPublicSymbols.length === 0 && ownerless.length === 0,
    registeredEntries: PHASE9_COMPATIBILITY_REGISTRY.length,
    approvedCallerCount: callers.length - unexpectedCallers.length,
    unexpectedCallers,
    expiredCallers,
    unregisteredPublicSymbols,
    ownerless,
  });
}

function entry(input) {
  return {
    reviewedAtMilestone: 'P9-M10',
    reviewBy: 'Phase10',
    designTransferAllowed: false,
    productDefaultAllowed: false,
    publicSymbols: [],
    ...input,
  };
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
