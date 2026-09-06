export const NONLINEAR_ELEMENT_CONTRACT_VERSION = 'p8-m1-nonlinear-element-contract-v1';
export const NONLINEAR_ELEMENT_MODES = Object.freeze(['static', 'dynamic', 'initial-tangent']);

export function createNonlinearElementContract(input = {}) {
  if (!clean(input.type) || typeof input.evaluate !== 'function') {
    const error = new TypeError('Nonlinear element contract requires type and evaluate function.');
    error.code = 'NONLINEAR_ELEMENT_CONTRACT_INVALID';
    throw error;
  }
  return Object.freeze({
    version: NONLINEAR_ELEMENT_CONTRACT_VERSION,
    type: clean(input.type),
    stateVersion: clean(input.stateVersion) || `${clean(input.type)}-state-v1`,
    dofCount: positiveInteger(input.dofCount, 12),
    evaluate: input.evaluate,
    serializeState: typeof input.serializeState === 'function' ? input.serializeState : identity,
    deserializeState: typeof input.deserializeState === 'function' ? input.deserializeState : identity,
  });
}

export function validateNonlinearElementResponse(response = {}, dofCount = 12) {
  const errors = [];
  checkVector(response.resistingForceGlobal, dofCount, 'resistingForceGlobal', errors);
  checkMatrix(response.tangentGlobal, dofCount, 'tangentGlobal', errors);
  if (response.massGlobal != null) checkMatrix(response.massGlobal, dofCount, 'massGlobal', errors);
  if (!record(response.trialState)) errors.push('trialState:object-required');
  if (!record(response.energies)) errors.push('energies:object-required');
  return { ok: errors.length === 0, errors };
}

function checkVector(value, size, name, errors) {
  if (!Array.isArray(value) || value.length !== size || value.some((item) => !Number.isFinite(Number(item)))) {
    errors.push(`${name}:finite-vector-${size}`);
  }
}

function checkMatrix(value, size, name, errors) {
  if (!Array.isArray(value) || value.length !== size || value.some((row) => (
    !Array.isArray(row) || row.length !== size || row.some((item) => !Number.isFinite(Number(item)))
  ))) errors.push(`${name}:finite-matrix-${size}`);
}

function positiveInteger(value, fallback) {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function record(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function identity(value) {
  return value;
}

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}
