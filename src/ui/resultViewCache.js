import { stableHash } from '../core/stableHash.js';

// Computed views have an explicit preparation operation. Getters only read a
// snapshot; they never invoke a renderer, solver, or design calculator.
export function installResultViewCache(api, names, getIdentity) {
  const cache = new Map();
  const builders = new Map(names.filter(name => typeof api[name] === 'function').map(name => [name, api[name].bind(api)]));
  const key = (name, options) => stableHash({ name, options });
  for (const name of builders.keys()) api[name] = (options = {}) => {
    const row = cache.get(key(name, options));
    if (!row) return { ok: false, code: 'RESULT_REQUIRED', demandPackage: null, view: name, requiredOperation: 'prepareResultView' };
    if (row.identity !== getIdentity().inputHash) return { ok: false, code: 'STALE_INPUT', stale: true, view: name, designTransferAllowed: false };
    return structuredClone(row.result);
  };
  api.prepareResultView = (name, options = {}) => {
    if (!builders.has(name)) throw new Error('RESULT_VIEW_NOT_SUPPORTED');
    const identity = getIdentity().inputHash;
    const result = builders.get(name)(options);
    if (result?.ok === false && result?.code) return result;
    if (getIdentity().inputHash !== identity) throw new Error('STALE_INPUT');
    cache.set(key(name, options), { identity, result: structuredClone(result) });
    return structuredClone(result);
  };
  return api;
}

export const COMPUTED_RESULT_VIEWS = Object.freeze([
  'getReport', 'getDetailedReport', 'getCalculationPackage', 'getCombinationEnvelopeContract',
  'getRcDetailingReport', 'getRcDetailedDesignReport', 'getSteelDetailingReport', 'getP3DetailedDesignReport',
  'getP3IntegratedResults', 'getConnectionFoundationReport', 'getMemberDesignTraceReport',
  'getDesignDemandPackage', 'getPracticePlatformReadiness', 'getPracticeValidationReport',
  'getServiceabilityDriftReport', 'getAdvancedElasticTrace', 'getResultPostprocessing',
  'getWallSlabEquivalentTrace',
  'getDynamicCompletenessTrace', 'getNonlinearAnalysisTrace',
]);
