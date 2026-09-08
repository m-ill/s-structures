import { stableHash } from '../../core/stableHash.js';
import { analyzeModel } from '../product/elasticAnalysisWorkflow.js';
import { prepareAnalysisContracts } from '../adapters/analysisAdapters.js';

export const SYNC_ANALYSIS_COMPATIBILITY_VERSION = 'p9-sync-analysis-compatibility-v2';
export const SYNC_ANALYSIS_COMPATIBILITY_POLICY = Object.freeze({
  owner: 'product-analysis-service',
  introduced: 'P9-M1',
  expires: 'P9-M9',
  deleteBy: 'P9-M10',
  maxNodes: 40,
  maxMembers: 80,
  maxDof: 240,
  workloadClass: 'S',
  productionUiAllowed: false,
  gpuAllowed: false,
});

export const SYNC_ANALYSIS_DEPRECATION_INVENTORY = Object.freeze([
  Object.freeze({
    id: 'P9-DEPRECATION-SYNC-ANALYZE-MODEL',
    symbol: 'analyzeModel',
    currentOwner: 'src/solver/linear3d.js',
    replacement: 'ComputeWorkerClient.start(AnalysisExecutionPlan)',
    allowedCallers: Object.freeze(['tests', 'verification', 'compatibility']),
    expires: SYNC_ANALYSIS_COMPATIBILITY_POLICY.expires,
  }),
  Object.freeze({
    id: 'P9-DEPRECATION-P8-WORKER-PROTOCOL',
    symbol: 'p8-m10-worker-protocol-v4',
    currentOwner: 'src/nonlinear/runtime',
    replacement: 'p9-compute-worker-protocol-v1',
    allowedCallers: Object.freeze(['src/nonlinear/product/jobManager.js', 'tests/p8-*']),
    expires: SYNC_ANALYSIS_COMPATIBILITY_POLICY.deleteBy,
  }),
]);

export function analyzeModelSyncCompatibility(model, options = {}) {
  const caller = String(options.caller || '').trim();
  if (!caller) throw compatibilityError('SYNC_COMPATIBILITY_CALLER_REQUIRED', 'Compatibility calls must declare an owner.');
  if (options.productUi === true) {
    throw compatibilityError('SYNC_COMPATIBILITY_UI_FORBIDDEN', 'Product UI must use the asynchronous compute service.');
  }
  if (options.production === true) {
    throw compatibilityError('SYNC_COMPATIBILITY_PRODUCTION_FORBIDDEN', 'Production analysis must use the asynchronous compute service.');
  }
  if (String(options.computeTarget || 'cpu').toLowerCase() === 'gpu') {
    throw compatibilityError('SYNC_COMPATIBILITY_GPU_FORBIDDEN', 'GPU execution cannot be routed through the synchronous compatibility facade.');
  }
  const nodes = Array.isArray(model?.nodes) ? model.nodes.length : 0;
  const members = Array.isArray(model?.members) ? model.members.length : 0;
  if (nodes > SYNC_ANALYSIS_COMPATIBILITY_POLICY.maxNodes || members > SYNC_ANALYSIS_COMPATIBILITY_POLICY.maxMembers) {
    throw compatibilityError('SYNC_COMPATIBILITY_SIZE_LIMIT', 'Model exceeds the temporary synchronous compatibility limit.');
  }
  const contracts = prepareAnalysisContracts(model);
  const result = analyzeModel(model);
  const trace = Object.freeze({
    version: SYNC_ANALYSIS_COMPATIBILITY_VERSION,
    caller,
    warning: 'DEPRECATED_S_TIER_SYNC_COMPATIBILITY',
    workloadClass: 'S',
    domainHash: contracts.domain.domainHash,
    patternHash: contracts.sparsePattern.patternHash,
    resultHash: stableHash(result),
    expires: SYNC_ANALYSIS_COMPATIBILITY_POLICY.expires,
  });
  options.onWarning?.(trace);
  options.onTrace?.(trace);
  return result;
}

export function listSyncAnalysisDeprecations() {
  return SYNC_ANALYSIS_DEPRECATION_INVENTORY.map((row) => ({ ...row, allowedCallers: [...row.allowedCallers] }));
}

function compatibilityError(code, message) {
  return Object.assign(new Error(message), { code });
}
