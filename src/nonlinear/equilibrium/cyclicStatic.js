import { stableHash } from '../../core/stableHash.js';
import {
  beginStateStep,
  commitStateStep,
  createStateCheckpoint,
  updateTrialState,
} from '../core/stateStore.js';
import {
  evaluatePhysicalControlCoordinate,
  resolvePhysicalControlCoordinate,
  runMdofDisplacementControl,
} from './displacementControl.js';
import { runMdofLoadControl } from './loadControl.js';

export const MDOF_CYCLIC_STATIC_VERSION = 'p8-m7-mdof-cyclic-static-v1';
export const CYCLIC_STATIC_PROTOCOL_VERSION = 'p8-m7-cyclic-static-protocol-v1';

export function buildCyclicTargetHistory(options = {}) {
  const amplitudes = finiteList(options.amplitudes, 'amplitudes').filter((value) => Math.abs(value) > 0);
  if (!amplitudes.length) throw cyclicError('CYCLIC_AMPLITUDE_REQUIRED', 'At least one nonzero cyclic amplitude is required.');
  const cycles = positiveInteger(options.cycles, 1);
  const targets = [];
  if (options.includeInitialZero === true) targets.push(0);
  for (const amplitude of amplitudes) {
    for (let cycle = 0; cycle < cycles; cycle += 1) {
      targets.push(amplitude, -amplitude);
    }
  }
  if (options.includeFinalZero !== false) targets.push(0);
  return Object.freeze(targets);
}

export function normalizeCyclicStaticProtocol(protocolInput = []) {
  if (!Array.isArray(protocolInput) || protocolInput.length === 0) {
    throw cyclicError('CYCLIC_PROTOCOL_REQUIRED', 'Cyclic static analysis requires a nonempty target protocol.');
  }
  const points = protocolInput.map((value, index) => {
    if (typeof value === 'number') {
      return normalizePoint({ type: 'displacement', target: value }, index);
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw cyclicError('CYCLIC_PROTOCOL_POINT_INVALID', `Protocol point ${index} must be a number or object.`);
    }
    return normalizePoint(value, index);
  });
  const core = {
    version: CYCLIC_STATIC_PROTOCOL_VERSION,
    points,
  };
  return Object.freeze({ ...core, protocolHash: stableHash(core).slice(0, 24) });
}

export function evaluateCyclicEnergyBalance(input = {}) {
  const initial = normalizeEnergy(input.initial || {});
  const final = normalizeEnergy(input.final || {});
  const externalWork = finiteOr(input.externalWork, 0);
  const recoverableChange = final.recoverable - initial.recoverable;
  const dissipatedChange = final.dissipated - initial.dissipated;
  const residual = externalWork - recoverableChange - dissipatedChange;
  const scale = Math.max(1, Math.abs(externalWork), Math.abs(recoverableChange), Math.abs(dissipatedChange));
  return Object.freeze({
    version: MDOF_CYCLIC_STATIC_VERSION,
    externalWork,
    recoverableInitial: initial.recoverable,
    recoverableFinal: final.recoverable,
    recoverableChange,
    dissipatedInitial: initial.dissipated,
    dissipatedFinal: final.dissipated,
    dissipatedChange,
    residual,
    absoluteResidual: Math.abs(residual),
    relativeResidual: Math.abs(residual) / scale,
    source: Object.freeze({ initial: initial.source, final: final.source }),
  });
}

export async function runMdofCyclicStatic(input = {}) {
  const assembler = input.assembler;
  let store = input.stateStore;
  if (!assembler?.domain?.constraint?.ok || typeof assembler.evaluate !== 'function') {
    return blocked(store, 'MDOF_ASSEMBLER_REQUIRED');
  }
  if (!store?.committed) return blocked(store, 'STATE_STORE_REQUIRED');
  if (store.trial) return blocked(store, 'STATE_TRIAL_ALREADY_ACTIVE');
  const domainHash = assembler.domain.identity?.domainHash || assembler.domain.hashes?.domainHash || null;
  if (store.domainHash && domainHash && store.domainHash !== domainHash) return blocked(store, 'STATE_DOMAIN_MISMATCH');
  const options = input.options || {};
  let protocol;
  let control;
  try {
    protocol = input.protocol?.version === CYCLIC_STATIC_PROTOCOL_VERSION
      ? input.protocol
      : normalizeCyclicStaticProtocol(
        input.protocol
        || options.protocol
        || options.targets
        || buildCyclicTargetHistory(options),
      );
    const needsDisplacement = protocol.points.some((point) => point.type === 'displacement');
    control = needsDisplacement
      ? input.control?.reducedVector
        ? input.control
        : resolvePhysicalControlCoordinate(assembler.domain, input.control || options.control || {})
      : null;
  } catch (error) {
    return blocked(store, error.code || 'CYCLIC_PROTOCOL_INVALID', error.message, error.details);
  }
  const executionHash = stableHash({
    protocolHash: protocol.protocolHash,
    controlCoordinateHash: control?.coordinateHash || null,
    domainHash,
  }).slice(0, 24);
  const existing = store.committed.cyclicStatic || null;
  if (existing && existing.executionHash !== executionHash && options.resume !== false) {
    return blocked(store, 'CYCLIC_PROTOCOL_RESTART_MISMATCH', 'Committed cyclic context belongs to another protocol or control coordinate.');
  }
  let startIndex = options.resume === false ? 0 : nonnegativeInteger(existing?.nextPointIndex, 0);
  if (startIndex > protocol.points.length) {
    return blocked(store, 'CYCLIC_PROTOCOL_RESTART_INDEX_INVALID', 'Committed cyclic restart index exceeds the protocol length.');
  }
  let previousDirection = options.resume === false ? 0 : finiteOr(existing?.previousDirection, 0);
  let externalWork = options.resume === false ? 0 : finiteOr(existing?.externalWork, 0);
  const maxSegments = positiveInteger(options.maxSegments, protocol.points.length - startIndex || 1);
  let evaluation = await safeEvaluate(assembler, store, input.mode || 'static');
  if (!evaluation.ok) return blocked(store, evaluation.reason, evaluation.message, evaluation);
  const energyBaseline = options.resume === false || !existing?.energyBaseline
    ? normalizeEnergy(evaluation.energies)
    : normalizeEnergy(existing.energyBaseline);
  let previousEvaluation = evaluation;
  const path = [pathRow(evaluation, control, startIndex - 1, externalWork, 'initial')];
  const segments = [];
  const reversals = [];
  const materialEvents = [];
  let completedThisRun = 0;

  for (let pointIndex = startIndex; pointIndex < protocol.points.length; pointIndex += 1) {
    if (completedThisRun >= maxSegments) break;
    if (cancelled(input)) return partial(false, 'ANALYSIS_CANCELLED', 'cancelled');
    const point = protocol.points[pointIndex];
    const segmentStartStore = store;
    const segmentStartPathLength = path.length;
    const segmentStartMaterialEventLength = materialEvents.length;
    const segmentStartReversalLength = reversals.length;
    const beforeValue = point.type === 'displacement'
      ? evaluatePhysicalControlCoordinate(control, store.committed.q)
      : Number(store.committed.lambda || 0);
    const direction = point.type === 'hold' ? 0 : Math.sign(point.target - beforeValue);
    const reversed = direction !== 0 && previousDirection !== 0 && direction !== previousDirection;
    const segmentStartWork = externalWork;
    const segmentStartEvaluation = previousEvaluation;
    const segmentEvents = [];
    if (reversed) {
      const event = {
        type: 'cyclic-reversal',
        protocolPoint: pointIndex,
        previousDirection,
        direction,
        from: beforeValue,
        target: point.target,
      };
      reversals.push(event);
      segmentEvents.push(event);
    }

    let solved;
    if (point.type === 'displacement') {
      solved = await runMdofDisplacementControl({
        assembler,
        stateStore: store,
        backend: input.backend,
        production: input.production,
        control,
        targetDisplacement: point.target,
        signal: input.signal,
        isCancelled: input.isCancelled,
        onProgress: (row) => emit(input, { ...row, protocolPoint: pointIndex, target: point.target }),
        options: {
          ...(options.displacement || {}),
          ...(point.options || {}),
          targetDisplacement: point.target,
        },
      });
      if (solved.ok) {
        try {
          for (const accepted of solved.acceptedSteps || []) {
            const nextEvaluation = accepted.evaluation;
            externalWork += incrementalExternalWork(previousEvaluation, nextEvaluation);
            previousEvaluation = nextEvaluation;
            path.push(pathRow(nextEvaluation, control, pointIndex, externalWork, 'displacement'));
            materialEvents.push(...(accepted.hingeEvents || []).map((event) => ({ ...event, protocolPoint: pointIndex })));
          }
        } catch (error) {
          rollbackSegment();
          return partial(false, error.code || 'CYCLIC_PATH_INTEGRATION_FAILED', 'failed', {
            error: serialize(error),
            rollbackEquivalent: true,
            rolledBackProtocolPoint: pointIndex,
          });
        }
      }
    } else if (point.type === 'load') {
      solved = await runMdofLoadControl({
        assembler,
        stateStore: store,
        backend: input.backend,
        production: input.production,
        signal: input.signal,
        isCancelled: input.isCancelled,
        onProgress: (row) => emit(input, { ...row, protocolPoint: pointIndex, target: point.target }),
        options: {
          ...(options.load || {}),
          ...(point.options || {}),
          targetLambda: point.target,
        },
      });
      if (solved.ok) {
        try {
          const acceptedEvaluations = (solved.acceptedSteps || []).filter((row) => row.evaluation?.ok);
          if (acceptedEvaluations.length) {
            for (const accepted of acceptedEvaluations) {
              const nextEvaluation = accepted.evaluation;
              externalWork += incrementalExternalWork(previousEvaluation, nextEvaluation);
              previousEvaluation = nextEvaluation;
              path.push(pathRow(nextEvaluation, control, pointIndex, externalWork, 'load'));
              materialEvents.push(...(accepted.hingeEvents || []).map((event) => ({ ...event, protocolPoint: pointIndex })));
            }
          } else {
            const nextEvaluation = await safeEvaluate(assembler, solved.stateStore, input.mode || 'static');
            if (!nextEvaluation.ok) {
              rollbackSegment();
              return partial(false, nextEvaluation.reason, 'failed', { ...nextEvaluation, rollbackEquivalent: true });
            }
            externalWork += incrementalExternalWork(previousEvaluation, nextEvaluation);
            previousEvaluation = nextEvaluation;
            path.push(pathRow(nextEvaluation, control, pointIndex, externalWork, 'load'));
          }
        } catch (error) {
          rollbackSegment();
          return partial(false, error.code || 'CYCLIC_PATH_INTEGRATION_FAILED', 'failed', {
            error: serialize(error),
            rollbackEquivalent: true,
            rolledBackProtocolPoint: pointIndex,
          });
        }
      }
    } else {
      solved = {
        ok: true,
        status: 'converged',
        reason: 'CYCLIC_HOLD_RECORDED',
        stateStore: store,
        acceptedStepCount: 0,
        rejectedStepCount: 0,
      };
      path.push(pathRow(previousEvaluation, control, pointIndex, externalWork, 'hold'));
    }

    if (!solved.ok) {
      rollbackSegment();
      return partial(false, solved.reason || 'CYCLIC_SEGMENT_FAILED', solved.status || 'failed', {
        solver: solved,
        rollbackEquivalent: true,
        rolledBackProtocolPoint: pointIndex,
      });
    }
    store = solved.stateStore;
    evaluation = previousEvaluation;
    const afterValue = point.type === 'displacement'
      ? evaluatePhysicalControlCoordinate(control, store.committed.q)
      : Number(store.committed.lambda || 0);
    const targetError = Math.abs(afterValue - point.target);
    const targetLimit = nonnegative(options.targetAbsolute, 1e-10)
      + nonnegative(options.targetRelative, 1e-8) * Math.max(1, Math.abs(point.target));
    if (targetError > targetLimit && point.type !== 'hold') {
      rollbackSegment();
      return partial(false, 'CYCLIC_TARGET_NOT_REACHED', 'failed', {
        pointIndex,
        target: point.target,
        actual: afterValue,
        targetError,
        targetLimit,
        rollbackEquivalent: true,
      });
    }
    if (direction !== 0) previousDirection = direction;
    const nextPointIndex = pointIndex + 1;
    const context = {
      version: MDOF_CYCLIC_STATIC_VERSION,
      executionHash,
      protocolHash: protocol.protocolHash,
      controlCoordinateHash: control?.coordinateHash || null,
      nextPointIndex,
      previousDirection,
      externalWork,
      energyBaseline,
      lastQ: Array.from(store.committed.q),
      lastLambda: Number(store.committed.lambda || 0),
      lastExternalReduced: Array.from(evaluation.pExternalReduced || []),
    };
    segmentEvents.push({
      type: 'cyclic-segment-complete',
      protocolPoint: pointIndex,
      controlType: point.type,
      target: point.target,
      actual: afterValue,
      direction,
      reversal: reversed,
    });
    try {
      store = commitProtocolMarker(store, context, segmentEvents);
    } catch (error) {
      rollbackSegment();
      return partial(false, error.code || 'CYCLIC_PROTOCOL_STATE_COMMIT_FAILED', 'failed', {
        error: serialize(error),
        rollbackEquivalent: true,
        rolledBackProtocolPoint: pointIndex,
      });
    }
    const endRow = path.at(-1);
    segments.push({
      index: pointIndex,
      id: point.id,
      type: point.type,
      target: point.target,
      actual: afterValue,
      direction,
      reversal: reversed,
      targetError,
      acceptedStepCount: solved.acceptedStepCount || 0,
      rejectedStepCount: solved.rejectedStepCount || 0,
      externalWorkIncrement: externalWork - segmentStartWork,
      startControlValue: controlValue(segmentStartEvaluation, control),
      endControlValue: controlValue(evaluation, control),
      startForce: generalizedControlForce(segmentStartEvaluation, control),
      endForce: generalizedControlForce(evaluation, control),
      secantStiffness: secantStiffness(segmentStartEvaluation, evaluation, control),
      peakAbsForce: peakAbsForce(path, pointIndex),
      responseHash: endRow?.responseHash || null,
      stateHash: store.committedHash,
    });
    completedThisRun += 1;
    emit(input, { type: 'cyclic-segment-accepted', protocolPoint: pointIndex, target: point.target, actual: afterValue, reversal: reversed });

    function rollbackSegment() {
      store = segmentStartStore;
      previousEvaluation = segmentStartEvaluation;
      externalWork = segmentStartWork;
      path.length = segmentStartPathLength;
      materialEvents.length = segmentStartMaterialEventLength;
      reversals.length = segmentStartReversalLength;
    }
  }

  const nextPointIndex = Number(store.committed.cyclicStatic?.nextPointIndex ?? startIndex + completedThisRun);
  const completed = nextPointIndex >= protocol.points.length;
  const finalEvaluation = await safeEvaluate(assembler, store, input.mode || 'static');
  if (!finalEvaluation.ok) return partial(false, finalEvaluation.reason, 'failed', finalEvaluation);
  const energyBalance = evaluateCyclicEnergyBalance({
    externalWork,
    initial: energyBaseline,
    final: finalEvaluation.energies,
  });
  const checkpoint = createStateCheckpoint(store, {
    role: 'cyclic-static-restart',
    version: MDOF_CYCLIC_STATIC_VERSION,
    executionHash,
    nextPointIndex,
  });
  return {
    version: MDOF_CYCLIC_STATIC_VERSION,
    ok: true,
    status: completed ? 'converged' : 'partial',
    reason: completed ? 'CYCLIC_PROTOCOL_COMPLETED' : 'CYCLIC_SEGMENT_LIMIT_REACHED',
    protocol,
    executionHash,
    control,
    stateStore: store,
    restartCheckpoint: checkpoint,
    startPointIndex: startIndex,
    nextPointIndex,
    completedPointCount: nextPointIndex,
    segments,
    path,
    reversals,
    materialEvents,
    energyBalance,
    residualDeformation: control ? evaluatePhysicalControlCoordinate(control, store.committed.q) : null,
    finalLambda: Number(store.committed.lambda || 0),
    finalQ: Array.from(store.committed.q),
    finalEvaluation,
  };

  function partial(ok, reason, status, details = null) {
    return {
      version: MDOF_CYCLIC_STATIC_VERSION,
      ok,
      status,
      reason,
      protocol,
      executionHash,
      control,
      stateStore: store,
      startPointIndex: startIndex,
      nextPointIndex: Number(store?.committed?.cyclicStatic?.nextPointIndex ?? startIndex + completedThisRun),
      segments,
      path,
      reversals,
      materialEvents,
      externalWork,
      details: serialize(details),
    };
  }
}

function normalizePoint(value, index) {
  const rawType = String(value.type || value.control || 'displacement').trim().toLowerCase();
  const type = rawType === 'lambda' || rawType === 'load-factor' ? 'load' : rawType;
  if (!['displacement', 'load', 'hold'].includes(type)) {
    throw cyclicError('CYCLIC_CONTROL_TYPE_INVALID', `Unsupported cyclic control type at point ${index}: ${rawType}.`);
  }
  const source = type === 'displacement'
    ? value.target ?? value.targetDisplacement ?? value.value
    : type === 'load' ? value.target ?? value.targetLambda ?? value.value : value.target ?? value.value ?? 0;
  const target = finite(source, `protocol[${index}].target`);
  return Object.freeze({
    id: String(value.id || `CYC-${String(index + 1).padStart(3, '0')}`),
    index,
    type,
    target,
    options: clone(value.options || {}),
  });
}

function commitProtocolMarker(store, context, events) {
  let working = beginStateStep(store, {
    lambda: store.committed.lambda,
    q: store.committed.q,
    u: store.committed.u,
    elementStates: store.committed.elementStates,
    energies: store.committed.energies,
    solver: MDOF_CYCLIC_STATIC_VERSION,
    protocolOnly: true,
  });
  working = updateTrialState(working, { cyclicStatic: context });
  return commitStateStep(working, { converged: true, events });
}

async function safeEvaluate(assembler, store, mode) {
  try {
    const evaluation = await assembler.evaluate({
      q: store.committed.q,
      lambda: store.committed.lambda,
      committedElementStates: store.committed.elementStates || {},
      mode,
    });
    return evaluation && typeof evaluation === 'object'
      ? evaluation
      : { ok: false, reason: 'ASSEMBLER_EVALUATION_INVALID' };
  } catch (error) {
    return { ok: false, reason: error.code || 'ASSEMBLER_EVALUATION_FAILED', message: error.message };
  }
}

function incrementalExternalWork(previous, current) {
  const previousQ = previous?.q || [];
  const currentQ = current?.q || [];
  const previousForce = previous?.pExternalReduced || [];
  const currentForce = current?.pExternalReduced || [];
  if (previousQ.length !== currentQ.length || previousForce.length !== currentForce.length || previousQ.length !== previousForce.length) {
    throw cyclicError('CYCLIC_EXTERNAL_WORK_VECTOR_MISMATCH', 'External-work vectors are incompatible.');
  }
  let work = 0;
  for (let index = 0; index < currentQ.length; index += 1) {
    work += 0.5 * (Number(previousForce[index]) + Number(currentForce[index]))
      * (Number(currentQ[index]) - Number(previousQ[index]));
  }
  return work;
}

function pathRow(evaluation, control, protocolPoint, externalWork, controlType) {
  const core = {
    protocolPoint,
    controlType,
    lambda: Number(evaluation.lambda || 0),
    q: Array.from(evaluation.q || []),
    controlValue: controlValue(evaluation, control),
    controlForce: generalizedControlForce(evaluation, control),
    externalWork,
    energies: clone(evaluation.energies || {}),
    responseHash: evaluation.responseHash || null,
  };
  return Object.freeze({ ...core, pathHash: stableHash(core).slice(0, 24) });
}

function controlValue(evaluation, control) {
  return control ? evaluatePhysicalControlCoordinate(control, evaluation.q || []) : null;
}

function generalizedControlForce(evaluation, control) {
  if (!control) return null;
  const vector = control.reducedVector || [];
  const denominator = dot(vector, vector);
  return denominator > 0 ? dot(vector, evaluation.pInternalReduced || []) / denominator : null;
}

function secantStiffness(start, end, control) {
  if (!control) return null;
  const delta = controlValue(end, control) - controlValue(start, control);
  if (Math.abs(delta) <= 1e-16) return null;
  return (generalizedControlForce(end, control) - generalizedControlForce(start, control)) / delta;
}

function peakAbsForce(path, protocolPoint) {
  return path
    .filter((row) => row.protocolPoint === protocolPoint)
    .reduce((maximum, row) => Math.max(maximum, Math.abs(Number(row.controlForce || 0))), 0);
}

function normalizeEnergy(value = {}) {
  if (value?.source && Number.isFinite(Number(value.recoverable)) && Number.isFinite(Number(value.dissipated))) {
    return {
      recoverable: Number(value.recoverable),
      dissipated: Number(value.dissipated),
      source: clone(value.source),
    };
  }
  const recoverable = firstFinite(value.strain, value.recoverable, value.memberStrain)
    ?? sumNamed(value, ['memberStrain', 'hingeRecoverable', 'fiberRecoverable']);
  const dissipated = firstFinite(value.dissipated)
    ?? sumNamed(value, ['hingeDissipated', 'fiberDissipated']);
  return {
    recoverable: finiteOr(recoverable, 0),
    dissipated: finiteOr(dissipated, 0),
    source: clone(value),
  };
}

function sumNamed(value, keys) {
  return keys.reduce((sum, key) => sum + finiteOr(value?.[key], 0), 0);
}

function firstFinite(...values) {
  return values.find((value) => value != null && Number.isFinite(Number(value)));
}

function blocked(store, reason, message = null, details = null) {
  return {
    version: MDOF_CYCLIC_STATIC_VERSION,
    ok: false,
    status: 'blocked',
    reason,
    message,
    details: serialize(details),
    stateStore: store || null,
    segments: [],
    path: [],
    reversals: [],
    materialEvents: [],
  };
}

function emit(input, payload) {
  if (typeof input.onProgress !== 'function') return;
  try { input.onProgress({ version: MDOF_CYCLIC_STATIC_VERSION, ...payload }); } catch { /* observational */ }
}

function cancelled(input) {
  return input.signal?.aborted === true || (typeof input.isCancelled === 'function' && input.isCancelled() === true);
}

function finiteList(values, name) {
  if (!Array.isArray(values)) throw cyclicError('CYCLIC_VALUE_LIST_INVALID', `${name} must be an array.`);
  return values.map((value, index) => finite(value, `${name}[${index}]`));
}

function dot(left, right) {
  let value = 0;
  for (let index = 0; index < left.length; index += 1) value += Number(left[index]) * Number(right[index] || 0);
  return value;
}

function finite(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw cyclicError('CYCLIC_VALUE_NONFINITE', `${name} must be finite.`);
  return number;
}

function finiteOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function positiveInteger(value, fallback) {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function nonnegativeInteger(value, fallback) {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function nonnegative(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function serialize(value) {
  if (!value) return value;
  if (value instanceof Error) return { name: value.name, code: value.code || null, message: value.message, details: clone(value.details) };
  try { return structuredClone(value); } catch { return { message: String(value) }; }
}

function clone(value) {
  if (value == null) return value;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function cyclicError(code, message, details = null) {
  const error = new Error(message);
  error.name = 'MdofCyclicStaticError';
  error.code = code;
  error.details = details;
  return error;
}
