import { validateNonlinearElementResponse } from '../../nonlinear/core/elementContract.js';
import {
  boundedBatchValueHash,
  NONLINEAR_BATCH_CONTRACT_VERSION,
  validateNonlinearElementBatch,
} from './batchContract.js';

export const CPU_NONLINEAR_BATCH_EVALUATOR_VERSION = 'p9-m7-cpu-nonlinear-batch-f64-v1';

export function createCpuNonlinearBatchEvaluator(batch, options = {}) {
  const validation = validateNonlinearElementBatch(batch);
  if (!validation.ok) throw batchError('NONLINEAR_BATCH_CONTRACT_INVALID', validation.errors.join(', '));
  const kinematics = new Float64Array(batch.totalElementDofs);
  const resistingForces = new Float64Array(batch.totalElementDofs);
  const tangents = new Float64Array(batch.totalMatrixValues);
  let evaluationCount = 0;
  let batchCount = 0;
  let totalDurationMs = 0;

  return Object.freeze({
    version: CPU_NONLINEAR_BATCH_EVALUATOR_VERSION,
    backendId: 'cpu-js-nonlinear-batch-f64',
    precision: 'f64',
    batch,
    get telemetry() {
      return Object.freeze({
        batchCount,
        evaluationCount,
        totalDurationMs,
        reusableWorkspaceBytes: kinematics.byteLength + resistingForces.byteLength + tangents.byteLength,
        perElementCommittedStateCloneCount: 0,
        nestedTangentCopies: 0,
      });
    },
    async evaluate(input = {}) {
      const startedAt = now();
      const fullDisplacement = finiteVector(input.fullDisplacement, input.fullDofCount, 'fullDisplacement');
      const reducedDisplacement = input.reducedDisplacement;
      const committedElementStates = input.committedElementStates || {};
      const committedHashBefore = boundedBatchValueHash(committedElementStates);
      resistingForces.fill(0);
      tangents.fill(0);
      const trialStates = new Array(batch.elementCount);
      const responses = new Array(batch.elementCount);
      const inactiveModes = new Array(batch.elementCount);
      const energyRows = new Array(batch.elementCount);

      for (const elementIndex of batch.evaluationOrder) {
        const entry = batch.entries[elementIndex];
        const dofStart = batch.dofOffsets[elementIndex];
        const dofEnd = batch.dofOffsets[elementIndex + 1];
        const dofs = batch.dofIndices.subarray(dofStart, dofEnd);
        for (let local = 0; local < dofs.length; local += 1) kinematics[dofStart + local] = fullDisplacement[dofs[local]];
        const uElement = kinematics.subarray(dofStart, dofEnd);
        const prepared = typeof input.prepareElementInput === 'function'
          ? input.prepareElementInput(entry, elementIndex, uElement)
          : {};
        let response;
        try {
          response = await entry.kernel.evaluate({
            element: entry.descriptor || entry.element || { id: entry.id },
            committedState: readonlyCommittedState(committedState(committedElementStates, entry.id)),
            elementLoads: prepared.elementLoads || prepared.memberLoad || null,
            trialKinematics: {
              uGlobal: uElement,
              fullDisplacement,
              reducedDisplacement,
              lambda: Number(input.lambda || 0),
              memberFixedEndLocal: prepared.memberFixedEndLocal || prepared.elementLoads?.fixedEndLocal || null,
            },
            dt: input.dt ?? null,
            mode: input.mode || 'static',
          });
        } catch (error) {
          return failed('ELEMENT_EVALUATION_FAILED', entry.id, error);
        }
        const elementValidation = validateNonlinearElementResponse(response, dofs.length);
        if (!elementValidation.ok) return failed('ELEMENT_RESPONSE_INVALID', entry.id, null, elementValidation.errors);
        const force = resistingForces.subarray(dofStart, dofEnd);
        for (let local = 0; local < dofs.length; local += 1) force[local] = Number(response.resistingForceGlobal[local]);
        const matrixStart = batch.matrixOffsets[elementIndex];
        flattenMatrixInto(response.tangentGlobal, dofs.length, tangents, matrixStart);
        trialStates[elementIndex] = response.trialState;
        responses[elementIndex] = response;
        inactiveModes[elementIndex] = Array.isArray(response.inactiveModesGlobal) ? response.inactiveModesGlobal : [];
        try {
          energyRows[elementIndex] = normalizeEnergies(response.energies, entry.id);
        } catch (error) {
          return failed(error.code || 'ELEMENT_ENERGY_NONFINITE', entry.id, error);
        }
      }
      if (committedHashBefore !== boundedBatchValueHash(committedElementStates)) {
        return failed('ELEMENT_COMMITTED_STATE_MUTATED', null, null, ['committed-state-bounded-hash-changed']);
      }
      evaluationCount += batch.elementCount;
      batchCount += 1;
      const durationMs = now() - startedAt;
      totalDurationMs += durationMs;
      return Object.freeze({
        version: CPU_NONLINEAR_BATCH_EVALUATOR_VERSION,
        ok: true,
        backendId: 'cpu-js-nonlinear-batch-f64',
        precision: 'f64',
        batchHash: batch.batchHash,
        committedStateHash: committedHashBefore,
        resistingForces: Float64Array.from(resistingForces),
        tangents: Float64Array.from(tangents),
        trialStates,
        responses,
        inactiveModes,
        energyRows,
        diagnostics: Object.freeze({
          durationMs,
          batchCount,
          evaluationCount,
          groupCount: batch.groups.length,
          reusableWorkspaceBytes: kinematics.byteLength + resistingForces.byteLength + tangents.byteLength,
          perElementCommittedStateCloneCount: 0,
          nestedTangentCopies: 0,
          batchBoundaryValidation: true,
          boundedStateHash: true,
        }),
      });
    },
  });
}

function committedState(states, id) {
  const value = states instanceof Map ? states.get(id) : states?.[id];
  return value?.data ?? value ?? {};
}

function readonlyCommittedState(value) {
  if (value == null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  return readOnlyProxy(value, new WeakMap());
}

function readOnlyProxy(value, cache) {
  if (value == null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  const cached = cache.get(value);
  if (cached) return cached;
  const proxy = new Proxy(value, {
    get(target, property, receiver) {
      return readOnlyProxy(Reflect.get(target, property, receiver), cache);
    },
    set() { throw batchError('ELEMENT_COMMITTED_STATE_READ_ONLY', 'Element committed state is read only.'); },
    deleteProperty() { throw batchError('ELEMENT_COMMITTED_STATE_READ_ONLY', 'Element committed state is read only.'); },
    defineProperty() { throw batchError('ELEMENT_COMMITTED_STATE_READ_ONLY', 'Element committed state is read only.'); },
    setPrototypeOf() { throw batchError('ELEMENT_COMMITTED_STATE_READ_ONLY', 'Element committed state is read only.'); },
  });
  cache.set(value, proxy);
  return proxy;
}

function flattenMatrixInto(matrix, size, output, offset) {
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) output[offset + row * size + column] = Number(matrix[row][column]);
  }
}

function normalizeEnergies(energies, elementId) {
  const output = {};
  for (const [key, value] of Object.entries(energies || {})) {
    const number = Number(value);
    if (!Number.isFinite(number)) throw batchError('ELEMENT_ENERGY_NONFINITE', `Element ${elementId} energy ${key} is non-finite.`);
    output[key] = number;
  }
  return output;
}

function finiteVector(values, expectedLength, field) {
  if ((values == null || typeof values.length !== 'number') || (expectedLength != null && values.length !== expectedLength)) {
    throw batchError('NONLINEAR_BATCH_VECTOR_SIZE', `${field} has an invalid size.`);
  }
  const output = values instanceof Float64Array ? values : Float64Array.from(values, Number);
  if (output.some((value) => !Number.isFinite(value))) throw batchError('NONLINEAR_BATCH_VECTOR_NONFINITE', `${field} must be finite.`);
  return output;
}

function failed(reason, elementId, error = null, errors = []) {
  return Object.freeze({
    version: CPU_NONLINEAR_BATCH_EVALUATOR_VERSION,
    ok: false,
    reason,
    elementId,
    message: error?.message || reason,
    errors,
  });
}

function now() { return globalThis.performance?.now?.() ?? Date.now(); }
function batchError(code, message) { return Object.assign(new Error(message), { code }); }

export function isNonlinearBatchContract(value) {
  return value?.version === NONLINEAR_BATCH_CONTRACT_VERSION;
}
