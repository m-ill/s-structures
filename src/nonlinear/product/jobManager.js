import { stableHash } from '../../core/stableHash.js';
import { resolveProductQualification } from './qualification.js';
import { runNonlinearAnalysisCaseAsync } from '../analysisRouter.js';
import { applyHingeAssignmentChangeSet } from '../properties/assignments.js';
import {
  WORKER_TASK_TYPES,
  WorkerRunCancelledError,
  createAnalysisWorkerClient,
} from '../runtime/index.js';
import { buildNonlinearCaseDependencyGraph } from '../workflow/initialState.js';
import {
  createProductionNonlinearCase,
  nonlinearProductModelHash,
  preflightProductionNonlinearCase,
} from './preflight.js';
import {
  explainNonlinearFailure,
  exportNonlinearHistory,
  getNonlinearResultSlice,
} from './resultAccess.js';
import {
  buildNonlinearCalculationReport,
  createNonlinearCalculationReportHtml,
} from './report.js';

export const NONLINEAR_PRODUCT_JOB_VERSION = 'p8-m10-product-job-v1';
export const NONLINEAR_PRODUCT_SERVICE_VERSION = 'p8-m10-product-service-v1';

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'blocked', 'cancelled']);
const ACTIVE_STATUSES = new Set(['queued', 'running', 'pausing', 'cancelling']);

export function createNonlinearProductService(options = {}) {
  const jobs = new Map();
  const subscribers = new Set();
  let sequence = 0;
  let disposed = false;

  const api = {
    version: NONLINEAR_PRODUCT_SERVICE_VERSION,
    createCase(input = {}) {
      return createProductionNonlinearCase(resolveModel(input, options), input.analysisCase || input);
    },
    validate(input = {}) {
      const model = clone(resolveModel(input, options));
      const analysisCase = resolveCase(model, input);
      return preflightProductionNonlinearCase(model, analysisCase, preflightOptions(input, options));
    },
    previewAssignments(input = {}) {
      return api.validate(input).assignment.preview;
    },
    applyAssignments(changeSet, input = {}) {
      const model = resolveModel(input, options);
      const memberIds = [...new Set((changeSet?.assignments || []).map((row) => String(row.memberId)))];
      const applied = applyHingeAssignmentChangeSet(model, changeSet, {
        ...(input.assignmentOptions || {}),
        memberIds,
        ends: uniqueValues(changeSet?.assignments, 'end'),
        axes: uniqueValues(changeSet?.assignments, 'axis'),
      });
      if (typeof options.onReplaceModel === 'function') options.onReplaceModel(applied.model, model, applied);
      return clone(applied);
    },
    start(input = {}) {
      if (disposed) throw serviceError('NONLINEAR_SERVICE_DISPOSED', 'Nonlinear product service has been disposed.');
      if (jobs.size >= (options.maxJobs ?? 128)) throw serviceError('NONLINEAR_JOB_LIMIT', 'Session result retention budget reached.');
      if ([...jobs.values()].filter(job => ACTIVE_STATUSES.has(job.status)).length >= (options.maxConcurrentJobs ?? 1)) {
        throw serviceError('NONLINEAR_BUSY', 'Wait for the active nonlinear job to terminate.');
      }
      const model = clone(resolveModel(input, options));
      const analysisCase = resolveCase(model, input);
      const preflight = preflightProductionNonlinearCase(model, analysisCase, preflightOptions(input, options));
      const id = clean(input.jobId) || nextJobId(++sequence, now(options));
      if (jobs.has(id)) throw serviceError('NONLINEAR_JOB_ID_DUPLICATE', `Nonlinear job ${id} already exists.`);
      const job = {
        version: NONLINEAR_PRODUCT_JOB_VERSION,
        id,
        sequence,
        caseId: analysisCase.id,
        kind: analysisCase.kind,
        mode: preflight.mode,
        analysisCase,
        preflight,
        preflightHash: preflight.preflightHash,
        modelHash: preflight.modelHash,
        settingsHash: preflight.settingsHash,
        buildIdentity: clone(options.getBuildIdentity?.() || { service: NONLINEAR_PRODUCT_SERVICE_VERSION }),
        status: preflight.ok ? 'queued' : 'blocked',
        stage: preflight.ok ? 'run' : firstBlockedStage(preflight),
        progress: preflight.ok ? 0 : null,
        progressMessage: preflight.ok ? '실행 대기' : preflight.blocking[0]?.message || '전처리 차단',
        createdAt: iso(now(options)),
        startedAt: null,
        completedAt: preflight.ok ? null : iso(now(options)),
        failedStage: preflight.ok ? null : firstBlockedStage(preflight),
        error: preflight.ok ? null : explainNonlinearFailure(preflight.blocking[0] || {}),
        result: null,
        resultSummary: null,
        latestCheckpoint: input.restartCheckpoint || null,
        latestCheckpointMeta: input.restartCheckpoint ? checkpointMeta(input.restartCheckpoint) : null,
        predecessorJobId: clean(input.predecessorJobId) || null,
        resumePolicy: clean(input.resumePolicy) || null,
        desiredAction: null,
        runtime: null,
        runtimeCancel: null,
        runtimeDispose: null,
        runtimeOptions: clone(input.runtimeOptions || {}),
        progressEvents: [],
        publication: null,
        stale: false,
      };
      jobs.set(id, job);
      emit(job, 'created');
      if (preflight.ok) {
        job.promise = schedule(options, () => executeJob(job, model, input));
      }
      return snapshot(job);
    },
    pause(jobId) {
      const job = requireJob(jobs, jobId);
      if (job.status === 'queued') {
        job.status = 'paused';
        job.desiredAction = 'pause';
        job.progressMessage = '실행 전 일시정지';
        emit(job, 'paused');
        return snapshot(job);
      }
      if (job.status !== 'running') throw serviceError('NONLINEAR_JOB_NOT_RUNNING', `Job ${job.id} is not running.`);
      job.desiredAction = 'pause';
      job.status = 'pausing';
      job.progressMessage = '커밋 경계에서 일시정지 요청 중';
      requestRuntimeCancellation(job);
      emit(job, 'pause-requested');
      return snapshot(job);
    },
    cancel(jobId) {
      const job = requireJob(jobs, jobId);
      if (TERMINAL_STATUSES.has(job.status) || job.status === 'paused') return snapshot(job);
      if (job.status === 'queued') {
        job.status = 'cancelled';
        job.desiredAction = 'cancel';
        job.completedAt = iso(now(options));
        job.progressMessage = '실행 전 취소됨';
        emit(job, 'cancelled');
        return snapshot(job);
      }
      job.desiredAction = 'cancel';
      job.status = 'cancelling';
      job.progressMessage = '커밋 경계에서 취소 요청 중';
      requestRuntimeCancellation(job);
      emit(job, 'cancel-requested');
      return snapshot(job);
    },
    resume(jobId, input = {}) {
      const { jobId: sourceJobId, id: sourceId, ...restartInput } = input;
      const previous = requireJob(jobs, jobId);
      if (previous.status !== 'paused') throw serviceError('NONLINEAR_JOB_NOT_PAUSED', `Job ${previous.id} is not paused.`);
      const model = resolveModel(input, options);
      const currentHash = nonlinearProductModelHash(model);
      if (previous.mode === 'nlth' && previous.latestCheckpoint && previous.buildIdentity?.unbound) {
        throw serviceError('NONLINEAR_RESTART_BUILD_UNBOUND', 'Checkpoint resume requires a bound solver build; retry from origin instead.');
      }
      if (stableHash(previous.buildIdentity) !== stableHash(options.getBuildIdentity?.() || { service: NONLINEAR_PRODUCT_SERVICE_VERSION })) {
        throw serviceError('NONLINEAR_RESTART_BUILD_CHANGED', 'Checkpoint resume requires the original solver build.');
      }
      if (previous.mode === 'nlth' && previous.latestCheckpoint && currentHash !== previous.modelHash) {
        throw serviceError('NONLINEAR_RESTART_MODEL_CHANGED', 'NLTH 체크포인트는 원 실행과 동일한 모델에서만 재개할 수 있습니다.');
      }
      const checkpointResume = previous.mode === 'nlth' && previous.latestCheckpoint;
      const settings = {
        ...clone(previous.analysisCase.settings),
        resume: checkpointResume ? {
          policy: 'checkpoint',
          checkpointHash: previous.latestCheckpoint.integrityHash,
          predecessorJobId: previous.id,
        } : {
          policy: 'restart-from-origin',
          predecessorJobId: previous.id,
        },
      };
      return api.start({
        ...restartInput,
        model,
        analysisCase: { ...clone(previous.analysisCase), settings },
        predecessorJobId: previous.id,
        resumePolicy: checkpointResume ? 'checkpoint' : 'restart-from-origin',
        restartCheckpoint: checkpointResume ? previous.latestCheckpoint : null,
        runtimeOptions: {
          ...(input.runtimeOptions || {}),
          ...(checkpointResume ? { restartCheckpoint: previous.latestCheckpoint } : {}),
        },
      });
    },
    retry(jobId, input = {}) {
      const { jobId: sourceJobId, id: sourceId, ...restartInput } = input;
      const previous = requireJob(jobs, jobId);
      if (!['failed', 'blocked', 'cancelled', 'paused'].includes(previous.status)) {
        throw serviceError('NONLINEAR_JOB_NOT_RETRYABLE', `Job ${previous.id} cannot be retried from ${previous.status}.`);
      }
      return api.start({
        ...restartInput,
        analysisCase: clone(previous.analysisCase),
        predecessorJobId: previous.id,
        resumePolicy: 'restart-from-origin',
      });
    },
    getStatus(jobId, input = {}) {
      const job = requireJob(jobs, jobId);
      updateStale(job, resolveOptionalModel(input, options));
      return snapshot(job);
    },
    getResult(jobId, input = {}) {
      const job = requireJob(jobs, jobId);
      updateStale(job, resolveOptionalModel(input, options));
      return job.result ? { ...clone(job.result), stale: job.stale } : null;
    },
    getResultSlice(jobId, query = {}) {
      const job = requireJob(jobs, jobId);
      if (!job.result) return noResultSlice(job, query);
      updateStale(job, resolveOptionalModel(query, options));
      return getNonlinearResultSlice({ ...job.result, stale: job.stale }, query);
    },
    exportHistory(jobId, input = {}) {
      const job = requireJob(jobs, jobId);
      if (!job.result) throw serviceError('NONLINEAR_JOB_RESULT_UNAVAILABLE', `Job ${job.id} has no result.`);
      return exportNonlinearHistory(job.result, input);
    },
    explainFailure(jobId) {
      const job = requireJob(jobs, jobId);
      return explainNonlinearFailure({
        ...(job.error || {}),
        result: job.result,
        failedStage: job.failedStage,
        retryable: ['failed', 'cancelled', 'paused'].includes(job.status),
      });
    },
    getReport(jobId, input = {}) {
      const job = requireJob(jobs, jobId);
      updateStale(job, resolveOptionalModel(input, options));
      const report = buildNonlinearCalculationReport({
        ...input,
        model: resolveOptionalModel(input, options) || {},
        job: snapshot(job, { includePreflight: true }),
        analysisCase: job.analysisCase,
        preflight: job.preflight,
        result: job.result || {},
      });
      return input.format === 'html'
        ? { report, html: createNonlinearCalculationReportHtml(report) }
        : report;
    },
    listJobs(input = {}) {
      const model = resolveOptionalModel(input, options);
      const rows = [...jobs.values()].sort((a, b) => a.sequence - b.sequence);
      rows.forEach((job) => updateStale(job, model));
      const latestByCase = new Map();
      rows.forEach((job) => latestByCase.set(job.caseId, job.id));
      return rows
        .filter((job) => !input.caseId || job.caseId === input.caseId)
        .map((job) => ({ ...snapshot(job), current: latestByCase.get(job.caseId) === job.id }));
    },
    getRunGraph(input = {}) {
      const model = resolveOptionalModel(input, options) || {};
      const runRecords = resolveRunRecords(options, input);
      const caseGraph = buildNonlinearCaseDependencyGraph(model.analysisCases || [], runRecords);
      const nodes = [...jobs.values()].map((job) => ({
        id: job.id,
        caseId: job.caseId,
        status: job.status,
        stale: updateStale(job, model),
        createdAt: job.createdAt,
        runRecordId: job.result?.runRecordId || job.result?.payload?.runRecord?.id || null,
      }));
      const edges = [...jobs.values()].filter((job) => job.predecessorJobId).map((job) => ({
        from: job.predecessorJobId,
        to: job.id,
        policy: job.resumePolicy || 'retry',
      }));
      return {
        version: NONLINEAR_PRODUCT_JOB_VERSION,
        caseGraph,
        nodes,
        edges,
        graphHash: stableHash({ caseGraph, nodes, edges }).slice(0, 24),
      };
    },
    subscribe(listener) {
      if (typeof listener !== 'function') return () => {};
      subscribers.add(listener);
      return () => subscribers.delete(listener);
    },
    async wait(jobId) {
      const job = requireJob(jobs, jobId);
      if (job.promise) await job.promise;
      return snapshot(job);
    },
    dispose() {
      disposed = true;
      for (const job of jobs.values()) {
        if (ACTIVE_STATUSES.has(job.status)) {
          api.cancel(job.id);
          job.status = 'cancelled';
          job.completedAt = iso(now(options));
        }
        job.runtimeDispose?.();
      }
      subscribers.clear();
    },
  };

  return api;

  async function executeJob(job, model, input) {
    if (job.status === 'paused' || job.status === 'cancelled') return;
    job.status = 'running';
    job.startedAt = iso(now(options));
    job.progress = 0;
    job.progressMessage = 'Production 비선형해석 시작';
    emit(job, 'started');
    try {
      const result = typeof options.runner === 'function'
        ? await runInjected(job, model, input)
        : await runProduction(job, model, input);
      await finishWithResult(job, model, result);
    } catch (error) {
      finishWithError(job, error);
    } finally {
      clearTimeout(job.cancelTimer);
      clearTimeout(job.runTimer);
      job.runtimeCancel = null;
      job.runtimeDispose?.();
      job.runtimeDispose = null;
    }
  }

  async function runInjected(job, model, input) {
    const controller = new AbortController();
    job.runtime = { mode: 'injected-runner', backend: input.backendId || 'injected' };
    job.runtimeCancel = () => controller.abort({ code: job.desiredAction === 'pause' ? 'PAUSE_REQUESTED' : 'CANCELLED' });
    const result = await options.runner({
      job: snapshot(job, { includePreflight: true }),
      model,
      analysisCase: job.analysisCase,
      preflight: job.preflight,
      signal: controller.signal,
      isCancelled: () => controller.signal.aborted,
      onProgress: (progress) => handleProgress(job, progress),
      restartCheckpoint: job.runtimeOptions.restartCheckpoint || null,
    });
    return result?.payload ? result : wrapResult(job, result);
  }

  async function runProduction(job, model, input) {
    const executionMode = clean(input.executionMode || options.executionMode)
      || (typeof Worker !== 'undefined' ? 'worker' : 'direct');
    if (executionMode === 'worker') return runWorker(job, model, input);
    if (executionMode !== 'direct' || input.allowMainThread !== true && options.allowMainThread !== true) {
      throw serviceError('NONLINEAR_WORKER_REQUIRED', 'Production UI execution requires the analysis Worker. Main-thread fallback is forbidden.');
    }
    const controller = new AbortController();
    job.runtime = { mode: 'main-thread-explicit', backend: 'production-wasm-sparse', fallbackUsed: false };
    job.runtimeCancel = () => controller.abort({ code: job.desiredAction === 'pause' ? 'PAUSE_REQUESTED' : 'CANCELLED' });
    const raw = await runNonlinearAnalysisCaseAsync(model, job.analysisCase, job.analysisCase.settings, {
      production: true,
      signal: controller.signal,
      isCancelled: () => controller.signal.aborted,
      onProgress: (progress) => handleProgress(job, progress),
      restartCheckpoint: job.runtimeOptions.restartCheckpoint || null,
    });
    return wrapResult(job, raw);
  }

  async function runWorker(job, model, input) {
    let client;
    try {
      client = createAnalysisWorkerClient({
        ...(options.workerOptions || {}),
        ...(input.workerOptions || {}),
        workerFactory: input.workerFactory || options.workerFactory,
      });
    } catch (error) {
      throw serviceError(error?.code || 'NONLINEAR_WORKER_UNAVAILABLE', error?.message || String(error), error);
    }
    job.runtime = {
      mode: 'module-worker',
      backend: 'production-wasm-sparse',
      fallbackUsed: false,
    };
    job.runtimeDispose = () => client.dispose();
    const taskType = job.mode === 'nlth'
      ? WORKER_TASK_TYPES.runMdofNlth
      : WORKER_TASK_TYPES.runProductionPushover;
    const promise = client.run({
      type: taskType,
      payload: {
        model,
        analysisCase: job.analysisCase,
        options: {
          production: true,
          ...(job.runtimeOptions.restartCheckpoint ? { restartCheckpoint: job.runtimeOptions.restartCheckpoint } : {}),
        },
      },
      preflight: {
        dofCount: job.preflight.runtime?.dofCount,
        nnz: job.preflight.runtime?.nnz,
        backendMode: 'production',
        production: true,
        matrixClass: 'general',
        memoryLimitBytes: job.preflight.runtime?.memory?.limitBytes || undefined,
      },
    }, {
      transfer: false,
      onProgress: (progress) => handleProgress(job, progress),
    });
    job.runtime.runToken = promise.runToken;
    job.runtime.requestId = promise.requestId;
    job.runTimer = setTimeout(() => {
      job.timeout = true;
      client.dispose();
    }, options.maxRunMs ?? 1800000);
    job.runtimeCancel = () => {
      if (!job.cancelTimer) job.cancelTimer = setTimeout(() => {
        job.runtime.forcedTermination = true;
        client.dispose();
      }, options.cancelGraceMs ?? 2000);
      return promise.cancel();
    };
    const raw = await promise;
    return wrapResult(job, raw);
  }

  async function finishWithResult(job, model, resultInput) {
    if (disposed) return;
    const result = resultInput?.payload ? clone(resultInput) : wrapResult(job, resultInput);
    Object.assign(result, resolveProductQualification({engineId:job.analysisCase.engineId,ok:result.ok===true,
      modelHash:job.modelHash,settingsHash:job.settingsHash,buildIdentity:job.buildIdentity}));
    job.result = result;
    job.resultSummary = clone(result.summary || summarizeRaw(result.payload));
    if (job.desiredAction === 'pause') {
      job.status = 'paused';
      job.progressMessage = job.latestCheckpoint
        ? '체크포인트에서 일시정지됨'
        : '커밋 경계에서 일시정지됨. 이 해석은 재개 시 원점부터 다시 실행됩니다.';
    } else if (job.desiredAction === 'cancel' || result.status === 'cancelled') {
      job.status = 'cancelled';
      job.progressMessage = '커밋 경계에서 취소됨';
    } else if (result.ok === false || ['failed', 'blocked', 'unsupported'].includes(result.status)) {
      job.status = result.status === 'blocked' || result.status === 'unsupported' ? 'blocked' : 'failed';
      job.failedStage = stageFromFailure(result);
      job.error = explainNonlinearFailure({
        code: result.error?.code || result.payload?.reason || result.designBlockReason || 'NONLINEAR_RUN_FAILED',
        message: result.error?.message || result.message || result.payload?.message,
        details: result.payload?.details,
        failedStage: job.failedStage,
      });
      job.progressMessage = job.error.message;
    } else {
      job.status = 'completed';
      job.progress = 1;
      job.stage = 'results';
      job.progressMessage = '해석 완료. 검증등급과 설계전달 차단 상태를 확인하세요.';
    }
    job.completedAt = iso(now(options));
    updateStale(job, resolveOptionalModel({}, options));
    if (typeof options.onPublishResult === 'function') {
      try {
        job.publication = await options.onPublishResult({
          job: snapshot(job),
          model,
          analysisCase: job.analysisCase,
          result,
        });
      } catch (error) {
        job.publication = { ok: false, code: error?.code || 'NONLINEAR_RESULT_PUBLICATION_FAILED', message: error?.message || String(error) };
      }
    }
    emit(job, job.status);
  }

  function finishWithError(job, error) {
    if (job.timeout) error = serviceError('NONLINEAR_TIME_BUDGET_EXCEEDED', 'Analysis exceeded its execution time budget.');
    if (job.desiredAction === 'pause' || error instanceof WorkerRunCancelledError && job.desiredAction === 'pause') {
      job.status = 'paused';
      job.progressMessage = job.latestCheckpoint
        ? '체크포인트에서 일시정지됨'
        : '커밋 경계에서 일시정지됨. 재개 시 원점부터 다시 실행됩니다.';
    } else if (job.desiredAction === 'cancel' || error instanceof WorkerRunCancelledError || error?.code === 'CANCELLED') {
      job.status = 'cancelled';
      job.progressMessage = '커밋 경계에서 취소됨';
    } else {
      job.status = 'failed';
      job.failedStage = stageFromFailure(error);
      job.error = explainNonlinearFailure({
        code: error?.code || 'NONLINEAR_RUN_FAILED',
        message: error?.message || String(error),
        details: error?.details,
        failedStage: job.failedStage,
      });
      job.progressMessage = job.error.message;
    }
    job.completedAt = iso(now(options));
    emit(job, job.status);
  }

  function handleProgress(job, progress = {}) {
    if (!progress || typeof progress !== 'object') return;
    if (progress.type === 'checkpoint' && progress.checkpoint) {
      job.latestCheckpoint = clone(progress.checkpoint);
      job.latestCheckpointMeta = checkpointMeta(progress.checkpoint);
    }
    const update = progressState(progress, job);
    if (update.stage) job.stage = update.stage;
    if (update.value != null) job.progress = Math.max(Number(job.progress || 0), Math.min(0.99, update.value));
    if (update.message) job.progressMessage = update.message;
    job.progressEvents.push(compactProgress(progress));
    if (job.progressEvents.length > 200) job.progressEvents.splice(0, job.progressEvents.length - 200);
    emit(job, 'progress');
  }

  function emit(job, event) {
    const value = snapshot(job);
    for (const listener of subscribers) {
      try { listener(value, event); } catch { /* Observers must not affect the solver. */ }
    }
    if (typeof options.onEvent === 'function') {
      try { options.onEvent(value, event); } catch { /* Observational callback. */ }
    }
  }
}

function resolveModel(input, options) {
  const model = input?.model || options.getModel?.();
  if (!model || typeof model !== 'object') throw serviceError('NONLINEAR_MODEL_REQUIRED', 'Current model is not available.');
  return model;
}

function resolveOptionalModel(input, options) {
  return input?.model || options.getModel?.() || null;
}

function resolveCase(model, input) {
  if (input.analysisCase) return createProductionNonlinearCase(model, input.analysisCase);
  const caseId = clean(input.caseId || input.id);
  if (caseId) {
    const found = (model.analysisCases || []).find((row) => String(row.id) === caseId);
    if (!found) throw serviceError('NONLINEAR_CASE_NOT_FOUND', `Nonlinear analysis case ${caseId} was not found.`);
    return createProductionNonlinearCase(model, found);
  }
  return createProductionNonlinearCase(model, input);
}

function preflightOptions(input, options) {
  const runtime = typeof navigator !== 'undefined' ? navigator : {};
  return {
    ...(options.preflight || {}),
    ...(input.preflight || {}),
    runRecords: resolveRunRecords(options, input),
    previousDomainHashes: input.previousDomainHashes,
    reinforcementSnapshots: input.reinforcementSnapshots,
    requireWorker: input.requireWorker ?? options.requireWorker ?? (typeof document !== 'undefined'),
    workerSupported: input.workerSupported ?? (typeof Worker !== 'undefined'),
    wasmSupported: input.wasmSupported ?? (typeof WebAssembly !== 'undefined'),
    deviceMemoryGb: input.deviceMemoryGb ?? runtime.deviceMemory,
    memoryLimitBytes: input.memoryLimitBytes,
    injectedRunner: typeof options.runner === 'function',
  };
}

function resolveRunRecords(options, input) {
  const value = input.runRecords || options.getRunRecords?.() || [];
  if (Array.isArray(value)) return value;
  if (Array.isArray(value.records)) return value.records;
  if (value.attempts) return Object.values(value.attempts).flat();
  return [];
}

function wrapResult(job, rawInput) {
  if (rawInput?.caseId && rawInput?.settings && rawInput?.payload) return clone(rawInput);
  const raw = rawInput || {};
  const blocked = ['blocked', 'unsupported'].includes(raw.status);
  const failed = raw.ok === false || ['failed', 'cancelled'].includes(raw.status);
  const status = raw.status === 'cancelled'
    ? 'cancelled'
    : blocked
      ? raw.status
      : failed ? 'failed' : 'ok';
  const startedAt = job.startedAt || job.createdAt;
  return {
    version: NONLINEAR_PRODUCT_JOB_VERSION,
    caseId: job.caseId,
    kind: job.kind,
    ok: !failed && !blocked,
    status,
    qualification: raw.qualification || (failed ? 'failed' : blocked ? 'blocked' : 'candidate'),
    designBlocked: raw.designBlocked !== false,
    designBlockReason: raw.designBlockReason || 'P8_M11_INDEPENDENT_QUALIFICATION_PENDING',
    engine: clone(raw.engine || { id: job.analysisCase.engineId }),
    modelBound: raw.modelBound !== false,
    capability: clone(job.preflight.capability),
    routing: clone(raw.routing || {
      requestedEngineId: job.analysisCase.engineId,
      executedEngineId: raw.engine?.id || job.analysisCase.engineId,
      fallbackPolicy: 'forbidden',
      fallbackUsed: false,
      executionMode: job.runtime?.mode || null,
    }),
    provenance: clone(raw.provenance || null),
    startedAt,
    completedAt: new Date().toISOString(),
    settings: clone(job.preflight.executionSettings),
    settingsHash: job.preflight.settingsHash,
    settingsBytes: job.preflight.settingsBytes,
    summary: summarizeRaw(raw),
    message: failed || blocked ? raw.message || raw.reason || null : null,
    error: failed || blocked ? { code: raw.reason || raw.designBlockReason || 'NONLINEAR_RUN_FAILED', message: raw.message || raw.reason || 'Nonlinear analysis failed.' } : null,
    payload: clone(raw),
  };
}

function summarizeRaw(raw) {
  return clone(raw.summary || {
    ok: raw.ok === true,
    stepCount: raw.capacityCurve?.length || raw.steps?.length || 0,
    outputStepCount: raw.history?.outputStepCount || 0,
    rejectedStepCount: raw.control?.rejectedStepCount || raw.details?.rejectedStepCount || 0,
  });
}

function snapshot(job, options = {}) {
  return clone({
    version: job.version,
    serviceVersion: NONLINEAR_PRODUCT_SERVICE_VERSION,
    id: job.id,
    sequence: job.sequence,
    caseId: job.caseId,
    kind: job.kind,
    mode: job.mode,
    status: job.status,
    stage: job.stage,
    progress: job.progress,
    progressMessage: job.progressMessage,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    failedStage: job.failedStage,
    error: job.error,
    resultAvailable: Boolean(job.result),
    resultSummary: job.resultSummary,
    qualification: job.result?.qualification || job.preflight.qualification,
    designBlocked: job.result?.designBlocked ?? job.preflight.designBlocked,
    modelHash: job.modelHash,
    settingsHash: job.settingsHash,
    buildIdentity: job.buildIdentity,
    preflightHash: job.preflightHash,
    predecessorJobId: job.predecessorJobId,
    resumePolicy: job.resumePolicy,
    checkpoint: job.latestCheckpointMeta,
    runtime: job.runtime,
    publication: job.publication,
    stale: job.stale,
    progressEvents: job.progressEvents.slice(-20),
    ...(options.includePreflight ? { preflight: job.preflight, analysisCase: job.analysisCase } : {}),
  });
}

function progressState(progress, job) {
  const type = String(progress.type || progress.stage || '');
  if (type.includes('pmm') || type.includes('fiber')) {
    return { stage: 'properties', value: ratio(progress.completed ?? progress.index, progress.total), message: 'Fiber/PMM 전처리 중' };
  }
  if (type.includes('gravity') || type.includes('load-control')) {
    return { stage: 'gravity', value: 0.05 + ratio(progress.step ?? progress.acceptedStep, progress.steps ?? progress.total) * 0.2, message: '중력 선행상태 계산 중' };
  }
  if (type === 'checkpoint') return { stage: 'run', value: job.progress, message: `체크포인트 저장 · t=${formatNumber(progress.time)}s` };
  if (type.includes('dynamic-output') || type.includes('newmark')) {
    const value = ratio(progress.time ?? progress.outputStep, progress.endTime ?? progress.outputStepCount);
    return { stage: 'run', value: 0.25 + value * 0.7, message: `NLTH 적분 중${progress.time != null ? ` · t=${formatNumber(progress.time)}s` : ''}` };
  }
  if (type === 'displacement-step-accepted' || type === 'arc-length-step-accepted') {
    const total = job.analysisCase.settings.steps || 20;
    return { stage: 'run', value: 0.25 + Math.min(1, Number(progress.step || 0) / total) * 0.7, message: `Pushover ${progress.step || 0}/${total} 스텝` };
  }
  if (type === 'result-chunk') return { stage: 'run', value: job.progress, message: '결과 이력 스트리밍 중' };
  return { stage: job.stage, value: progress.progress ?? progress.ratio, message: progress.message || null };
}

function compactProgress(progress) {
  const output = {};
  for (const key of ['type', 'stage', 'step', 'attempt', 'iteration', 'time', 'dt', 'lambda', 'controlValue', 'reason', 'message', 'integrityHash']) {
    if (progress[key] != null) output[key] = progress[key];
  }
  return output;
}

function checkpointMeta(checkpoint) {
  return checkpoint ? {
    integrityHash: checkpoint.integrityHash || null,
    committedHash: checkpoint.committedHash || null,
    time: checkpoint.committed?.time ?? null,
    revision: checkpoint.revision ?? null,
  } : null;
}

function requestRuntimeCancellation(job) {
  try {
    const pending = job.runtimeCancel?.();
    pending?.catch?.(() => {});
  } catch { /* The active runner will still observe its cancellation signal when available. */ }
}

function updateStale(job, model) {
  job.stale = Boolean(model && nonlinearProductModelHash(model) !== job.modelHash);
  return job.stale;
}

function stageFromFailure(value) {
  const code = String(value?.code || value?.error?.code || value?.payload?.reason || value?.reason || '').toUpperCase();
  if (code.includes('GRAVITY')) return 'gravity';
  if (code.includes('HINGE') || code.includes('FIBER') || code.includes('PMM')) return 'properties';
  if (code.includes('GROUND') || code.includes('MASS') || code.includes('TIME_HISTORY')) return 'groundMotion';
  if (code.includes('CONTROL') || code.includes('TARGET') || code.includes('ARC')) return 'control';
  return 'run';
}

function firstBlockedStage(preflight) {
  return preflight.blocking?.[0]?.stage || 'model';
}

function noResultSlice(job, query) {
  return {
    version: 'p8-m10-result-access-v1',
    kind: job.mode,
    slice: query.slice || query.type || 'overview',
    caseId: job.caseId,
    runRecordId: null,
    query: clone(query),
    data: { available: false, reason: 'NONLINEAR_JOB_RESULT_UNAVAILABLE', jobStatus: job.status },
  };
}

function requireJob(jobs, id) {
  const job = jobs.get(String(id || ''));
  if (!job) throw serviceError('NONLINEAR_JOB_NOT_FOUND', `Nonlinear job ${String(id || '(missing)')} was not found.`);
  return job;
}

function uniqueValues(rows, key) {
  return [...new Set((rows || []).map((row) => row?.[key]).filter(Boolean))];
}

function ratio(value, total) {
  const numerator = Number(value);
  const denominator = Number(total);
  return Number.isFinite(numerator) && denominator > 0 ? Math.max(0, Math.min(1, numerator / denominator)) : null;
}

function schedule(options, callback) {
  if (typeof options.schedule === 'function') return Promise.resolve(options.schedule(callback));
  return Promise.resolve().then(callback);
}

function nextJobId(sequence, date) {
  const stamp = date.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  return `NLJOB-${stamp}-${String(sequence).padStart(4, '0')}`;
}

function now(options) {
  const value = typeof options.now === 'function' ? options.now() : new Date();
  return value instanceof Date ? value : new Date(value);
}

function iso(value) {
  return value.toISOString();
}

function formatNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(number < 1 ? 3 : 2) : '-';
}

function clean(value) {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function clone(value) {
  if (value == null) return value;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function serviceError(code, message, details = null) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}
