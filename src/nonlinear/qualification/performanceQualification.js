import { stableHash } from '../../core/stableHash.js';
import { createNonlinearStateStore, createStateCheckpoint, restoreStateCheckpoint } from '../core/stateStore.js';
import { createDynamicHistoryCollector } from '../dynamics/dynamicHistory.js';
import {
  PHASE8_REFERENCE_PROFILE_CONTRACT,
  PHASE8_UX_PERFORMANCE_BUDGET,
  PHASE8_WORKLOAD_FIXTURES,
} from '../performanceBaseline.js';
import { createWorkerCore } from '../runtime/workerCore.js';
import {
  WORKER_RESPONSE_TYPES,
  createCancelRequest,
  createRunRequest,
} from '../runtime/protocol.js';
import { estimateRuntimeMemory, runRuntimePreflight } from '../runtime/preflight.js';
import { compareReferenceValues, solveIndependentDenseSystem } from './independentReferences.js';

export const PHASE8_PERFORMANCE_QUALIFICATION_VERSION = 'p8-m11-performance-qualification-v1';
export const PHASE8_PERFORMANCE_MEASUREMENT_VERSION = 'p8-m11-performance-measurement-v1';

const REQUIRED_IDS = Object.freeze(Array.from({ length: 16 }, (_, index) => `NL-PERF-${String(index + 1).padStart(2, '0')}`));

export async function measurePhase8Performance(input = {}) {
  const backend = requireProductionBackend(input.backend);
  const config = normalizeConfiguration(input);
  const memoryBefore = memorySnapshot();
  const small = measureSmallCrossCheck(backend, config);
  const mediumKernel = measureMediumSparseKernel(backend, config);
  const streaming = measureLongHistoryStreaming(config);
  const worker = await measureWorkerProtocolLatency();
  const checkpoint = measureCheckpointIntegrity();
  const memoryAfter = memorySnapshot();
  const preflight = runRuntimePreflight({
    dofCount: config.targetDof,
    nnz: config.targetNnz,
    backendMode: 'production',
    backend,
    matrixClass: 'spd',
    availableMemoryBytes: config.availableMemoryBytes,
  });
  const missingBackendPreflight = runRuntimePreflight({
    dofCount: config.targetDof,
    nnz: config.targetNnz,
    backendMode: 'production',
    matrixClass: 'spd',
  });
  const deterministic = compareReferenceValues(mediumKernel.firstSolution, mediumKernel.lastSolution, {
    absoluteTolerance: 0,
    relativeTolerance: 0,
  });
  const observations = {
    version: PHASE8_PERFORMANCE_MEASUREMENT_VERSION,
    profile: clone(input.referenceProfile || null),
    config,
    backend: describeBackend(backend),
    small,
    mediumKernel,
    streaming,
    worker,
    checkpoint,
    preflight,
    missingBackendPreflight,
    deterministic,
    parallel: normalizeExternalEvidence(input.parallelEvidence, 'deterministic-parallel-worker'),
    uiLatency: normalizeExternalEvidence(input.uiLatencyEvidence, 'main-thread-ui-latency'),
    endToEnd: {
      pushoverMedium: normalizeExternalEvidence(input.endToEnd?.pushoverMedium, 'end-to-end-production-frame-pushover'),
      pushoverTarget: normalizeExternalEvidence(input.endToEnd?.pushoverTarget, 'end-to-end-production-frame-pushover-target'),
      nlthMedium: normalizeExternalEvidence(input.endToEnd?.nlthMedium, 'end-to-end-production-frame-nlth'),
    },
    memory: { before: memoryBefore, after: memoryAfter },
  };
  const evaluated = evaluatePhase8PerformanceQualification(observations);
  return deepFreeze({
    ...evaluated,
    measurement: observations,
    measurementHash: stableHash(observations).slice(0, 24),
  });
}

export function evaluatePhase8PerformanceQualification(measurement = {}) {
  const budget = PHASE8_UX_PERFORMANCE_BUDGET;
  const smallPass = measurement.small?.ok === true;
  const kernelPass = measurement.mediumKernel?.ok === true;
  const noDense = measurement.mediumKernel?.denseFallbackUsed === false;
  const streamPass = measurement.streaming?.ok === true && measurement.streaming?.retainedBytes === 0;
  const cancellationPass = measurement.worker?.cancelled === true && measurement.worker?.restartCompleted === true;
  const cancellationLatencyPass = Number(measurement.worker?.cancelAcknowledgementMs) <= budget.cancelAcknowledgementMaxMs;
  const symbolicPass = Number(measurement.mediumKernel?.symbolicCacheHitCount) > 0
    && Number(measurement.mediumKernel?.symbolicAnalysisCountMaximum) === Number(measurement.mediumKernel?.symbolicAnalysisCountMinimum);
  const checkpointPass = measurement.checkpoint?.ok === true;
  const deterministicPass = measurement.deterministic?.ok === true;
  const preflightPass = measurement.preflight?.ok === true;
  const missingBackendPass = measurement.missingBackendPreflight?.code === 'PRODUCTION_BACKEND_UNAVAILABLE'
    && measurement.missingBackendPreflight?.backend?.fallbackUsed === false;
  const estimatedMemoryPass = Number(measurement.preflight?.estimate?.totalBytes) <= budget.engineeringTargets.peakAnalysisMemoryMaxBytes;
  const uiLatencyPass = externalEvidencePass(measurement.uiLatency)
    && Number(measurement.uiLatency.metrics?.p95Ms) <= budget.inputAcknowledgementP95Ms;
  const parallelPass = externalEvidencePass(measurement.parallel)
    && measurement.parallel.metrics?.deterministic === true
    && measurement.parallel.metrics?.eventOrderingEquivalent === true;
  const pushMedium = endToEndPass(measurement.endToEnd?.pushoverMedium, 'PERF-PUSH-M', budget.engineeringTargets.pushMediumMaxMs);
  const pushTarget = endToEndPass(measurement.endToEnd?.pushoverTarget, 'PERF-PUSH-L', null);
  const nlthMedium = endToEndPass(measurement.endToEnd?.nlthMedium, 'PERF-NLTH-M', budget.engineeringTargets.nlthMediumMaxMs);

  const rows = [
    row('NL-PERF-01', smallPass, 'Small dense/separate-reference versus WASM sparse cross-check and timing recorded.', measurement.small),
    row('NL-PERF-02', pushMedium, 'Medium 3D frame Pushover with 100 accepted/output steps measured end to end.', measurement.endToEnd?.pushoverMedium, 'M_TIER_PUSHOVER_END_TO_END_REQUIRED'),
    row('NL-PERF-03', preflightPass && estimatedMemoryPass && kernelPass, 'Target-size sparse memory estimate and measured kernel stay within the fixed budget.', {
      estimatedBytes: measurement.preflight?.estimate?.totalBytes,
      budgetBytes: budget.engineeringTargets.peakAnalysisMemoryMaxBytes,
      targetDof: measurement.preflight?.dofCount,
      targetNnz: measurement.preflight?.nnz,
      kernelDof: measurement.mediumKernel?.dofCount,
    }),
    row('NL-PERF-04', streamPass, 'Long NLTH output history is streamed with zero retained chunk payload bytes.', measurement.streaming),
    row('NL-PERF-05', cancellationPass, 'Cancellation preserves the committed boundary and a fresh run can restart.', measurement.worker),
    row('NL-PERF-06', noDense, 'Production backend diagnostics report no dense allocation or fallback.', measurement.mediumKernel),
    row('NL-PERF-07', uiLatencyPass, 'Browser main-thread input acknowledgement p95 stays within 100 ms during an M-tier Worker run.', measurement.uiLatency, 'BROWSER_UI_LATENCY_EVIDENCE_REQUIRED'),
    row('NL-PERF-08', cancellationLatencyPass, 'Cancellation acknowledgement is returned within two seconds.', measurement.worker),
    row('NL-PERF-09', missingBackendPass, 'Missing production WASM backend blocks execution without reference fallback.', measurement.missingBackendPreflight),
    row('NL-PERF-10', symbolicPass, 'Unchanged topology reuses the symbolic pattern and ordering.', measurement.mediumKernel),
    row('NL-PERF-11', streamPass && checkpointPass, 'Trial/output buffers and restart state remain bounded by explicit retention contracts.', {
      retainedBytes: measurement.streaming?.retainedBytes,
      checkpointHash: measurement.checkpoint?.checkpointHash,
    }),
    row('NL-PERF-12', pushMedium, 'Reference-hardware M-tier production-frame Pushover satisfies time and memory budgets.', measurement.endToEnd?.pushoverMedium, 'M_TIER_PUSHOVER_END_TO_END_REQUIRED'),
    row('NL-PERF-13', nlthMedium, 'Reference-hardware M-tier production-frame NLTH satisfies time and memory budgets.', measurement.endToEnd?.nlthMedium, 'M_TIER_NLTH_END_TO_END_REQUIRED'),
    row('NL-PERF-14', streamPass, 'Result streaming keeps analysis-retained history bounded as output count grows.', measurement.streaming),
    row('NL-PERF-15', checkpointPass, 'Chunk and checkpoint hashes validate and restart reproduces the committed state.', measurement.checkpoint),
    row('NL-PERF-16', parallelPass, 'Independent Worker runs preserve result norms and event ordering.', measurement.parallel, 'PARALLEL_WORKER_EVIDENCE_REQUIRED'),
  ];

  // Target-tier execution is recorded separately because PERF-03 is a memory
  // qualification and must not be mistaken for an end-to-end L-tier run.
  const targetObservation = row('NL-PERF-TARGET-OBSERVATION', pushTarget, 'Target production-frame Pushover end-to-end observation.', measurement.endToEnd?.pushoverTarget, 'TARGET_PUSHOVER_END_TO_END_REQUIRED');
  const blockerCodes = rows.filter((item) => item.status !== 'PASS').map((item) => item.blockerCode).filter(Boolean);
  const core = {
    version: PHASE8_PERFORMANCE_QUALIFICATION_VERSION,
    status: rows.every((item) => item.status === 'PASS') ? 'PASS' : 'BLOCKED',
    verificationIds: REQUIRED_IDS,
    results: rows,
    targetObservation,
    blockers: [...new Set(blockerCodes)],
    budgets: budget,
    workloadFixtures: PHASE8_WORKLOAD_FIXTURES,
    profileContract: PHASE8_REFERENCE_PROFILE_CONTRACT,
  };
  return deepFreeze({ ...core, qualificationHash: stableHash(core).slice(0, 24) });
}

export function validatePhase8PerformanceMeasurement(measurement = {}) {
  const errors = [];
  if (measurement.version !== PHASE8_PERFORMANCE_MEASUREMENT_VERSION) errors.push('measurement:version');
  if (!measurement.backend?.production) errors.push('measurement:backend-production');
  if (measurement.backend?.numericPrecision !== 'f64') errors.push('measurement:backend-precision');
  if (measurement.backend?.deterministic !== true) errors.push('measurement:backend-deterministic');
  if (!measurement.small?.ok) errors.push('measurement:small');
  if (!measurement.mediumKernel?.ok) errors.push('measurement:medium-kernel');
  if (!measurement.streaming?.ok) errors.push('measurement:streaming');
  if (!measurement.worker?.cancelled) errors.push('measurement:cancellation');
  if (!measurement.checkpoint?.ok) errors.push('measurement:checkpoint');
  return { ok: errors.length === 0, errors };
}

export function buildPhase8TridiagonalCsr(size, options = {}) {
  const n = positiveInteger(size, null, 'size');
  const diagonal = finite(options.diagonal ?? 4, 'diagonal');
  const offDiagonal = finite(options.offDiagonal ?? -1, 'offDiagonal');
  if (!(diagonal > 2 * Math.abs(offDiagonal))) {
    throw performanceError('PERFORMANCE_MATRIX_NOT_STRICTLY_DIAGONALLY_DOMINANT', 'Qualification matrix must be strictly diagonally dominant SPD.');
  }
  const rowPtr = new Uint32Array(n + 1);
  const columns = [];
  const values = [];
  for (let rowIndex = 0; rowIndex < n; rowIndex += 1) {
    if (rowIndex > 0) {
      columns.push(rowIndex - 1);
      values.push(offDiagonal);
    }
    columns.push(rowIndex);
    values.push(diagonal);
    if (rowIndex + 1 < n) {
      columns.push(rowIndex + 1);
      values.push(offDiagonal);
    }
    rowPtr[rowIndex + 1] = columns.length;
  }
  return Object.freeze({
    format: 'csr',
    rowCount: n,
    colCount: n,
    nnz: values.length,
    rowPtr,
    colIdx: Uint32Array.from(columns),
    values: Float64Array.from(values),
  });
}

function measureSmallCrossCheck(backend, config) {
  const matrix = buildPhase8TridiagonalCsr(config.smallDof);
  const expected = Float64Array.from({ length: config.smallDof }, (_, index) => Math.sin((index + 1) / 7) + 0.25);
  const rhs = csrMatVec(matrix, expected);
  const dense = csrToDense(matrix);
  const referenceStarted = now();
  const reference = solveIndependentDenseSystem(dense, rhs);
  const referenceMs = now() - referenceStarted;
  const sparseStarted = now();
  const sparse = backend.solve(matrix, rhs, solveOptions());
  const sparseMs = now() - sparseStarted;
  const comparison = sparse.ok ? compareReferenceValues(sparse.x, reference.solution, {
    absoluteTolerance: 1e-10,
    relativeTolerance: 1e-10,
  }) : { ok: false };
  return deepFreeze({
    ok: sparse.ok === true && reference.ok === true && comparison.ok === true,
    dofCount: config.smallDof,
    nnz: matrix.nnz,
    referenceMs,
    sparseMs,
    relativeError: comparison.relativeL2 ?? null,
    sparseResidual: sparse.diagnostics?.relativeResidual ?? null,
    backendDiagnostics: compactDiagnostics(sparse.diagnostics),
  });
}

function measureMediumSparseKernel(backend, config) {
  const matrix = buildPhase8TridiagonalCsr(config.mediumDof);
  const exact = Float64Array.from({ length: config.mediumDof }, (_, index) => 0.5 + Math.sin((index + 1) / 29));
  const baseRhs = csrMatVec(matrix, exact);
  for (let run = 0; run < config.warmupRuns; run += 1) {
    const warmup = backend.solve(matrix, baseRhs, solveOptions());
    if (!warmup.ok) throw performanceError(warmup.reason || 'PERFORMANCE_WARMUP_FAILED', 'WASM sparse warmup failed.');
  }
  const durations = [];
  let firstSolution = null;
  let lastSolution = null;
  let symbolicCacheHitCount = 0;
  let symbolicAnalysisCountMinimum = Infinity;
  let symbolicAnalysisCountMaximum = -Infinity;
  let denseFallbackUsed = false;
  let maximumRelativeResidual = 0;
  for (let run = 0; run < config.measuredRuns; run += 1) {
    const started = now();
    for (let step = 0; step < config.pushoverKernelSteps; step += 1) {
      const scale = 1 + step / Math.max(1, config.pushoverKernelSteps);
      const rhs = Float64Array.from(baseRhs, (value) => value * scale);
      const result = backend.solve(matrix, rhs, solveOptions());
      if (!result.ok) throw performanceError(result.reason || 'PERFORMANCE_KERNEL_SOLVE_FAILED', `Sparse kernel solve failed at run ${run}, step ${step}.`);
      const normalized = Float64Array.from(result.x, (value) => value / scale);
      firstSolution ||= Array.from(normalized);
      lastSolution = Array.from(normalized);
      const diagnostics = result.diagnostics || {};
      if (diagnostics.symbolicCacheHit === true) symbolicCacheHitCount += 1;
      if (Number.isFinite(diagnostics.symbolicAnalysisCount)) {
        symbolicAnalysisCountMinimum = Math.min(symbolicAnalysisCountMinimum, diagnostics.symbolicAnalysisCount);
        symbolicAnalysisCountMaximum = Math.max(symbolicAnalysisCountMaximum, diagnostics.symbolicAnalysisCount);
      }
      denseFallbackUsed ||= diagnostics.denseMatrixAllocated === true
        || diagnostics.denseFallbackAllocated === true
        || Number(diagnostics.denseConversionCount || 0) > 0;
      maximumRelativeResidual = Math.max(maximumRelativeResidual, Number(diagnostics.relativeResidual || 0));
    }
    durations.push(now() - started);
  }
  const comparison = compareReferenceValues(lastSolution, exact, {
    absoluteTolerance: 1e-8,
    relativeTolerance: 1e-8,
  });
  const memoryEstimate = estimateRuntimeMemory({
    dofCount: config.mediumDof,
    nnz: matrix.nnz,
    backendMode: 'production',
    resultVectorCount: 4,
  });
  return deepFreeze({
    ok: comparison.ok && !denseFallbackUsed,
    coverage: 'production-wasm-sparse-kernel-not-end-to-end-frame-analysis',
    workloadAnalog: 'PERF-PUSH-M-linear-system-path',
    dofCount: config.mediumDof,
    nnz: matrix.nnz,
    solveCount: config.measuredRuns * config.pushoverKernelSteps,
    warmupRuns: config.warmupRuns,
    measuredRuns: config.measuredRuns,
    stepsPerRun: config.pushoverKernelSteps,
    durationsMs: durations,
    medianMs: percentile(durations, 0.5),
    p95Ms: percentile(durations, 0.95),
    relativeError: comparison.relativeL2,
    maximumRelativeResidual,
    denseFallbackUsed,
    symbolicCacheHitCount,
    symbolicAnalysisCountMinimum: Number.isFinite(symbolicAnalysisCountMinimum) ? symbolicAnalysisCountMinimum : null,
    symbolicAnalysisCountMaximum: Number.isFinite(symbolicAnalysisCountMaximum) ? symbolicAnalysisCountMaximum : null,
    estimatedBytes: memoryEstimate.totalBytes,
    firstSolution,
    lastSolution,
    solutionHash: stableHash(lastSolution).slice(0, 24),
  });
}

function measureLongHistoryStreaming(config) {
  let chunkCount = 0;
  let streamedBytes = 0;
  const chunkHashes = [];
  const memoryBefore = memorySnapshot();
  const collector = createDynamicHistoryCollector({
    chunkSize: config.historyChunkSize,
    retainChunks: false,
    retainInternalSteps: false,
    memoryBudgetBytes: config.historyMemoryBudgetBytes,
    channels: ['baseReactionForce', 'energies'],
    onChunk(chunk) {
      chunkCount += 1;
      streamedBytes += Number(chunk.bytes || 0);
      chunkHashes.push(chunk.chunkHash);
    },
  });
  const started = now();
  for (let step = 0; step < config.historySteps; step += 1) {
    const phase = step / 17;
    collector.appendOutput({
      time: step * 0.01,
      sourceInternalStep: step,
      sourceSubstepLevel: 0,
      baseReactionForce: [Math.sin(phase), Math.cos(phase), 0],
      energies: { input: step * 0.001, damping: step * 0.0001 },
    });
  }
  const manifest = collector.finalize({ workloadId: 'PERF-NLTH-M-streaming-path' });
  const durationMs = now() - started;
  const memoryAfter = memorySnapshot();
  return deepFreeze({
    ok: manifest.outputStepCount === config.historySteps
      && manifest.retainedChunkCount === 0
      && manifest.retainedBytes === 0
      && manifest.chunkCount === chunkCount,
    coverage: 'production-dynamic-history-streaming-contract-not-end-to-end-integration',
    outputStepCount: manifest.outputStepCount,
    chunkCount,
    chunkSize: config.historyChunkSize,
    retainedChunkCount: manifest.retainedChunkCount,
    retainedBytes: manifest.retainedBytes,
    streamedBytes,
    durationMs,
    chunkHashChain: stableHash(chunkHashes).slice(0, 24),
    manifestHash: manifest.manifestHash,
    memory: { before: memoryBefore, after: memoryAfter },
  });
}

async function measureWorkerProtocolLatency() {
  const events = [];
  let releaseTask;
  let signalStarted;
  const taskGate = new Promise((resolve) => { releaseTask = resolve; });
  const startedGate = new Promise((resolve) => { signalStarted = resolve; });
  const core = createWorkerCore({
    postMessage(message) {
      events.push({ message, at: now() });
    },
    async taskHandler(task, context) {
      if (task.type === 'P8_M11_CANCEL_PROBE') {
        context.commitBoundary({ checkpoint: 1 });
        context.reportProgress({ step: 1 });
        signalStarted();
        await taskGate;
        context.throwIfCancellationRequested();
        context.commitBoundary({ checkpoint: 2 });
        return { ok: true };
      }
      if (task.type === 'P8_M11_RESTART_PROBE') {
        context.commitBoundary({ checkpoint: 1 });
        return { ok: true, resultHash: 'restart-deterministic' };
      }
      throw performanceError('PERFORMANCE_WORKER_TASK_INVALID', `Unexpected performance task ${task.type}.`);
    },
  });
  const requestStarted = now();
  const running = core.handleMessage(createRunRequest({
    requestId: 'p8-m11-cancel-run',
    runToken: 'p8-m11-cancel-token',
    task: { type: 'P8_M11_CANCEL_PROBE', payload: null },
  }));
  await startedGate;
  const acceptedEvent = events.find((event) => event.message.type === WORKER_RESPONSE_TYPES.accepted);
  const inputAcknowledgementMs = acceptedEvent ? acceptedEvent.at - requestStarted : Infinity;
  const cancelStarted = now();
  const acknowledgement = await core.handleMessage(createCancelRequest({
    requestId: 'p8-m11-cancel-request',
    runToken: 'p8-m11-cancel-token',
  }));
  const cancelAcknowledgementMs = now() - cancelStarted;
  releaseTask();
  const cancelled = await running;
  const restart = await core.handleMessage(createRunRequest({
    requestId: 'p8-m11-restart-run',
    runToken: 'p8-m11-restart-token',
    task: { type: 'P8_M11_RESTART_PROBE', payload: null },
  }));
  const cancelEvents = events.filter((event) => event.message.runToken === 'p8-m11-cancel-token');
  const ordered = cancelEvents.every((event, index) => index === 0 || Number(event.message.sequence) > Number(cancelEvents[index - 1].message.sequence));
  return deepFreeze({
    inputAcknowledgementMs,
    cancelAcknowledgementMs,
    acknowledged: acknowledgement.acknowledged === true,
    cancelled: cancelled.code === 'CANCELLED',
    committedBoundary: cancelEvents.at(-1)?.message.committedBoundary ?? null,
    discardedUncommitted: cancelEvents.at(-1)?.message.discardedUncommitted === true,
    restartCompleted: restart.ok === true,
    eventOrderingMonotonic: ordered,
    eventTypes: cancelEvents.map((event) => event.message.type),
  });
}

function measureCheckpointIntegrity() {
  const store = createNonlinearStateStore({
    domainHash: 'p8-m11-checkpoint-domain',
    committed: { step: 25, time: 2.5, lambda: 0.8, q: [0.1, -0.2], v: [0.01, 0], a: [0, 0.02] },
  });
  const checkpoint = createStateCheckpoint(store, { role: 'p8-m11-integrity-probe' });
  const restored = restoreStateCheckpoint(checkpoint, { domainHash: store.domainHash });
  return deepFreeze({
    ok: restored.committedHash === store.committedHash && restored.storeHash === store.storeHash,
    checkpointHash: checkpoint.integrityHash,
    committedHash: checkpoint.committedHash,
    restoredStoreHash: restored.storeHash,
  });
}

function row(id, pass, statement, metrics, blockerCode = null) {
  return deepFreeze({
    id,
    status: pass ? 'PASS' : 'BLOCKED',
    statement,
    metrics: compact(metrics),
    blockerCode: pass ? null : blockerCode || `${id.replaceAll('-', '_')}_FAILED`,
  });
}

function endToEndPass(evidence, workloadId, maximumDurationMs) {
  if (!externalEvidencePass(evidence)) return false;
  if (evidence.coverage !== 'end-to-end-production-frame') return false;
  if (evidence.workloadId !== workloadId) return false;
  const duration = Number(evidence.metrics?.durationMs);
  const memory = Number(evidence.metrics?.peakMemoryBytes);
  if (!Number.isFinite(duration) || !Number.isFinite(memory)) return false;
  if (maximumDurationMs != null && duration > maximumDurationMs) return false;
  return memory <= PHASE8_UX_PERFORMANCE_BUDGET.engineeringTargets.peakAnalysisMemoryMaxBytes;
}

function externalEvidencePass(evidence) {
  return evidence?.status === 'PASS'
    && clean(evidence.profileId)
    && clean(evidence.sourceHash)
    && evidence.reproducible === true;
}

function normalizeExternalEvidence(value, expectedKind) {
  if (!value || typeof value !== 'object') return deepFreeze({
    status: 'MISSING',
    kind: expectedKind,
    coverage: null,
    profileId: null,
    sourceHash: null,
    reproducible: false,
    metrics: null,
  });
  return deepFreeze({
    status: value.status === 'PASS' ? 'PASS' : 'BLOCKED',
    kind: expectedKind,
    coverage: clean(value.coverage) || null,
    workloadId: clean(value.workloadId) || null,
    profileId: clean(value.profileId) || null,
    sourceHash: clean(value.sourceHash) || null,
    reproducible: value.reproducible === true,
    metrics: clone(value.metrics || null),
  });
}

function normalizeConfiguration(input) {
  return deepFreeze({
    smallDof: positiveInteger(input.smallDof, 24, 'smallDof'),
    mediumDof: positiveInteger(input.mediumDof, 10000, 'mediumDof'),
    targetDof: positiveInteger(input.targetDof, 50000, 'targetDof'),
    targetNnz: positiveInteger(input.targetNnz, 75000 * 144, 'targetNnz'),
    pushoverKernelSteps: positiveInteger(input.pushoverKernelSteps, 100, 'pushoverKernelSteps'),
    historySteps: positiveInteger(input.historySteps, 20000, 'historySteps'),
    historyChunkSize: positiveInteger(input.historyChunkSize, 200, 'historyChunkSize'),
    historyMemoryBudgetBytes: positiveInteger(input.historyMemoryBudgetBytes, 64 * 1024 * 1024, 'historyMemoryBudgetBytes'),
    warmupRuns: positiveInteger(input.warmupRuns, 1, 'warmupRuns'),
    measuredRuns: positiveInteger(input.measuredRuns, 5, 'measuredRuns'),
    availableMemoryBytes: positiveInteger(input.availableMemoryBytes, 8 * 1024 ** 3, 'availableMemoryBytes'),
  });
}

function requireProductionBackend(backend) {
  if (!backend || typeof backend.solve !== 'function' || backend.production !== true) {
    throw performanceError('PERFORMANCE_PRODUCTION_BACKEND_REQUIRED', 'A production sparse backend is required for Phase 8 performance measurement.');
  }
  if (backend.numericPrecision !== 'f64' || backend.deterministic !== true) {
    throw performanceError('PERFORMANCE_BACKEND_QUALIFICATION_REQUIRED', 'Performance measurements require a deterministic f64 backend.');
  }
  return backend;
}

function describeBackend(backend) {
  return deepFreeze({
    id: backend.id || null,
    production: backend.production === true,
    executionTarget: backend.executionTarget || null,
    numericPrecision: backend.numericPrecision || null,
    deterministic: backend.deterministic === true,
    matrixClasses: [...(backend.matrixClasses || [])],
    preflight: clone(backend.preflight?.() || null),
  });
}

function solveOptions() {
  return { matrixClass: 'spd', pivotTolerance: 1e-13, relativeTolerance: 1e-10 };
}

function csrMatVec(matrix, vector) {
  const result = new Float64Array(matrix.rowCount);
  for (let rowIndex = 0; rowIndex < matrix.rowCount; rowIndex += 1) {
    let value = 0;
    for (let offset = matrix.rowPtr[rowIndex]; offset < matrix.rowPtr[rowIndex + 1]; offset += 1) {
      value += matrix.values[offset] * vector[matrix.colIdx[offset]];
    }
    result[rowIndex] = value;
  }
  return result;
}

function csrToDense(matrix) {
  const dense = Array.from({ length: matrix.rowCount }, () => new Array(matrix.colCount).fill(0));
  for (let rowIndex = 0; rowIndex < matrix.rowCount; rowIndex += 1) {
    for (let offset = matrix.rowPtr[rowIndex]; offset < matrix.rowPtr[rowIndex + 1]; offset += 1) {
      dense[rowIndex][matrix.colIdx[offset]] += matrix.values[offset];
    }
  }
  return dense;
}

function percentile(values, fraction) {
  const sorted = values.slice().sort((left, right) => left - right);
  if (!sorted.length) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index];
}

function compactDiagnostics(value = {}) {
  return {
    backendId: value.backendId || null,
    method: value.method || null,
    relativeResidual: value.relativeResidual ?? null,
    denseMatrixAllocated: value.denseMatrixAllocated === true,
    denseFallbackAllocated: value.denseFallbackAllocated === true,
    denseConversionCount: Number(value.denseConversionCount || 0),
    deterministic: value.deterministic === true,
  };
}

function memorySnapshot() {
  const processMemory = globalThis.process?.memoryUsage?.();
  const browserMemory = globalThis.performance?.memory;
  return {
    heapUsedBytes: finiteOrNull(processMemory?.heapUsed ?? browserMemory?.usedJSHeapSize),
    residentSetBytes: finiteOrNull(processMemory?.rss),
    heapLimitBytes: finiteOrNull(browserMemory?.jsHeapSizeLimit),
  };
}

function compact(value) {
  if (value == null) return null;
  const copy = clone(value);
  if (copy && typeof copy === 'object') {
    delete copy.firstSolution;
    delete copy.lastSolution;
  }
  return copy;
}

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function finite(value, path) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw performanceError('PERFORMANCE_VALUE_NONFINITE', `${path} must be finite.`);
  return number;
}

function positiveInteger(value, fallback, path) {
  if (value == null && fallback != null) return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw performanceError('PERFORMANCE_VALUE_INVALID', `${path} must be a positive integer.`);
  return number;
}

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function now() {
  return globalThis.performance?.now ? globalThis.performance.now() : Date.now();
}

function performanceError(code, message) {
  const error = new Error(message);
  error.name = 'Phase8PerformanceQualificationError';
  error.code = code;
  return error;
}

function clone(value) {
  if (value == null) return value;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value) || ArrayBuffer.isView(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}
