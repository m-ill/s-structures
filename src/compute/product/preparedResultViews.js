import { stableHash } from '../../core/stableHash.js';

export const PREPARED_RESULT_VIEW_VERSION = 'p20-prepared-result-view-v1';

// One bounded preparation store. Reads never call builders or schedule work.
export function installResultViewCache(api, names, getIdentity, options = {}) {
  const cache = new Map(), pending = new Map(), activeWork = new Set();
  const builders = new Map(names.filter(name => typeof api[name] === 'function').map(name => [name, api[name].bind(api)]));
  const inputBuilders = new Map(Object.entries(options.inputBuilders || {}));
  const maxEntries = options.maxEntries ?? 32, maxBytes = options.maxBytes ?? 16 * 1024 * 1024;
  if (!Number.isInteger(maxEntries) || maxEntries < 1 || !Number.isInteger(maxBytes) || maxBytes < 1) throw new Error('INVALID_RESULT_VIEW_BUDGET');
  let bytes = 0, generation = 0, modelKey = options.getModelKey?.();
  function checkModel() {
    const current = options.getModelKey?.();
    if (current !== modelKey) { modelKey=current;generation++;cache.clear();pending.clear();bytes=0; }
  }
  const identity = input => stableHash(input ? (options.getInputIdentity || getIdentity)() : getIdentity());
  const key = (name, input, args) => stableHash({version:PREPARED_RESULT_VIEW_VERSION,name,input,args});
  const missing = name => ({ok:false,code:'RESULT_REQUIRED',demandPackage:null,view:name,requiredOperation:inputBuilders.has(name)?'prepareInputDiagnostics':'prepareResultView'});
  const stale = name => ({ok:false,code:'STALE_INPUT',stale:true,view:name,designTransferAllowed:false});
  function read(name, args = {}, input = false) {
    checkModel();
    const row = cache.get(key(name,input,args));
    if (!row) return missing(name);
    if (row.identity !== identity(input)) return stale(name);
    return structuredClone(row.result);
  }
  function prepare(name, args = {}, input = false) {
    checkModel();
    const builder = (input ? inputBuilders : builders).get(name);
    if (!builder) throw new Error('RESULT_VIEW_NOT_SUPPORTED');
    const copiedArgs = structuredClone(args), id = identity(input), k = key(name,input,copiedArgs);
    const cached = cache.get(k);
    if (cached?.identity === id) return structuredClone(cached.result);
    const inFlight = pending.get(k);
    if (inFlight?.identity === id) return inFlight.promise.then(value=>structuredClone(value));
    if (activeWork.size >= maxEntries) return {ok:false,code:'RESULT_VIEW_BUSY',view:name};
    const startedGeneration = generation;
    const finish = result => {
      checkModel();
      if (generation !== startedGeneration || identity(input) !== id) throw Object.assign(new Error('STALE_INPUT'),{code:'STALE_INPUT'});
      if (result?.ok === false && result?.code) return structuredClone(result);
      const copy = structuredClone(result);
      const size = new TextEncoder().encode(JSON.stringify(copy) ?? 'null').byteLength;
      if (size > maxBytes) return {ok:false,code:'RESULT_VIEW_TOO_LARGE',view:name,maxBytes};
      if (cache.has(k)) { bytes -= cache.get(k).bytes; cache.delete(k); }
      while (cache.size && (cache.size >= maxEntries || bytes + size > maxBytes)) {
        const oldest = cache.keys().next().value; bytes -= cache.get(oldest).bytes; cache.delete(oldest);
      }
      cache.set(k,{identity:id,result:copy,bytes:size}); bytes += size;
      return structuredClone(copy);
    };
    const result = builder(copiedArgs);
    if (!result || typeof result.then !== 'function') return finish(result);
    const record = {identity:id,promise:null};
    activeWork.add(record);
    record.promise = Promise.resolve(result).then(finish).finally(()=>{activeWork.delete(record);if(pending.get(k)===record)pending.delete(k);});
    pending.set(k,record);
    return record.promise.then(value=>structuredClone(value));
  }
  for (const name of builders.keys()) api[name] = args => read(name,args);
  api.prepareResultView = (name,args) => prepare(name,args);
  api.prepareInputDiagnostics = (name,args) => prepare(name,args,true);
  api.getPreparedInputDiagnostics = (name,args) => read(name,args,true);
  api.clearResultViews = () => {generation += 1;cache.clear();pending.clear();bytes=0;};
  api.getResultViewCacheStats = () => ({version:PREPARED_RESULT_VIEW_VERSION,entries:cache.size,bytes,pending:pending.size,maxEntries,maxBytes});
  return api;
}

export const COMPUTED_RESULT_VIEWS = Object.freeze([
  'getReport', 'getDetailedReport', 'getCalculationPackage', 'getCombinationEnvelopeContract',
  'getRcDetailingReport', 'getRcDetailedDesignReport', 'getSteelDetailingReport', 'getP3DetailedDesignReport',
  'getP3IntegratedResults', 'getConnectionFoundationReport', 'getMemberDesignTraceReport',
  'getDesignDemandPackage', 'getPracticePlatformReadiness', 'getPracticeValidationReport',
  'getServiceabilityDriftReport', 'getAdvancedElasticTrace', 'getResultPostprocessing',
  'getWallSlabEquivalentTrace', 'getDynamicCompletenessTrace', 'getNonlinearAnalysisTrace',
  'getPilotProjectValidation', 'getMemberReleaseBenchmark', 'getRigidDiaphragmBenchmark',
]);
