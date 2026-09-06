import { createElasticAnalysisService } from './elasticAnalysisService.js';
import {
  beginPhase13AnalysisRun,
  cancelPhase13AnalysisRun,
  completePhase13AnalysisRun,
  createPhase13AnalysisRunStore,
  failPhase13AnalysisRun,
  getPhase13RunState,
  updatePhase13AnalysisRunProgress,
} from '../../core/phase13AnalysisRuns.js';

export const UNIFIED_ELASTIC_RUN_SERVICE_VERSION = 'p13-m1-unified-elastic-run-service-v1';

export function createUnifiedElasticRunService(options = {}) {
  const elastic = options.elasticService || createElasticAnalysisService(options.elasticOptions || {});
  const listeners = new Set();
  let store = createPhase13AnalysisRunStore(options.store);
  let sequence = 0;

  return Object.freeze({
    version: UNIFIED_ELASTIC_RUN_SERVICE_VERSION,
    run,
    cancel,
    getStore: () => clone(store),
    getCaseState: (model, analysisCase, stateOptions = {}) => getPhase13RunState(store, { model, analysisCase, ...stateOptions }),
    subscribe(listener) {
      if (typeof listener !== 'function') return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose: () => elastic.dispose?.(),
  });

  async function run(model, analysisCase = {}, runOptions = {}) {
    const runId = String(runOptions.runId || `elastic-${Date.now()}-${++sequence}`);
    const startedAt = runOptions.startedAt || new Date().toISOString();
    ({ store } = beginPhase13AnalysisRun(store, { model, analysisCase, ...runOptions, runId, startedAt }));
    publish('run-started', runId);
    const onProgress = (progress) => {
      store = updatePhase13AnalysisRunProgress(store, runId, progress);
      runOptions.onProgress?.(progress);
      publish('run-progress', runId);
    };
    try {
      const result = analysisCase?.settings?.comboId && typeof elastic.runCombination === 'function'
        ? await elastic.runCombination(model, analysisCase.settings.comboId, { ...runOptions, runId, caseId: analysisCase.id, onProgress })
        : await elastic.run(model, { ...runOptions, runId, caseId: analysisCase.id, onProgress });
      store = completePhase13AnalysisRun(store, runId, {
        model,
        analysisCase,
        result,
        finishedAt: runOptions.finishedAt || new Date().toISOString(),
      });
      publish('run-completed', runId);
      return { run: clone(store.runs[runId]), result: clone(result), store: clone(store) };
    } catch (error) {
      if (store.runs[runId]?.status === 'running') {
        store = isCancellation(error)
          ? cancelPhase13AnalysisRun(store, runId, { model, analysisCase, code: error.code, message: error.message })
          : failPhase13AnalysisRun(store, runId, {
            model,
            analysisCase,
            result: { code: error.code || 'ANALYSIS_FAILED', message: error.message },
            finishedAt: new Date().toISOString(),
          });
        publish(isCancellation(error) ? 'run-cancelled' : 'run-failed', runId);
      }
      error.phase13RunId = runId;
      throw error;
    }
  }

  function cancel(runId = store.activeRunId) {
    if (!runId || store.runs[runId]?.status !== 'running') return false;
    elastic.cancel?.(runId);
    store = cancelPhase13AnalysisRun(store, runId, {});
    publish('run-cancelled', runId);
    return true;
  }

  function publish(event, runId) {
    const snapshot = clone(store);
    const record = clone(store.runs[runId]);
    listeners.forEach((listener) => listener({ event, runId, record, store: snapshot }));
  }
}

function isCancellation(error) {
  return ['ANALYSIS_CANCELLED', 'WORKER_RUN_CANCELLED', 'WORKER_CANCELLED'].includes(error?.code)
    || error?.name === 'AbortError';
}

function clone(value) {
  return value == null ? value : (typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)));
}
