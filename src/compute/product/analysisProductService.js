import { normalizeAnalysisCase } from '../../core/analysisCase.js';
import { stableHash, stableStringify } from '../../core/stableHash.js';

export const PRODUCT_ANALYSIS_SERVICE_VERSION = 'p9-m9-product-analysis-service-v1';
export const PRODUCT_ANALYSIS_CAPABILITY_VERSION = 'p9-m9-product-capability-v1';
export const PRODUCT_ANALYSIS_JOB_VERSION = 'p9-m9-product-job-v1';
export const PRODUCT_ANALYSIS_REPORT_VERSION = 'p9-m9-product-report-v1';

export const PRODUCT_COMPUTE_TARGETS = Object.freeze(['auto', 'cpu', 'gpu']);

const NONLINEAR_KINDS = new Set(['pushover', 'nlth', 'nonlinearStatic', 'nonlinearTimeHistory']);
const TERMINAL = new Set(['completed', 'failed', 'blocked', 'cancelled']);
const SUPPORTED_KINDS = new Set(['static', 'modal', 'responseSpectrum', 'buckling', 'linearTha', ...NONLINEAR_KINDS]);

export function createAnalysisProductService(options = {}) {
  const jobs = new Map();
  const delegated = new Map();
  const subscribers = new Set();
  const nonlinear = options.nonlinearService || null;
  let sequence = 0;
  let disposed = false;
  let executionQueue = Promise.resolve();

  const api = {
    version: PRODUCT_ANALYSIS_SERVICE_VERSION,
    getCapabilities,
    validate,
    plan,
    start,
    startMany,
    cancel,
    retry,
    getStatus,
    getResult,
    getResultSlice,
    listJobs,
    getReport,
    exportTelemetry,
    subscribe,
    wait,
    dispose,
    createCase(input = {}) {
      return requireNonlinearTool('createCase')({ ...input, model: resolveModel(input) });
    },
    previewAssignments(input = {}) {
      return requireNonlinearTool('previewAssignments')({ ...input, model: resolveModel(input) });
    },
    applyAssignments(changeSet, input = {}) {
      return requireNonlinearTool('applyAssignments')(changeSet, { ...input, model: resolveModel(input) });
    },
    pause(jobId) {
      return proxyNonlinearControl('pause', jobId);
    },
    resume(jobId, input = {}) {
      return proxyNonlinearRestart('resume', jobId, input);
    },
    getRunGraph(input = {}) {
      return nonlinear?.getRunGraph ? nonlinear.getRunGraph(input) : buildRunGraph(listJobs(input));
    },
    exportHistory(jobId, input = {}) {
      const meta = delegated.get(String(jobId));
      return meta && nonlinear?.exportHistory
        ? nonlinear.exportHistory(jobId, input)
        : exportTelemetry(jobId, { ...input, format: input.format || 'json' });
    },
    explainFailure(jobId) {
      const meta = delegated.get(String(jobId));
      if (meta && nonlinear?.explainFailure) return nonlinear.explainFailure(jobId);
      const job = requireInternalJob(jobId);
      return clone(job.error || { code: 'PRODUCT_ANALYSIS_FAILURE_UNAVAILABLE', message: 'No failure is recorded.' });
    },
  };

  const unsubscribeNonlinear = nonlinear?.subscribe?.((job, event) => {
    const meta = delegated.get(String(job.id));
    if (!meta) return;
    emit(augmentDelegatedSnapshot(job, meta), event);
  }) || (() => {});

  return Object.freeze(api);

  function getCapabilities(input = {}) {
    const profile = hardwareProfile(input.environment || options.environment);
    const kinds = input.kind ? [String(input.kind)] : [...SUPPORTED_KINDS];
    const byKind = Object.fromEntries(kinds.map((kind) => [kind, capabilityForKind(kind, profile, options.qualificationPolicy)]));
    return freezeClone({
      version: PRODUCT_ANALYSIS_CAPABILITY_VERSION,
      serviceVersion: PRODUCT_ANALYSIS_SERVICE_VERSION,
      profile,
      defaultTarget: 'auto',
      requestedKind: input.kind || null,
      byKind,
      targets: input.kind ? byKind[input.kind]?.targets || [] : [],
      capabilityHash: stableHash({ profile, byKind }).slice(0, 24),
    });
  }

  function validate(input = {}) {
    const model = resolveModel(input, false);
    const analysisCase = resolveCase(model, input, false);
    const kind = analysisCase?.kind || String(input.kind || '');
    const computeTarget = normalizeTarget(input.computeTarget);
    const capability = getCapabilities({ kind, environment: input.environment });
    const target = capability.targets.find((row) => row.id === computeTarget);
    const blocking = [];
    const warnings = [];
    let domainPreflight = null;
    if (!model) blocking.push(issue('PRODUCT_MODEL_REQUIRED', 'Current model is not available.', 'Select or create a model before analysis.'));
    if (!analysisCase) blocking.push(issue('PRODUCT_ANALYSIS_CASE_REQUIRED', 'Analysis case is not available.', 'Create an analysis case before analysis.'));
    if (analysisCase && !SUPPORTED_KINDS.has(analysisCase.kind)) {
      blocking.push(issue('PRODUCT_ANALYSIS_KIND_UNSUPPORTED', `Analysis kind ${analysisCase.kind} is not supported.`, 'Select a supported elastic or nonlinear analysis kind.'));
    }
    if (target?.available !== true) blocking.push(issue(target?.reason || 'COMPUTE_TARGET_UNAVAILABLE', target?.message || 'Requested compute target is unavailable.', target?.remediation));
    if (model && analysisCase && NONLINEAR_KINDS.has(kind) && nonlinear?.validate) {
      domainPreflight = nonlinear.validate({ ...input, model, analysisCase });
      for (const row of domainPreflight.blocking || []) blocking.push(normalizeIssue(row));
      for (const row of domainPreflight.warnings || []) warnings.push(normalizeIssue(row));
    }
    let executionPlan = null;
    if (model && analysisCase) executionPlan = plan({ ...input, model, analysisCase, computeTarget });
    const core = {
      ...(domainPreflight ? clone(domainPreflight) : {}),
      version: PRODUCT_ANALYSIS_CAPABILITY_VERSION,
      ok: blocking.length === 0,
      status: blocking.length ? 'blocked' : warnings.length ? 'review-required' : 'ready',
      caseId: analysisCase?.id || null,
      kind: analysisCase?.kind || kind || null,
      computeTarget,
      capability,
      plan: executionPlan,
      blocking,
      warnings,
    };
    return freezeClone({ ...core, preflightHash: stableHash(core).slice(0, 24) });
  }

  function plan(input = {}) {
    const model = resolveModel(input);
    const analysisCase = resolveCase(model, input);
    const settings = normalizeSettings(analysisCase, input);
    const settingsBytes = utf8Bytes(stableStringify(settings));
    const settingsHash = stableHash(Array.from(settingsBytes));
    const modelHash = stableHash(model);
    const requestedTarget = normalizeTarget(input.computeTarget);
    const capability = getCapabilities({ kind: analysisCase.kind, environment: input.environment });
    const target = capability.targets.find((row) => row.id === requestedTarget);
    const executedTarget = target?.available === true ? target.executedTarget : null;
    const runId = clean(input.runId || input.jobId)
      || `plan-${analysisCase.id}-${settingsHash.slice(0, 12)}`;
    const operation = operationForKind(analysisCase.kind);
    const route = {
      operation,
      requestedTarget,
      executedTarget,
      backendId: executedTarget ? backendForKind(analysisCase.kind, executedTarget) : null,
      precision: executedTarget === 'gpu' ? 'mixed-f32-f64-audited' : 'f64',
      fallbackPolicy: 'forbidden',
      fallbackUsed: false,
      reason: target?.available ? target.routeReason : target?.reason,
    };
    const core = {
      version: PRODUCT_ANALYSIS_SERVICE_VERSION,
      runId,
      caseId: analysisCase.id,
      kind: analysisCase.kind,
      modelHash,
      domainHash: modelHash,
      workloadClass: workloadClass(model),
      settings,
      settingsBytes: Array.from(settingsBytes),
      settingsHash,
      requestedTarget,
      executedTarget,
      operationRoute: route,
      correctionPolicy: executedTarget === 'gpu' ? 'gpu-f32-with-cpu-f64-correction' : 'not-required-cpu-f64',
      auditPolicy: 'cpu-f64-equilibrium-and-result-audit',
      qualification: executedTarget ? qualificationForKind(analysisCase.kind) : 'blocked',
      designTransfer: executedTarget ? 'subject-to-result-qualification' : 'blocked',
    };
    return freezeClone({ ...core, planHash: stableHash(core) });
  }

  function start(input = {}) {
    if (disposed) throw productError('PRODUCT_ANALYSIS_SERVICE_DISPOSED', 'Product analysis service is disposed.');
    const model = resolveModel(input);
    const analysisCase = resolveCase(model, input);
    const jobSequence = ++sequence;
    const id = clean(input.jobId) || `analysis-${Date.now()}-${jobSequence}`;
    const executionPlan = plan({ ...input, model, analysisCase, runId: id });
    if (jobs.has(id) || delegated.has(id)) throw productError('PRODUCT_ANALYSIS_JOB_DUPLICATE', `Analysis job ${id} already exists.`);
    const preflight = validate({ ...input, model, analysisCase, runId: id });
    if (NONLINEAR_KINDS.has(analysisCase.kind) && nonlinear && preflight.ok) {
      const meta = { id, model, analysisCase, input: clone(input), plan: executionPlan, preflight };
      delegated.set(id, meta);
      try {
        const raw = nonlinear.start({ ...input, model, analysisCase, jobId: id });
        const snapshot = augmentDelegatedSnapshot(raw, meta);
        emit(snapshot, 'created');
        return snapshot;
      } catch (error) {
        delegated.delete(id);
        throw error;
      }
    }
    const job = createInternalJob(id, model, analysisCase, input, executionPlan, preflight, jobSequence);
    jobs.set(id, job);
    emit(snapshotInternal(job), 'created');
    if (preflight.ok) {
      job.promise = executionQueue.then(() => executeInternal(job));
      executionQueue = job.promise.catch(() => {});
    }
    return snapshotInternal(job);
  }

  function startMany(input = {}) {
    const model = resolveModel(input);
    const cases = Array.isArray(input.cases) ? input.cases : model.analysisCases || [];
    return cases.map((analysisCase, index) => start({
      ...input,
      model,
      analysisCase,
      jobId: input.jobIdPrefix ? `${input.jobIdPrefix}-${index + 1}` : undefined,
    }));
  }

  function cancel(jobId) {
    const id = String(jobId);
    if (delegated.has(id)) return augmentDelegatedSnapshot(nonlinear.cancel(id), delegated.get(id));
    const job = requireInternalJob(id);
    if (TERMINAL.has(job.status)) return snapshotInternal(job);
    job.desiredAction = 'cancel';
    job.controller?.abort();
    job.status = 'cancelled';
    job.stage = 'cancelled';
    job.progressMessage = 'Analysis cancelled.';
    job.completedAt = nowIso(options);
    emit(snapshotInternal(job), 'cancelled');
    return snapshotInternal(job);
  }

  function retry(jobId, input = {}) {
    const id = String(jobId);
    if (delegated.has(id)) return proxyNonlinearRestart('retry', id, input);
    const previous = requireInternalJob(id);
    if (!['failed', 'blocked', 'cancelled'].includes(previous.status)) {
      throw productError('PRODUCT_ANALYSIS_JOB_NOT_RETRYABLE', `Job ${id} cannot be retried from ${previous.status}.`);
    }
    const retryInput = { ...previous.input, ...input, model: previous.model, analysisCase: previous.analysisCase, predecessorJobId: id };
    delete retryInput.id;
    if (!input.jobId) delete retryInput.jobId;
    delete retryInput.runId;
    return start(retryInput);
  }

  function getStatus(jobId) {
    const id = String(jobId);
    const meta = delegated.get(id);
    return meta ? augmentDelegatedSnapshot(nonlinear.getStatus(id), meta) : snapshotInternal(requireInternalJob(id));
  }

  function getResult(jobId) {
    const id = String(jobId);
    const meta = delegated.get(id);
    if (meta) return decorateResult(nonlinear.getResult(id), meta.plan);
    const job = requireInternalJob(id);
    return decorateResult(job.result, job.plan);
  }

  function getResultSlice(jobId, query = {}) {
    const id = String(jobId);
    const meta = delegated.get(id);
    if (meta && nonlinear?.getResultSlice) {
      const value = nonlinear.getResultSlice(id, query);
      return boundedSlice(value, query, meta.plan);
    }
    return boundedSlice(getResult(id), query, requireInternalJob(id).plan);
  }

  function listJobs(input = {}) {
    const rows = [...jobs.values()].map(snapshotInternal);
    for (const [id, meta] of delegated) {
      try { rows.push(augmentDelegatedSnapshot(nonlinear.getStatus(id), meta)); } catch { /* Ignore disposed delegated jobs. */ }
    }
    return rows
      .filter((row) => !input.caseId || row.caseId === input.caseId)
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  }

  function getReport(jobId, input = {}) {
    const id = String(jobId);
    const meta = delegated.get(id);
    if (meta && nonlinear?.getReport) {
      const domainReport = nonlinear.getReport(id, input);
      return { version: PRODUCT_ANALYSIS_REPORT_VERSION, job: getStatus(id), provenance: productProvenance(meta.plan), domainReport };
    }
    const job = requireInternalJob(id);
    const report = {
      version: PRODUCT_ANALYSIS_REPORT_VERSION,
      generatedAt: nowIso(options),
      job: snapshotInternal(job),
      provenance: productProvenance(job.plan),
      resultSummary: clone(job.result?.summary || null),
      qualification: job.result?.qualification || job.plan.qualification,
      designBlocked: job.result?.designBlocked === true,
    };
    return input.format === 'html' ? { report, html: reportHtml(report) } : report;
  }

  function exportTelemetry(jobId, input = {}) {
    const id = String(jobId);
    const status = getStatus(id);
    const result = getResult(id);
    const rows = (status.progressEvents || []).slice(-boundedLimit(input.limit, 200));
    const data = {
      version: PRODUCT_ANALYSIS_REPORT_VERSION,
      exportedAt: nowIso(options),
      job: status,
      provenance: result?.productProvenance || status.productProvenance,
      progressEvents: rows,
      resultSummary: result?.summary || null,
    };
    const content = input.format === 'csv' ? telemetryCsv(data) : stableStringify(data);
    return { version: PRODUCT_ANALYSIS_REPORT_VERSION, format: input.format === 'csv' ? 'csv' : 'json', content, contentHash: stableHash(content), rowCount: rows.length };
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    subscribers.add(listener);
    return () => subscribers.delete(listener);
  }

  async function wait(jobId) {
    const id = String(jobId);
    if (delegated.has(id) && nonlinear?.wait) await nonlinear.wait(id);
    else {
      const job = requireInternalJob(id);
      if (job.promise) await job.promise;
    }
    return getStatus(id);
  }

  function dispose() {
    disposed = true;
    unsubscribeNonlinear();
    for (const job of jobs.values()) job.controller?.abort();
    subscribers.clear();
  }

  async function executeInternal(job) {
    if (job.status === 'cancelled') return;
    job.status = 'running';
    job.stage = 'solve';
    job.startedAt = nowIso(options);
    job.progress = 0.02;
    job.progressMessage = 'Preparing analysis execution.';
    emit(snapshotInternal(job), 'started');
    try {
      const runner = options.caseRunner;
      if (typeof runner !== 'function') throw productError('PRODUCT_ANALYSIS_RUNNER_UNAVAILABLE', 'Product analysis runner is unavailable.');
      const result = await runner(job.model, job.analysisCase, {
        ...(job.input.options || {}),
        computeTarget: job.plan.executedTarget,
        plan: job.plan,
        signal: job.controller.signal,
        onProgress(progress = {}) {
          if (job.status === 'cancelled') return;
          job.progress = Math.max(job.progress, Math.min(0.98, Number(progress.value ?? progress.progress ?? job.progress)));
          job.stage = progress.stage || job.stage;
          job.progressMessage = progress.message || job.progressMessage;
          retain(job.progressEvents, { at: nowIso(options), ...clone(progress) }, 200);
          emit(snapshotInternal(job), 'progress');
        },
      });
      if (job.status === 'cancelled') return;
      job.result = decorateResult(result, job.plan);
      job.resultSummary = clone(result?.summary || null);
      job.status = result?.status === 'failed' ? 'failed' : ['blocked', 'unsupported'].includes(result?.status) ? 'blocked' : 'completed';
      job.stage = 'results';
      job.progress = 1;
      job.progressMessage = job.status === 'completed' ? 'Analysis completed.' : result?.message || 'Analysis requires review.';
      job.completedAt = nowIso(options);
      if (typeof options.onPublishResult === 'function') {
        job.publication = await options.onPublishResult({ job: snapshotInternal(job), model: job.model, analysisCase: job.analysisCase, result: job.result });
      }
      emit(snapshotInternal(job), job.status);
    } catch (error) {
      if (job.status === 'cancelled' || job.controller.signal.aborted) return;
      job.status = 'failed';
      job.stage = 'failed';
      job.error = { code: error?.code || 'PRODUCT_ANALYSIS_RUN_FAILED', message: error?.message || String(error) };
      job.progressMessage = job.error.message;
      job.completedAt = nowIso(options);
      emit(snapshotInternal(job), 'failed');
    }
  }

  function resolveModel(input, required = true) {
    const model = input?.model || options.getModel?.() || null;
    if (!model && required) throw productError('PRODUCT_MODEL_REQUIRED', 'Current model is not available.');
    return model;
  }

  function resolveCase(model, input, required = true) {
    let analysisCase = input?.analysisCase || null;
    const caseId = clean(input?.caseId || input?.id);
    if (!analysisCase && caseId) analysisCase = (model?.analysisCases || []).find((row) => String(row.id) === caseId) || null;
    if (!analysisCase && input?.kind) analysisCase = input;
    if (!analysisCase && required) throw productError('PRODUCT_ANALYSIS_CASE_REQUIRED', 'Analysis case is not available.');
    return analysisCase ? normalizeAnalysisCase(analysisCase) : null;
  }

  function normalizeSettings(analysisCase, input) {
    return typeof options.normalizeSettings === 'function'
      ? options.normalizeSettings(analysisCase.kind, analysisCase.settings || {}, analysisCase.input || {}, analysisCase)
      : clone({ ...(analysisCase.settings || {}), ...(analysisCase.input || {}), ...(input.settings || {}) });
  }

  function requireInternalJob(jobId) {
    const job = jobs.get(String(jobId));
    if (!job) throw productError('PRODUCT_ANALYSIS_JOB_NOT_FOUND', `Analysis job ${jobId} was not found.`);
    return job;
  }

  function requireNonlinearTool(name) {
    if (!nonlinear || typeof nonlinear[name] !== 'function') throw productError('NONLINEAR_PRODUCT_SERVICE_UNAVAILABLE', `Nonlinear product method ${name} is unavailable.`);
    return nonlinear[name].bind(nonlinear);
  }

  function proxyNonlinearControl(name, jobId) {
    const meta = delegated.get(String(jobId));
    if (!meta) throw productError('PRODUCT_ANALYSIS_JOB_NOT_NONLINEAR', `Analysis job ${jobId} is not a nonlinear delegated job.`);
    return augmentDelegatedSnapshot(requireNonlinearTool(name)(jobId), meta);
  }

  function proxyNonlinearRestart(name, jobId, input) {
    const previous = delegated.get(String(jobId));
    if (!previous) throw productError('PRODUCT_ANALYSIS_JOB_NOT_NONLINEAR', `Analysis job ${jobId} is not a nonlinear delegated job.`);
    const raw = requireNonlinearTool(name)(jobId, input);
    const nextPlan = plan({ ...previous.input, ...input, model: previous.model, analysisCase: previous.analysisCase, runId: raw.id });
    const meta = { ...previous, id: raw.id, plan: nextPlan, input: { ...previous.input, ...clone(input) } };
    delegated.set(String(raw.id), meta);
    const snapshot = augmentDelegatedSnapshot(raw, meta);
    emit(snapshot, 'created');
    return snapshot;
  }

  function emit(job, event) {
    for (const listener of subscribers) {
      try { listener(clone(job), event); } catch { /* Observers cannot affect execution. */ }
    }
    try { options.onEvent?.(clone(job), event); } catch { /* Observational callback. */ }
  }
}

function createInternalJob(id, model, analysisCase, input, plan, preflight, sequence) {
  const blocked = !preflight.ok;
  return {
    version: PRODUCT_ANALYSIS_JOB_VERSION,
    id,
    sequence,
    caseId: analysisCase.id,
    kind: analysisCase.kind,
    model,
    analysisCase,
    input: clone(input),
    plan,
    preflight,
    status: blocked ? 'blocked' : 'queued',
    stage: blocked ? 'preflight' : 'queued',
    progress: blocked ? null : 0,
    progressMessage: blocked ? preflight.blocking[0]?.message : 'Analysis queued.',
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: blocked ? new Date().toISOString() : null,
    predecessorJobId: input.predecessorJobId || null,
    controller: new AbortController(),
    desiredAction: null,
    result: null,
    resultSummary: null,
    error: blocked ? clone(preflight.blocking[0]) : null,
    progressEvents: [],
    publication: null,
    promise: null,
  };
}

function snapshotInternal(job) {
  return clone({
    version: PRODUCT_ANALYSIS_JOB_VERSION,
    serviceVersion: PRODUCT_ANALYSIS_SERVICE_VERSION,
    id: job.id,
    sequence: job.sequence,
    caseId: job.caseId,
    kind: job.kind,
    status: job.status,
    stage: job.stage,
    progress: job.progress,
    progressMessage: job.progressMessage,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    predecessorJobId: job.predecessorJobId,
    resultAvailable: Boolean(job.result),
    resultSummary: job.resultSummary,
    error: job.error,
    publication: job.publication,
    settingsHash: job.plan.settingsHash,
    planHash: job.plan.planHash,
    requestedTarget: job.plan.requestedTarget,
    executedTarget: job.plan.executedTarget,
    operationRoute: job.plan.operationRoute,
    qualification: job.result?.qualification || job.plan.qualification,
    designBlocked: job.result?.designBlocked ?? job.plan.designTransfer === 'blocked',
    productProvenance: productProvenance(job.plan),
    progressEvents: job.progressEvents.slice(-20),
  });
}

function augmentDelegatedSnapshot(raw, meta) {
  return clone({
    ...raw,
    version: PRODUCT_ANALYSIS_JOB_VERSION,
    serviceVersion: PRODUCT_ANALYSIS_SERVICE_VERSION,
    settingsHash: meta.plan.settingsHash,
    planHash: meta.plan.planHash,
    requestedTarget: meta.plan.requestedTarget,
    executedTarget: meta.plan.executedTarget,
    operationRoute: meta.plan.operationRoute,
    productProvenance: productProvenance(meta.plan),
  });
}

function decorateResult(result, plan) {
  if (!result) return null;
  const reportedFallback = result.routing?.fallbackObservation === 'MALFORMED'
    ? { status: 'MALFORMED', value: null }
    : observedBoolean([
      result.routing?.fallbackUsed,
      result.fallbackUsed,
      result.executionProvenance?.fallbackUsed,
      result.productProvenance?.fallbackUsed,
    ]);
  return clone({
    ...result,
    settingsHash: result.settingsHash || plan.settingsHash,
    settingsBytes: result.settingsBytes || plan.settingsBytes,
    planHash: plan.planHash,
    routing: {
      ...(result.routing || {}),
      requestedTarget: plan.requestedTarget,
      executedTarget: plan.executedTarget,
      operationRoute: plan.operationRoute,
      fallbackPolicy: result.routing?.fallbackPolicy ?? 'forbidden',
      fallbackObservation: reportedFallback.status,
      fallbackUsed: reportedFallback.status === 'MALFORMED'
        ? null
        : reportedFallback.status === 'ABSENT'
          ? false
          : reportedFallback.value,
    },
    productProvenance: productProvenance(plan, result),
  });
}

function observedBoolean(values) {
  const observed = values.filter((value) => value !== undefined && value !== null);
  if (observed.some((value) => typeof value !== 'boolean')) return { status: 'MALFORMED', value: null };
  if (!observed.length) return { status: 'ABSENT', value: null };
  return { status: 'OBSERVED', value: observed.some(Boolean) };
}

function productProvenance(plan, result = {}) {
  return {
    serviceVersion: PRODUCT_ANALYSIS_SERVICE_VERSION,
    planHash: plan.planHash,
    settingsHash: plan.settingsHash,
    modelHash: plan.modelHash,
    requestedTarget: plan.requestedTarget,
    executedTarget: plan.executedTarget,
    operationRoute: plan.operationRoute,
    correction: result?.payload?.diagnostics?.corrections || result?.correction || plan.correctionPolicy,
    audit: result?.payload?.audit || result?.audit || plan.auditPolicy,
    qualification: result?.qualification || plan.qualification,
    designBlocked: result?.designBlocked ?? plan.designTransfer === 'blocked',
    externalRuntimeUsed: result?.externalRuntimeUsed ?? result?.executionProvenance?.externalRuntimeUsed ?? null,
    networkFallbackUsed: result?.networkFallbackUsed ?? result?.executionProvenance?.networkFallbackUsed ?? null,
    executionProvenance: result?.executionProvenance ? clone(result.executionProvenance) : null,
  };
}

function capabilityForKind(kind, profile, policy = {}) {
  const supported = SUPPORTED_KINDS.has(kind);
  const gpuPolicyAllowed = policy?.gpuAllowed === true
    || policy?.gpuAllowedByKind?.[kind] === true;
  const gpuImplemented = kind === 'static' && profile.webgpuSupported;
  const gpuAvailable = supported && gpuImplemented && gpuPolicyAllowed;
  const gpuBlock = gpuBlockForKind(kind, profile, gpuPolicyAllowed);
  const targets = [
    {
      id: 'auto',
      label: 'Auto',
      available: supported,
      executedTarget: 'cpu',
      routeReason: 'Production auto routing remains on CPU f64 until GPU qualification is complete.',
      reason: supported ? null : 'PRODUCT_ANALYSIS_KIND_UNSUPPORTED',
      message: supported ? 'Automatically selects the qualified CPU f64 route.' : `Analysis kind ${kind} is unsupported.`,
      remediation: supported ? null : 'Select a supported analysis kind.',
    },
    {
      id: 'cpu',
      label: 'CPU precise',
      available: supported,
      executedTarget: 'cpu',
      routeReason: 'Explicit qualified CPU f64 route.',
      reason: supported ? null : 'PRODUCT_ANALYSIS_KIND_UNSUPPORTED',
      message: supported ? 'Runs the qualified CPU f64 route.' : `Analysis kind ${kind} is unsupported.`,
      remediation: supported ? null : 'Select a supported analysis kind.',
    },
    {
      id: 'gpu',
      label: 'GPU accelerated',
      available: gpuAvailable,
      executedTarget: gpuAvailable ? 'gpu' : null,
      routeReason: gpuAvailable ? 'Explicit qualified GPU route.' : gpuBlock.reason,
      reason: gpuAvailable ? null : gpuBlock.reason,
      message: gpuAvailable ? 'Runs the qualified GPU route with CPU f64 audit.' : gpuBlock.message,
      remediation: gpuAvailable ? null : gpuBlock.remediation,
    },
  ];
  return { kind, supported, targets, defaultTarget: 'auto', qualification: qualificationForKind(kind) };
}

function gpuBlockForKind(kind, profile, policyAllowed) {
  if (!profile.webgpuSupported) return {
    reason: 'WEBGPU_UNAVAILABLE',
    message: 'This browser or device does not expose WebGPU.',
    remediation: 'Use a WebGPU-capable browser and device, then run hardware qualification.',
  };
  if (kind === 'static' && !policyAllowed) return {
    reason: 'ELASTIC_GPU_PRODUCTION_QUALIFICATION_PENDING',
    message: 'Elastic GPU execution is implemented but is not production-qualified on this release profile.',
    remediation: 'Use Auto or CPU precise until the required hardware/browser matrix passes.',
  };
  if (['modal', 'responseSpectrum', 'buckling'].includes(kind)) return {
    reason: 'EIGEN_GPU_NOT_QUALIFIED',
    message: 'Modal, RSA and buckling production routes are qualified only for CPU f64.',
    remediation: 'Use Auto or CPU precise.',
  };
  if (kind === 'linearTha') return {
    reason: 'LINEAR_THA_GPU_NOT_IMPLEMENTED',
    message: 'Linear time-history GPU execution is not implemented.',
    remediation: 'Use Auto or CPU precise.',
  };
  if (NONLINEAR_KINDS.has(kind)) return {
    reason: 'NONLINEAR_GPU_PRODUCTION_KERNELS_NOT_QUALIFIED',
    message: 'Production nonlinear GPU kernels are not qualified and cannot be selected.',
    remediation: 'Use Auto or CPU precise. GPU remains an internal shadow candidate only.',
  };
  return { reason: 'GPU_ROUTE_UNAVAILABLE', message: 'GPU execution is unavailable for this analysis.', remediation: 'Use Auto or CPU precise.' };
}

function hardwareProfile(environment) {
  const runtime = environment || (typeof navigator !== 'undefined' ? navigator : {});
  const webgpuSupported = environment?.webgpuSupported ?? Boolean(runtime.gpu);
  return {
    workerSupported: environment?.workerSupported ?? typeof Worker !== 'undefined',
    wasmSupported: environment?.wasmSupported ?? typeof WebAssembly !== 'undefined',
    webgpuSupported,
    secureContext: environment?.secureContext ?? (typeof isSecureContext === 'boolean' ? isSecureContext : false),
    hardwareConcurrency: finite(runtime.hardwareConcurrency, null),
    deviceMemoryGb: finite(runtime.deviceMemory, null),
    browser: clean(environment?.browser || runtime.userAgent) || 'unknown',
  };
}

function boundedSlice(value, query, plan) {
  const limit = boundedLimit(query.limit, 200);
  let data = value;
  if (query.path) data = readPath(value, query.path);
  const selectedRowCount = Array.isArray(data) ? data.length : Array.isArray(data?.rows) ? data.rows.length : null;
  if (Array.isArray(data)) data = data.slice(0, limit);
  else if (data && typeof data === 'object' && Array.isArray(data.rows)) data = { ...data, rows: data.rows.slice(0, limit) };
  return {
    version: PRODUCT_ANALYSIS_REPORT_VERSION,
    jobId: plan.runId,
    path: query.path || query.slice || 'result',
    limit,
    data: clone(data),
    truncated: selectedRowCount != null && selectedRowCount > limit,
    productProvenance: productProvenance(plan, value),
  };
}

function operationForKind(kind) {
  return ({
    static: 'elasticStatic',
    modal: 'modalRsa',
    responseSpectrum: 'modalRsa',
    buckling: 'globalBuckling',
    linearTha: 'linearTha',
    pushover: 'productionPushover',
    nonlinearStatic: 'productionPushover',
    nlth: 'productionNlth',
    nonlinearTimeHistory: 'productionNlth',
  })[kind] || kind;
}

function backendForKind(kind, target) {
  if (target === 'gpu') return 'webgpu-hybrid-elastic';
  if (kind === 'static') return 'cpu-f64-linear3d';
  if (['modal', 'responseSpectrum', 'buckling'].includes(kind)) return 'cpu-f64-sparse-eigen';
  if (kind === 'linearTha') return 'cpu-f64-newmark-modal-or-direct';
  return 'production-wasm-sparse-nonlinear';
}

function qualificationForKind(kind) {
  if (kind === 'linearTha') return 'preliminary-design-blocked';
  if (NONLINEAR_KINDS.has(kind)) return 'G2-candidate-no-design-transfer';
  return 'production-cpu-f64';
}

function workloadClass(model = {}) {
  const dof = (model.nodes?.length || 0) * 6;
  if (dof <= 1200) return 'S';
  if (dof <= 20000) return 'M';
  return 'L';
}

function normalizeTarget(value) {
  const target = String(value || 'auto').toLowerCase();
  return PRODUCT_COMPUTE_TARGETS.includes(target) ? target : 'auto';
}

function buildRunGraph(rows) {
  const nodes = rows.map((row) => ({ id: row.id, caseId: row.caseId, status: row.status }));
  const edges = rows.filter((row) => row.predecessorJobId).map((row) => ({ from: row.predecessorJobId, to: row.id, policy: 'retry' }));
  return { version: PRODUCT_ANALYSIS_JOB_VERSION, nodes, edges, graphHash: stableHash({ nodes, edges }).slice(0, 24) };
}

function reportHtml(report) {
  return `<!doctype html><html lang="ko"><meta charset="utf-8"><title>Analysis ${escapeHtml(report.job.caseId)}</title><body><h1>Analysis ${escapeHtml(report.job.caseId)}</h1><pre>${escapeHtml(stableStringify(report))}</pre></body></html>`;
}

function telemetryCsv(data) {
  const rows = ['at,stage,value,message'];
  for (const row of data.progressEvents) rows.push([row.at, row.stage || row.type, row.value ?? row.progress, row.message].map(csv).join(','));
  return rows.join('\n');
}

function issue(code, message, remediation = null) {
  return { code, message, remediation };
}

function normalizeIssue(value = {}) {
  return {
    ...clone(value),
    ...issue(value.code || value.id || 'PRODUCT_PREFLIGHT_ISSUE', value.message || String(value), value.remediation || value.recovery || null),
  };
}

function readPath(value, path) {
  return String(path).split('.').filter(Boolean).reduce((current, key) => current?.[key], value);
}

function boundedLimit(value, fallback) {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) ? Math.max(1, Math.min(1000, number)) : fallback;
}

function retain(rows, value, limit) {
  rows.push(value);
  if (rows.length > limit) rows.splice(0, rows.length - limit);
}

function nowIso(options) {
  const value = typeof options.now === 'function' ? options.now() : Date.now();
  return new Date(value).toISOString();
}

function utf8Bytes(value) {
  return typeof TextEncoder === 'function' ? new TextEncoder().encode(value) : Uint8Array.from([...unescape(encodeURIComponent(value))].map((row) => row.charCodeAt(0)));
}

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clean(value) {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function clone(value) {
  if (value == null) return value;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function freezeClone(value) {
  return Object.freeze(clone(value));
}

function csv(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function productError(code, message) {
  return Object.assign(new Error(message), { code });
}
