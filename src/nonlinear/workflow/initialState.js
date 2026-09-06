import { stableHash } from '../../core/stableHash.js';
import {
  analysisRunRecordIntegrityHash,
  createAnalysisRunRecord,
} from '../../core/analysisRunRecord.js';
import {
  createNonlinearStateStore,
  createStateCheckpoint,
  restoreStateCheckpoint,
} from '../core/stateStore.js';
import { createEquilibriumAssembler } from '../equilibrium/assembler.js';
import { runMdofLoadControl } from '../equilibrium/loadControl.js';

export const NONLINEAR_INITIAL_STATE_VERSION = 'p8-m5-nonlinear-initial-state-v1';
export const NONLINEAR_CASE_DAG_VERSION = 'p8-m5-nonlinear-case-dag-v1';
export const GRAVITY_PRELOAD_VERSION = 'p8-m5-gravity-preload-v1';

export function buildNonlinearCaseDependencyGraph(analysisCases = [], runRecords = []) {
  const cases = Array.isArray(analysisCases) ? analysisCases : [];
  const recordIndex = indexRecords(runRecords);
  const byId = new Map();
  const errors = [];
  cases.forEach((row) => {
    const id = clean(row?.id);
    if (!id) return errors.push(issue('CASE_DEPENDENCY_CASE_ID_REQUIRED', null, 'Analysis case ID is required.'));
    if (byId.has(id)) return errors.push(issue('CASE_DEPENDENCY_CASE_DUPLICATE', id, `Duplicate analysis case ${id}.`));
    byId.set(id, row);
  });
  const edges = [];
  for (const [caseId, analysisCase] of byId) {
    const initial = analysisCase.initialState || {};
    if (initial.policy !== 'nonlinear-case') continue;
    const predecessorCaseId = clean(initial.caseId);
    const runRecordId = clean(initial.runRecordId);
    if (!predecessorCaseId || !byId.has(predecessorCaseId)) {
      errors.push(issue('CASE_DEPENDENCY_PREDECESSOR_MISSING', caseId, `Predecessor case ${predecessorCaseId || '(missing)'} was not found.`));
      continue;
    }
    if (!runRecordId || !recordIndex.has(runRecordId)) {
      errors.push(issue('CASE_DEPENDENCY_RUN_RECORD_MISSING', caseId, `Predecessor run ${runRecordId || '(missing)'} was not found.`));
      continue;
    }
    const runRecord = recordIndex.get(runRecordId);
    if (String(runRecord.caseId) !== predecessorCaseId) {
      errors.push(issue('CASE_DEPENDENCY_RUN_CASE_MISMATCH', caseId, `Run ${runRecordId} does not belong to ${predecessorCaseId}.`));
      continue;
    }
    edges.push({ from: predecessorCaseId, to: caseId, runRecordId });
  }
  const cycle = findCycle([...byId.keys()], edges);
  if (cycle.length) errors.push(issue('CASE_DEPENDENCY_CYCLE', cycle.at(-1), `Nonlinear case dependency cycle: ${cycle.join(' -> ')}.`));
  const order = cycle.length ? [] : topologicalOrder([...byId.keys()], edges);
  const core = {
    version: NONLINEAR_CASE_DAG_VERSION,
    nodes: [...byId.keys()].sort(),
    edges: edges.sort((a, b) => `${a.from}:${a.to}`.localeCompare(`${b.from}:${b.to}`)),
    order,
    errors,
  };
  return Object.freeze({ ...core, ok: errors.length === 0, graphHash: stableHash(core).slice(0, 24) });
}

export function validateNonlinearInitialStateDependency(input = {}) {
  const analysisCase = input.analysisCase || {};
  const policy = analysisCase.initialState?.policy || 'zero';
  if (policy === 'zero') return Object.freeze({ ok: true, policy, predecessor: null, errors: [] });
  if (policy === 'verified-linear-import') {
    const validation = validateVerifiedLinearInitialGuess(input.linearInitialGuess, input.domain, input.options);
    return Object.freeze({ ok: validation.ok, policy, predecessor: validation, errors: validation.errors });
  }
  if (policy !== 'nonlinear-case') {
    return Object.freeze({ ok: false, policy, predecessor: null, errors: [issue('INITIAL_STATE_POLICY_INVALID', analysisCase.id, `Unsupported policy ${policy}.`)] });
  }
  const runRecordId = clean(analysisCase.initialState?.runRecordId);
  const caseId = clean(analysisCase.initialState?.caseId);
  const record = indexRecords(input.runRecords).get(runRecordId);
  const state = (input.analysisStates || []).find((row) => row.runRecordId === runRecordId);
  const errors = [];
  if (!record) errors.push(issue('GRAVITY_PREDECESSOR_RUN_MISSING', analysisCase.id, `Run ${runRecordId || '(missing)'} was not found.`));
  if (record && record.caseId !== caseId) errors.push(issue('GRAVITY_PREDECESSOR_CASE_MISMATCH', analysisCase.id, `Run ${runRecordId} does not belong to ${caseId}.`));
  if (record && record.integrityHash !== analysisRunRecordIntegrityHash(record)) {
    errors.push(issue('GRAVITY_PREDECESSOR_RUN_INTEGRITY_FAILED', analysisCase.id, `Run ${runRecordId} failed integrity validation.`));
  }
  const recordResult = record?.result || {};
  if (record && (record.runStatus !== 'ok' || recordResult.accepted !== true || recordResult.role !== 'gravity-preload')) {
    errors.push(issue('GRAVITY_PREDECESSOR_NOT_ACCEPTED', analysisCase.id, `Run ${runRecordId} is not an accepted nonlinear gravity state.`));
  }
  if (!state || state.status !== 'accepted' || state.immutable !== true) {
    errors.push(issue('GRAVITY_PREDECESSOR_STATE_INVALID', analysisCase.id, `Accepted immutable state for ${runRecordId} was not found.`));
  }
  const expected = input.domain?.hashes || input.domain?.identity || input.domainHashes || {};
  if (record && !sameStructuralDomain(recordResult.domainHashes || record.domainHashes, expected)) errors.push(issue('GRAVITY_PREDECESSOR_DOMAIN_MISMATCH', analysisCase.id, 'Gravity predecessor structural domain does not match.'));
  if (state && !sameStructuralDomain(state.domainHashes, expected)) errors.push(issue('GRAVITY_PREDECESSOR_STATE_DOMAIN_MISMATCH', analysisCase.id, 'Gravity state structural domain does not match.'));
  if (recordResult.stale === true || state?.status === 'stale') errors.push(issue('GRAVITY_PREDECESSOR_STALE', analysisCase.id, 'Gravity predecessor is stale.'));
  if (!input.checkpoint) {
    errors.push(issue('GRAVITY_CHECKPOINT_REQUIRED', analysisCase.id, 'A linked gravity checkpoint is required.'));
  } else {
    try { restoreStateCheckpoint(input.checkpoint, { domainHash: expected.domainHash }); } catch (error) {
      if (error.code !== 'STATE_CHECKPOINT_DOMAIN_MISMATCH' || !sameStructuralDomain(recordResult.domainHashes, expected)) {
        errors.push(issue(error.code || 'GRAVITY_CHECKPOINT_INVALID', analysisCase.id, error.message));
      }
    }
    if (recordResult.checkpointHash !== input.checkpoint.integrityHash) errors.push(issue('GRAVITY_CHECKPOINT_RUN_LINK_MISMATCH', analysisCase.id, 'Run record does not identify the supplied checkpoint.'));
    if (state?.checkpointRef !== input.checkpoint.integrityHash) errors.push(issue('GRAVITY_CHECKPOINT_STATE_LINK_MISMATCH', analysisCase.id, 'Analysis state does not identify the supplied checkpoint.'));
    if (recordResult.committedStateHash !== input.checkpoint.committedHash || state?.committedStateHash !== input.checkpoint.committedHash) {
      errors.push(issue('GRAVITY_COMMITTED_STATE_LINK_MISMATCH', analysisCase.id, 'Run, state, and checkpoint committed hashes do not match.'));
    }
  }
  if (state?.integrityHash !== analysisStateIntegrityHash(state)) errors.push(issue('GRAVITY_PREDECESSOR_STATE_INTEGRITY_FAILED', analysisCase.id, 'Gravity analysis-state integrity failed.'));
  return Object.freeze({
    version: NONLINEAR_INITIAL_STATE_VERSION,
    ok: errors.length === 0,
    policy,
    predecessor: record ? { runRecord: record, analysisState: state || null } : null,
    errors,
  });
}

export function validateVerifiedLinearInitialGuess(input, domain, options = {}) {
  if (!input) return Object.freeze({
    version: NONLINEAR_INITIAL_STATE_VERSION,
    ok: true,
    used: false,
    q: [],
    elementStates: {},
    importedMaterialState: false,
    errors: [],
  });
  const errors = [];
  const expected = domain?.hashes || domain?.identity || {};
  if (!sameDomain(input.domainHashes, expected)) errors.push(issue('LINEAR_INITIAL_GUESS_DOMAIN_MISMATCH', null, 'Linear initial guess domain does not match.'));
  if (input.verification?.status !== 'PASS' && input.qualification !== 'verified') {
    errors.push(issue('LINEAR_INITIAL_GUESS_NOT_VERIFIED', null, 'Linear initial guess is not verified.'));
  }
  const residual = Number(input.equilibrium?.relativeResidual);
  if (input.equilibrium?.ok !== true || !Number.isFinite(residual) || residual > positive(options.linearResidualTolerance, 1e-8)) {
    errors.push(issue('LINEAR_INITIAL_GUESS_EQUILIBRIUM_FAILED', null, 'Linear initial guess failed equilibrium validation.'));
  }
  if (input.admissibleState !== true) errors.push(issue('LINEAR_INITIAL_GUESS_INADMISSIBLE', null, 'Linear initial guess is not admissible.'));
  const count = domain?.constraint?.reducedDofCount || 0;
  const q = Array.isArray(input.q) || ArrayBuffer.isView(input.q) ? Array.from(input.q, Number) : [];
  if (q.length !== count || q.some((value) => !Number.isFinite(value))) {
    errors.push(issue('LINEAR_INITIAL_GUESS_VECTOR_INVALID', null, `Linear initial guess requires ${count} finite reduced values.`));
  }
  return Object.freeze({
    version: NONLINEAR_INITIAL_STATE_VERSION,
    ok: errors.length === 0,
    used: errors.length === 0,
    q: errors.length ? [] : q,
    elementStates: {},
    importedMaterialState: false,
    errors,
  });
}

export async function runNonlinearGravityPreload(input = {}) {
  const domain = input.domain;
  const elements = input.elements;
  const combinedPattern = input.loadPattern;
  if (!domain?.ok || !Array.isArray(elements) || !combinedPattern?.ok || !input.model) {
    return gravityFailure('GRAVITY_PRELOAD_INPUT_INVALID', null, {
      domainOk: domain?.ok === true,
      elementsArray: Array.isArray(elements),
      loadPatternOk: combinedPattern?.ok === true,
      modelPresent: Boolean(input.model),
    });
  }
  const domainHash = domain.identity?.domainHash || domain.hashes?.domainHash || null;
  let initialGuess;
  try {
    initialGuess = validateVerifiedLinearInitialGuess(input.linearInitialGuess, domain, input.options);
  } catch (error) {
    return gravityFailure(error.code || 'LINEAR_INITIAL_GUESS_INVALID', error.message);
  }
  if (!initialGuess.ok) return gravityFailure('LINEAR_INITIAL_GUESS_REJECTED', null, initialGuess);
  const initialState = createNonlinearStateStore({
    domainHash,
    initialState: {
      q: initialGuess.used ? initialGuess.q : new Array(domain.constraint.reducedDofCount).fill(0),
      elementStates: {},
      lambda: 0,
      source: initialGuess.used ? 'verified-linear-initial-guess' : 'zero',
    },
  });
  const gravityPattern = gravityReferencePattern(combinedPattern);
  const gravityAssembler = createEquilibriumAssembler({ domain, elements, loadPattern: gravityPattern });
  const combinedAssembler = input.combinedAssembler || createEquilibriumAssembler({ domain, elements, loadPattern: combinedPattern });
  const loadControl = await runMdofLoadControl({
    assembler: gravityAssembler,
    stateStore: initialState,
    backend: input.backend,
    production: input.production,
    signal: input.signal,
    isCancelled: input.isCancelled,
    onProgress: input.onProgress,
    options: {
      targetLambda: 1,
      initialStep: positive(input.options?.initialStep, 0.25),
      minStep: positive(input.options?.minStep, 1 / 1024),
      maxStep: positive(input.options?.maxStep, 0.5),
      cutbackFactor: input.options?.cutbackFactor,
      growthFactor: input.options?.growthFactor,
      fastIterations: input.options?.fastIterations,
      maxAttempts: input.options?.maxAttempts,
      newton: input.options?.newton,
    },
  });
  if (!loadControl.ok) return gravityFailure(loadControl.reason || 'GRAVITY_PRELOAD_FAILED', null, { loadControl });
  const loaded = loadControl.stateStore;
  const runRecordId = clean(input.runRecordId) || `GRAVITY:${stableHash({
    caseId: input.caseId,
    domainHash,
    stateHash: loaded.committedHash,
    patternHash: gravityPattern.patternHash,
  }).slice(0, 20)}`;
  const rebased = rebaseGravityStore(loaded, runRecordId, input.caseId);
  const continuity = await combinedAssembler.evaluate({
    q: rebased.committed.q,
    lambda: 0,
    committedElementStates: rebased.committed.elementStates,
    mode: 'static',
  });
  if (!continuity.ok) return gravityFailure(continuity.reason || 'GRAVITY_REBASE_EVALUATION_FAILED', null, { loadControl });
  const residualNorm = maxAbs(continuity.residualReduced);
  const forceScale = Math.max(1, maxAbs(continuity.pExternalReduced));
  const residualLimit = nonnegative(input.options?.equilibriumAbsolute, 1e-8)
    + nonnegative(input.options?.equilibriumRelative, 1e-7) * forceScale;
  if (continuity.audit?.ok === false || residualNorm > residualLimit) {
    return gravityFailure('GRAVITY_REBASE_EQUILIBRIUM_FAILED', null, { residualNorm, residualLimit, loadControl });
  }
  const checkpoint = createStateCheckpoint(rebased, {
    role: 'gravity-preload',
    caseId: input.caseId || null,
    runRecordId,
    combinationId: input.combinationId || null,
  });
  const gravityResult = {
    version: GRAVITY_PRELOAD_VERSION,
    ok: true,
    status: 'ok',
    qualification: 'candidate',
    designBlocked: true,
    role: 'gravity-preload',
    accepted: true,
    stale: false,
    immutable: true,
    domainHashes: structuralDomainHashes(domain.hashes || domain.identity),
    stateCompatibilityHash: stableHash({
      domain: structuralDomainHashes(domain.hashes || domain.identity),
      combinationId: input.combinationId || null,
      gravityPatternHash: gravityPattern.patternHash,
    }).slice(0, 24),
    combinationId: input.combinationId || null,
    gravityPatternHash: gravityPattern.patternHash,
    committedStateHash: rebased.committedHash,
    checkpointHash: checkpoint.integrityHash,
    engine: { id: 'productionGravityPreload', version: GRAVITY_PRELOAD_VERSION },
    backend: { id: loadControl.acceptedSteps.at(-1)?.backend || input.backend?.id || null },
    solver: { version: loadControl.version },
    summary: {
      acceptedSteps: loadControl.acceptedStepCount,
      rejectedSteps: loadControl.rejectedStepCount,
      residualNorm,
      residualLimit,
      finalGravityFactor: 1,
      lateralFactorAfterRebase: 0,
    },
  };
  const gravityCase = input.analysisCase || {
    id: clean(input.caseId) || 'GRAVITY-PRELOAD',
    kind: 'nonlinearStatic',
    settings: { comboId: input.combinationId || null },
    initialState: { policy: 'zero' },
  };
  const runRecord = Object.freeze(createAnalysisRunRecord({
    model: input.model,
    analysisCase: gravityCase,
    result: gravityResult,
    attemptId: runRecordId,
  }));
  const stateCore = {
    version: NONLINEAR_INITIAL_STATE_VERSION,
    id: `STATE:${runRecordId}`,
    caseId: gravityCase.id,
    runRecordId,
    domainHashes: clone(gravityResult.domainHashes),
    status: 'accepted',
    immutable: true,
    checkpointRef: checkpoint.integrityHash,
    committedStateHash: rebased.committedHash,
  };
  const analysisState = Object.freeze({ ...stateCore, integrityHash: stableHash(stateCore) });
  return Object.freeze({
    version: GRAVITY_PRELOAD_VERSION,
    ok: true,
    status: 'accepted',
    reason: 'GRAVITY_PRELOAD_ACCEPTED',
    stateStore: rebased,
    checkpoint,
    runRecord,
    analysisState,
    loadControl,
    gravityAssembler,
    combinedAssembler,
    initialGuess,
    continuity: {
      ok: true,
      residualNorm,
      residualLimit,
      responseHash: continuity.responseHash,
      audit: continuity.audit,
    },
  });
}

export function markDependentNonlinearCasesStale(analysisCases = [], predecessorCaseId, acceptedRunRecordId) {
  const target = clean(predecessorCaseId);
  const nextRunId = clean(acceptedRunRecordId);
  const staleIds = new Set();
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of analysisCases) {
      const parent = clean(row.initialState?.caseId);
      if (row.initialState?.policy !== 'nonlinear-case') continue;
      const directlyChanged = parent === target && clean(row.initialState?.runRecordId) !== nextRunId;
      if (!directlyChanged && !staleIds.has(parent)) continue;
      if (!staleIds.has(row.id)) {
        staleIds.add(row.id);
        changed = true;
      }
    }
  }
  return analysisCases.map((row) => staleIds.has(row.id)
    ? { ...clone(row), status: 'stale', staleReason: 'INITIAL_STATE_PREDECESSOR_CHANGED' }
    : clone(row));
}

function gravityReferencePattern(pattern) {
  const fullDofCount = pattern.constantFull.length;
  const reducedDofCount = pattern.constantReduced.length;
  const trace = (pattern.trace || []).filter((row) => row.role === 'constant').map((row) => ({ ...row, role: 'reference' }));
  const core = {
    ...pattern,
    constantFull: new Float64Array(fullDofCount),
    referenceFull: Float64Array.from(pattern.constantFull),
    constantReduced: new Float64Array(reducedDofCount),
    referenceReduced: Float64Array.from(pattern.constantReduced),
    full: Float64Array.from(pattern.constantFull),
    reduced: Float64Array.from(pattern.constantReduced),
    trace,
    constantLoadCount: 0,
    referenceLoadCount: trace.length,
  };
  return Object.freeze({ ...core, patternHash: stableHash({
    role: 'gravity-reference',
    referenceFull: Array.from(core.referenceFull),
    trace,
  }).slice(0, 24) });
}

function rebaseGravityStore(store, runRecordId, caseId) {
  const sequence = Number(store.eventSequence || 0) + 1;
  const committed = {
    ...clone(store.committed),
    lambda: 0,
    loadState: { gravityFactor: 1, lateralFactor: 0 },
    predecessor: { role: 'gravity-preload', caseId: clean(caseId) || null, runRecordId },
  };
  return createNonlinearStateStore({
    domainHash: store.domainHash,
    revision: Number(store.revision || 0) + 1,
    eventSequence: sequence,
    committed,
    eventLog: [
      ...(store.eventLog || []),
      {
        sequence,
        id: `event-${String(sequence).padStart(8, '0')}`,
        type: 'gravity-preload-accepted',
        step: committed.step,
        runRecordId,
        caseId: clean(caseId) || null,
      },
    ],
  });
}

function indexRecords(input) {
  if (Array.isArray(input)) return new Map(input.filter((row) => row?.id).map((row) => [row.id, row]));
  if (input?.attempts) {
    return new Map(Object.values(input.attempts).flat().filter((row) => row?.id).map((row) => [row.id, row]));
  }
  return new Map(Object.values(input || {}).filter((row) => row?.id).map((row) => [row.id, row]));
}

function sameDomain(actual = {}, expected = {}) {
  const keys = ['domainHash', 'topologyHash', 'propertyHash', 'constraintHash', 'nonlinearHash'];
  return keys.every((key) => !expected[key] || actual?.[key] === expected[key]);
}

function sameStructuralDomain(actual = {}, expected = {}) {
  const keys = ['topologyHash', 'propertyHash', 'constraintHash', 'nonlinearHash'];
  return keys.every((key) => !expected[key] || actual?.[key] === expected[key]);
}

function structuralDomainHashes(hashes = {}) {
  return Object.freeze(Object.fromEntries(
    ['topologyHash', 'propertyHash', 'constraintHash', 'nonlinearHash', 'massHash']
      .filter((key) => hashes?.[key] != null)
      .map((key) => [key, hashes[key]]),
  ));
}

function analysisStateIntegrityHash(state = {}) {
  const { integrityHash: _integrityHash, ...core } = state || {};
  return stableHash(core);
}

function findCycle(nodes, edges) {
  const children = new Map(nodes.map((id) => [id, []]));
  edges.forEach((edge) => children.get(edge.from)?.push(edge.to));
  const state = new Map();
  const stack = [];
  let found = [];
  const visit = (node) => {
    if (found.length) return;
    state.set(node, 1);
    stack.push(node);
    for (const child of children.get(node) || []) {
      if (state.get(child) === 1) {
        const index = stack.indexOf(child);
        found = [...stack.slice(index), child];
        return;
      }
      if (!state.get(child)) visit(child);
    }
    stack.pop();
    state.set(node, 2);
  };
  nodes.forEach((node) => { if (!state.get(node)) visit(node); });
  return found;
}

function topologicalOrder(nodes, edges) {
  const indegree = new Map(nodes.map((id) => [id, 0]));
  const children = new Map(nodes.map((id) => [id, []]));
  edges.forEach((edge) => {
    indegree.set(edge.to, (indegree.get(edge.to) || 0) + 1);
    children.get(edge.from)?.push(edge.to);
  });
  const queue = nodes.filter((id) => indegree.get(id) === 0).sort();
  const order = [];
  while (queue.length) {
    const id = queue.shift();
    order.push(id);
    for (const child of (children.get(id) || []).sort()) {
      indegree.set(child, indegree.get(child) - 1);
      if (indegree.get(child) === 0) queue.push(child);
    }
    queue.sort();
  }
  return order;
}

function gravityFailure(reason, message = null, details = null) {
  return Object.freeze({
    version: GRAVITY_PRELOAD_VERSION,
    ok: false,
    status: 'failed',
    reason,
    message,
    details: clone(details),
  });
}

function issue(code, target, message) {
  return { code, target: target || null, message };
}

function maxAbs(values) {
  let maximum = 0;
  for (const value of values || []) maximum = Math.max(maximum, Math.abs(Number(value)));
  return maximum;
}

function positive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function nonnegative(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function clone(value) {
  if (value == null) return value;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}
