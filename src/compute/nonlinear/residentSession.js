import { stableHash } from '../../core/stableHash.js';
import {
  createStateCheckpoint,
  restoreStateCheckpoint,
  stateStoreByteSnapshot,
} from '../../nonlinear/core/stateStore.js';
import { partitionNonlinearBatchCapability } from './capability.js';
import { createNonlinearBatchStateArena } from './stateArena.js';

export const NONLINEAR_RESIDENT_SESSION_VERSION = 'p9-m8-nonlinear-resident-session-v1';

const DEFAULT_MAX_RESIDENT_BYTES = 512 * 1024 * 1024;
const DEFAULT_MAX_TRANSFER_BYTES = 16 * 1024 * 1024;
const DEFAULT_TOTAL_TRANSFER_BYTES = 256 * 1024 * 1024;
const DEFAULT_STATE_SLOT_BYTES = 4096;
const DEFAULT_TRACE_LIMIT = 256;

export function createNonlinearResidentSession(options = {}) {
  const assembler = options.assembler;
  const batch = assembler?.elementBatch;
  const stateStore = options.stateStore;
  if (!batch?.elementIds?.length || !stateStore?.committed) {
    throw sessionError('NONLINEAR_RESIDENT_INPUT_INVALID', 'Resident nonlinear execution requires an assembler batch and committed state store.');
  }
  const runId = requiredText(options.runId, 'runId');
  const kind = normalizeKind(options.kind);
  const production = options.production !== false;
  const requestedTarget = normalizeTarget(options.computeTarget || options.target);
  const capability = partitionNonlinearBatchCapability(batch, { target: requestedTarget, production });
  if (!capability.ok) {
    throw sessionError(capability.reason || 'NONLINEAR_RESIDENT_ROUTE_UNAVAILABLE', 'The requested nonlinear execution route is not available.', capability);
  }
  const domainHash = assembler.domain?.identity?.domainHash || assembler.domain?.hashes?.domainHash || stateStore.domainHash || null;
  const initialCheckpoint = options.checkpoint || createStateCheckpoint(stateStore, {
    role: 'p9-m8-resident-initial',
    runId,
    kind,
  });
  const restored = restoreStateCheckpoint(initialCheckpoint, { domainHash });
  if (stateStoreByteSnapshot(restored) !== stateStoreByteSnapshot(stateStore)) {
    throw sessionError('NONLINEAR_RESIDENT_CHECKPOINT_STATE_MISMATCH', 'The initial checkpoint does not match the resident committed state.');
  }

  const elementIds = Object.freeze(Array.from(batch.elementIds, String));
  const initialStates = normalizeElementStates(stateStore.committed.elementStates, elementIds);
  const byteCapacities = Object.fromEntries(elementIds.map((id) => [
    id,
    stateSlotCapacity(initialStates[id], options.stateSlotGrowthFactor),
  ]));
  const maxResidentBytes = positiveInteger(options.maxResidentBytes, DEFAULT_MAX_RESIDENT_BYTES);
  const arena = createNonlinearBatchStateArena({
    ownerRunId: runId,
    elementIds,
    initialStates,
    minimumSlotBytes: positiveInteger(options.minimumStateSlotBytes, DEFAULT_STATE_SLOT_BYTES),
    byteCapacities,
    maxTotalBytes: maxResidentBytes,
  });
  const arenaBytes = arena.snapshot().byteLength;
  const batchBytes = estimateBatchBytes(batch);
  if (arenaBytes + batchBytes > maxResidentBytes) {
    arena.dispose(runId);
    throw sessionError('NONLINEAR_RESIDENT_MEMORY_BUDGET_EXCEEDED', 'Nonlinear resident state exceeds its configured memory budget.', {
      maxResidentBytes,
      arenaBytes,
      batchBytes,
    });
  }
  try {
    assertArenaState(initialStates, 'NONLINEAR_RESIDENT_INITIAL_STATE_MISMATCH');
  } catch (error) {
    arena.dispose(runId);
    throw error;
  }

  const traceLimit = positiveInteger(options.traceLimit, DEFAULT_TRACE_LIMIT);
  const maxTransferBytes = positiveInteger(options.maxTransferBytes, DEFAULT_MAX_TRANSFER_BYTES);
  const totalTransferBudgetBytes = positiveInteger(options.totalTransferBudgetBytes, DEFAULT_TOTAL_TRANSFER_BYTES);
  const commits = [];
  const rejections = [];
  const transfers = [];
  const audits = [];
  const failures = [];
  let committedStore = stateStore;
  let canonicalCheckpoint = initialCheckpoint;
  let transferBytes = 0;
  let transferCount = 0;
  let commitCount = 0;
  let rejectionCount = 0;
  let auditCount = 0;
  let disposed = false;
  let matrixClass = assembler.requiredMatrixClass === 'general' ? 'general' : 'spd';

  return Object.freeze({
    version: NONLINEAR_RESIDENT_SESSION_VERSION,
    runId,
    kind,
    capability,
    beginTrial,
    stageTrialStates,
    acceptBoundary,
    rejectBoundary,
    recordCheckpoint,
    recordTransfer,
    auditEvaluation,
    handleFailure,
    snapshot,
    finalize,
  });

  function beginTrial(metadata = {}) {
    assertAvailable();
    if (arena.trialActive) throw sessionError('NONLINEAR_RESIDENT_TRIAL_ACTIVE', 'A resident trial is already active.');
    const before = arena.snapshot();
    arena.beginTrial(runId);
    return Object.freeze({
      version: NONLINEAR_RESIDENT_SESSION_VERSION,
      runId,
      kind,
      epoch: before.epoch,
      committedHash: committedStore.committedHash,
      metadata: boundedDescriptor(metadata),
    });
  }

  function stageTrialStates(elementStates) {
    assertAvailable();
    if (!arena.trialActive) beginTrial({ source: 'implicit-stage' });
    const normalized = normalizeElementStates(elementStates, elementIds);
    for (const id of elementIds) arena.writeTrial(id, normalized[id], runId);
    const staged = Object.fromEntries(elementIds.map((id) => [id, arena.readTrial(id)]));
    if (stableHash(staged) !== stableHash(normalized)) {
      arena.rollback(runId);
      throw sessionError('NONLINEAR_RESIDENT_TRIAL_STATE_MISMATCH', 'Resident trial state does not match the canonical CPU f64 state.');
    }
    return Object.freeze({ trialStateHash: stableHash(staged), elementCount: elementIds.length });
  }

  function acceptBoundary(nextStore, metadata = {}) {
    assertAvailable();
    validateStoreBoundary(nextStore);
    const audit = metadata.evaluation || metadata.energies
      ? auditEvaluation(metadata.evaluation, { energies: metadata.energies, mode: metadata.mode })
      : null;
    const normalized = normalizeElementStates(nextStore.committed.elementStates, elementIds);
    try {
      if (!arena.trialActive) beginTrial({ source: metadata.source || 'accepted-boundary' });
      stageTrialStates(normalized);
      arena.commit(runId);
      assertArenaState(normalized, 'NONLINEAR_RESIDENT_COMMIT_STATE_MISMATCH');
    } catch (error) {
      if (arena.trialActive) arena.rollback(runId);
      throw error;
    }
    committedStore = nextStore;
    if (metadata.matrixClass === 'general') matrixClass = 'general';
    commitCount += 1;
    if (metadata.checkpoint === true) {
      canonicalCheckpoint = createStateCheckpoint(committedStore, {
        role: 'p9-m8-resident-commit',
        runId,
        kind,
        commitCount,
        source: metadata.source || null,
      });
    }
    retain(commits, Object.freeze({
      sequence: commitCount,
      revision: committedStore.revision,
      step: committedStore.committed.step,
      time: committedStore.committed.time,
      lambda: committedStore.committed.lambda,
      committedHash: committedStore.committedHash,
      eventHash: stableHash({
        cursor: committedStore.committed.eventCursor,
        events: metadata.hingeEvents || [],
      }).slice(0, 24),
      responseHash: metadata.evaluation?.responseHash || null,
      auditHash: audit?.auditHash || null,
      source: clean(metadata.source) || null,
    }));
    return snapshot();
  }

  function rejectBoundary(reason = 'TRIAL_REJECTED', metadata = {}) {
    assertAvailable();
    const before = arena.snapshot();
    if (arena.trialActive) arena.rollback(runId);
    const after = arena.snapshot();
    if (before.committedHash !== after.committedHash) {
      throw sessionError('NONLINEAR_RESIDENT_ROLLBACK_MISMATCH', 'Rejected trial changed committed resident bytes.');
    }
    assertArenaState(
      normalizeElementStates(committedStore.committed.elementStates, elementIds),
      'NONLINEAR_RESIDENT_ROLLBACK_STATE_MISMATCH',
    );
    rejectionCount += 1;
    retain(rejections, Object.freeze({
      sequence: rejectionCount,
      reason: requiredText(reason, 'reason'),
      committedHash: committedStore.committedHash,
      revision: committedStore.revision,
      trialDiscarded: true,
      metadata: boundedDescriptor(metadata),
    }));
    return snapshot();
  }

  function recordCheckpoint(checkpoint, metadata = {}) {
    assertAvailable();
    const checked = restoreStateCheckpoint(checkpoint, { domainHash });
    if (checked.committedHash !== committedStore.committedHash
      || stateStoreByteSnapshot(checked) !== stateStoreByteSnapshot(committedStore)) {
      throw sessionError('NONLINEAR_RESIDENT_CHECKPOINT_STATE_MISMATCH', 'Checkpoint does not match the latest committed resident boundary.');
    }
    canonicalCheckpoint = checkpoint;
    return Object.freeze({
      integrityHash: checkpoint.integrityHash,
      committedHash: checkpoint.committedHash,
      metadata: boundedDescriptor(metadata),
    });
  }

  function recordTransfer(type, payload = {}) {
    assertAvailable();
    if (payload.chunkHash && payload.rows) {
      const { chunkHash, ...content } = payload;
      const actualHash = stableHash(content).slice(0, 24);
      if (actualHash !== chunkHash) {
        throw sessionError('NONLINEAR_TRANSFER_INTEGRITY_FAILED', 'Nonlinear transfer chunk hash does not match its payload.', {
          expectedHash: chunkHash,
          actualHash,
        });
      }
    }
    const bytes = transferSize(payload);
    if (bytes > maxTransferBytes) {
      throw sessionError('NONLINEAR_TRANSFER_CHUNK_LIMIT_EXCEEDED', 'A nonlinear host transfer exceeds its configured chunk budget.', {
        type,
        bytes,
        maxTransferBytes,
      });
    }
    if (transferBytes + bytes > totalTransferBudgetBytes) {
      throw sessionError('NONLINEAR_TRANSFER_TOTAL_LIMIT_EXCEEDED', 'Nonlinear host transfers exceed the run budget.', {
        type,
        bytes,
        transferBytes,
        totalTransferBudgetBytes,
      });
    }
    transferCount += 1;
    transferBytes += bytes;
    const descriptor = Object.freeze({
      sequence: transferCount,
      type: requiredText(type, 'type'),
      bytes,
      contentHash: clean(payload.chunkHash || payload.integrityHash || payload.contentHash)
        || stableHash(boundedDescriptor(payload)).slice(0, 24),
      rowCount: nonnegativeInteger(payload.rowCount, null),
    });
    retain(transfers, descriptor);
    return descriptor;
  }

  function auditEvaluation(evaluation = null, metadata = {}) {
    assertAvailable();
    const residual = Array.from(evaluation?.residualReduced || [], Number);
    if (residual.some((value) => !Number.isFinite(value))) {
      throw sessionError('NONLINEAR_CPU_F64_RESIDUAL_NONFINITE', 'CPU f64 equilibrium residual contains a nonfinite value.');
    }
    const energies = metadata.energies || evaluation?.energies || {};
    assertFiniteTree(energies, 'energies');
    if (evaluation?.audit?.ok === false) {
      throw sessionError('NONLINEAR_CPU_F64_EQUILIBRIUM_AUDIT_FAILED', 'CPU f64 equilibrium audit rejected the resident boundary.', evaluation.audit);
    }
    const balanceResidual = Number(energies.balanceResidual ?? energies.dynamic?.balanceResidual ?? 0);
    const inputEnergy = Number(energies.input ?? energies.dynamic?.input ?? 0);
    const row = Object.freeze({
      sequence: auditCount + 1,
      mode: clean(metadata.mode) || 'nonlinear',
      precision: 'f64',
      equilibriumOk: evaluation?.audit?.ok !== false,
      residualMaximumAbsolute: residual.length ? Math.max(...residual.map(Math.abs)) : 0,
      balanceResidual,
      relativeEnergyResidual: Math.abs(balanceResidual) / Math.max(1, Math.abs(inputEnergy)),
      responseHash: evaluation?.responseHash || null,
    });
    const withHash = Object.freeze({ ...row, auditHash: stableHash(row).slice(0, 24) });
    auditCount += 1;
    retain(audits, withHash);
    return withHash;
  }

  function handleFailure(reason, metadata = {}) {
    assertAvailable();
    rejectBoundary(reason || 'NONLINEAR_SESSION_FAILED', { failure: true, ...metadata });
    canonicalCheckpoint = createStateCheckpoint(committedStore, {
      role: 'p9-m8-resident-recovery',
      runId,
      kind,
      reason,
      deviceLost: metadata.deviceLost === true,
      oom: metadata.oom === true,
      cancelled: metadata.cancelled === true,
    });
    const failure = Object.freeze({
      sequence: failures.length + 1,
      reason: requiredText(reason || 'NONLINEAR_SESSION_FAILED', 'reason'),
      deviceLost: metadata.deviceLost === true,
      oom: metadata.oom === true,
      cancelled: metadata.cancelled === true,
      trialDiscarded: true,
      recoverable: true,
      checkpointHash: canonicalCheckpoint.integrityHash,
      committedHash: canonicalCheckpoint.committedHash,
    });
    retain(failures, failure);
    return Object.freeze({ ...failure, checkpoint: canonicalCheckpoint });
  }

  function snapshot() {
    assertAvailable();
    const arenaState = arena.snapshot();
    return Object.freeze({
      version: NONLINEAR_RESIDENT_SESSION_VERSION,
      runId,
      kind,
      requestedTarget,
      executedTarget: requestedTarget === 'gpu' ? 'gpu-shadow' : 'cpu',
      production,
      matrixClass,
      batchHash: batch.batchHash,
      arenaEpoch: arenaState.epoch,
      arenaBytes,
      batchBytes,
      residentBytes: arenaBytes + batchBytes,
      committedHash: committedStore.committedHash,
      checkpointHash: canonicalCheckpoint.integrityHash,
      commitCount,
      rejectionCount,
      transferCount,
      transferBytes,
      auditCount,
      disposed,
    });
  }

  function finalize(status = 'completed', metadata = {}) {
    assertAvailable();
    if (arena.trialActive) rejectBoundary('SESSION_FINALIZE_TRIAL_DISCARD', { status });
    const state = snapshot();
    const core = {
      ...state,
      disposed: true,
      status: requiredText(status, 'status'),
      route: Object.freeze({
        requestedTarget,
        executedTarget: requestedTarget === 'gpu' ? 'gpu-shadow' : 'cpu',
        elementOperation: requestedTarget === 'gpu' ? 'gpu-shadow-candidate' : 'cpuNonlinearElementBatch',
        solveOperation: `cpu-f64-${matrixClass}`,
        correctionAndAudit: 'cpu-f64-original-system',
        fallbackUsed: false,
        autoGpuAllowed: false,
      }),
      qualification: Object.freeze({
        grade: 'G2',
        residentCpuQualified: true,
        gpuProductionQualified: false,
        designTransferAllowed: false,
      }),
      memory: Object.freeze({
        maxResidentBytes,
        residentBytes: arenaBytes + batchBytes,
        maxTransferBytes,
        totalTransferBudgetBytes,
        transferBytes,
      }),
      state: Object.freeze({
        committedHash: committedStore.committedHash,
        checkpointHash: canonicalCheckpoint.integrityHash,
        checkpointCommittedHash: canonicalCheckpoint.committedHash,
        commitCount,
        rejectionCount,
        trialActive: false,
      }),
      commits: Object.freeze(commits.slice()),
      rejections: Object.freeze(rejections.slice()),
      transfers: Object.freeze(transfers.slice()),
      audits: Object.freeze(audits.slice()),
      failures: Object.freeze(failures.slice()),
      metadata: boundedDescriptor(metadata),
    };
    const result = Object.freeze({ ...core, sessionHash: stableHash(core).slice(0, 24) });
    arena.dispose(runId);
    disposed = true;
    return result;
  }

  function validateStoreBoundary(nextStore) {
    const checkpoint = createStateCheckpoint(nextStore, { role: 'p9-m8-boundary-validation' });
    if (nextStore.domainHash !== domainHash || checkpoint.committedHash !== nextStore.committedHash) {
      throw sessionError('NONLINEAR_RESIDENT_STATE_DOMAIN_MISMATCH', 'Accepted state does not belong to the resident analysis domain.');
    }
    if (Number(nextStore.revision) < Number(committedStore.revision)) {
      throw sessionError('NONLINEAR_RESIDENT_STATE_REVISION_REGRESSION', 'Accepted state revision regressed.');
    }
  }

  function assertArenaState(expected, code) {
    const actual = arena.exportCommittedStates();
    if (stableHash(actual) !== stableHash(expected)) {
      throw sessionError(code, 'Resident arena state does not match the canonical CPU f64 committed state.');
    }
  }

  function retain(list, row) {
    list.push(row);
    if (list.length > traceLimit) list.shift();
  }

  function assertAvailable() {
    if (disposed) throw sessionError('NONLINEAR_RESIDENT_SESSION_DISPOSED', 'Nonlinear resident session has been disposed.');
  }
}

function normalizeElementStates(states = {}, elementIds) {
  const source = states instanceof Map ? Object.fromEntries(states) : states || {};
  const known = new Set(elementIds);
  const unknown = Object.keys(source).filter((id) => !known.has(id));
  if (unknown.length) {
    throw sessionError('NONLINEAR_RESIDENT_STATE_ELEMENT_UNKNOWN', 'Committed state contains elements outside the resident batch.', { unknown });
  }
  return Object.freeze(Object.fromEntries(elementIds.map((id) => [id, clone(source[id] ?? {})])));
}

function stateSlotCapacity(value, growthFactor) {
  const factor = positive(growthFactor, 2);
  const bytes = new TextEncoder().encode(JSON.stringify(value ?? {})).byteLength;
  return nextPowerOfTwo(Math.max(DEFAULT_STATE_SLOT_BYTES, Math.ceil(bytes * factor)));
}

function estimateBatchBytes(batch) {
  return [batch.dofOffsets, batch.dofIndices, batch.matrixOffsets, batch.typeCodes, batch.groupCodes, batch.evaluationOrder]
    .reduce((sum, values) => sum + Number(values?.byteLength || 0), 0);
}

function transferSize(payload) {
  const declared = Number(payload?.bytes ?? payload?.byteLength);
  if (Number.isFinite(declared) && declared >= 0) return Math.trunc(declared);
  return new TextEncoder().encode(JSON.stringify(payload ?? null)).byteLength;
}

function boundedDescriptor(value, depth = 0) {
  if (depth > 4) return '[bounded]';
  if (value == null || typeof value !== 'object') return value;
  if (ArrayBuffer.isView(value)) {
    const rows = Array.from(value);
    return { length: rows.length, sample: [...rows.slice(0, 8), ...rows.slice(-8)] };
  }
  if (Array.isArray(value)) {
    return { length: value.length, sample: [...value.slice(0, 8), ...value.slice(-8)].map((row) => boundedDescriptor(row, depth + 1)) };
  }
  const output = {};
  const keys = Object.keys(value).sort();
  const selected = keys.length <= 24 ? keys : [...keys.slice(0, 12), ...keys.slice(-12)];
  for (const key of selected) {
    if (key === 'rows' || key === 'stateStore' || key === 'evaluation' || key === 'checkpoint') continue;
    output[key] = boundedDescriptor(value[key], depth + 1);
  }
  return output;
}

function assertFiniteTree(value, path) {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw sessionError('NONLINEAR_CPU_F64_ENERGY_NONFINITE', `${path} contains a nonfinite value.`);
  }
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value) || ArrayBuffer.isView(value)) {
    Array.from(value).forEach((row, index) => assertFiniteTree(row, `${path}[${index}]`));
    return;
  }
  Object.entries(value).forEach(([key, row]) => assertFiniteTree(row, `${path}.${key}`));
}

function normalizeKind(value) {
  const kind = String(value || '').toLowerCase();
  if (!['pushover', 'nlth'].includes(kind)) throw sessionError('NONLINEAR_RESIDENT_KIND_INVALID', 'Resident session kind must be pushover or nlth.');
  return kind;
}
function normalizeTarget(value) { return value === 'gpu' || value === 'auto' ? value : 'cpu'; }
function requiredText(value, field) { const text = String(value || '').trim(); if (!text) throw sessionError('NONLINEAR_RESIDENT_FIELD_REQUIRED', `${field} is required.`); return text; }
function clean(value) { return typeof value === 'string' ? value.trim() : ''; }
function positive(value, fallback) { const number = Number(value); return Number.isFinite(number) && number > 0 ? number : fallback; }
function positiveInteger(value, fallback) { const number = Number(value); return Number.isInteger(number) && number > 0 ? number : fallback; }
function nonnegativeInteger(value, fallback) { const number = Number(value); return Number.isInteger(number) && number >= 0 ? number : fallback; }
function nextPowerOfTwo(value) { let output = 1; while (output < value) output *= 2; return output; }
function clone(value) { if (typeof structuredClone === 'function') return structuredClone(value); return JSON.parse(JSON.stringify(value)); }
function sessionError(code, message, details = null) { return Object.assign(new Error(message), { code, details }); }
