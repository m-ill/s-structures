import { stableHash } from '../../core/stableHash.js';
import {
  combineCscMatrices,
  cscDiagonal,
  cscSymmetryError,
  validateDynamicCsc,
} from './sparseMatrix.js';

export const MDOF_DAMPING_VERSION = 'p8-m8-mdof-damping-v1';
export const RAYLEIGH_STIFFNESS_POLICIES = Object.freeze(['initial', 'committed']);

export function solveMdofRayleighCoefficients(input = {}) {
  const first = normalizeTarget(input.first || {
    omega: input.omega1 ?? input.w1,
    frequencyHz: input.frequencyHz1 ?? input.f1,
    period: input.period1,
    dampingRatio: input.dampingRatio1 ?? input.zeta1,
  }, 'first');
  const second = normalizeTarget(input.second || {
    omega: input.omega2 ?? input.w2,
    frequencyHz: input.frequencyHz2 ?? input.f2,
    period: input.period2,
    dampingRatio: input.dampingRatio2 ?? input.zeta2,
  }, 'second');
  if (Math.abs(first.omega - second.omega) <= 1e-12 * Math.max(first.omega, second.omega)) {
    throw dampingError('RAYLEIGH_FREQUENCIES_DUPLICATE', 'Rayleigh targets require two distinct positive frequencies.');
  }
  const denominator = second.omega ** 2 - first.omega ** 2;
  const beta = 2 * (second.dampingRatio * second.omega - first.dampingRatio * first.omega) / denominator;
  const alpha = 2 * first.omega * first.dampingRatio - beta * first.omega ** 2;
  if (!Number.isFinite(alpha) || !Number.isFinite(beta) || alpha < 0 || beta < 0) {
    throw dampingError('RAYLEIGH_COEFFICIENTS_INVALID', 'Rayleigh targets produce negative or non-finite coefficients.', {
      first,
      second,
      alpha,
      beta,
    });
  }
  return Object.freeze({
    version: MDOF_DAMPING_VERSION,
    alpha,
    beta,
    first,
    second,
    verification: Object.freeze({
      first: dampingRatioAtOmega({ alpha, beta }, first.omega),
      second: dampingRatioAtOmega({ alpha, beta }, second.omega),
    }),
  });
}

export function buildMdofDampingMatrix(input = {}) {
  const massDomain = input.massDomain;
  validateDynamicCsc(massDomain?.matrix);
  const specification = input.specification || input.damping || {};
  const type = String(specification.type || 'rayleigh').trim().toLowerCase();
  if (type === 'none') {
    const matrix = combineCscMatrices([], { size: massDomain.reducedDofCount });
    return finalizeDamping(matrix, massDomain, null, 'none', 'initial');
  }
  if (type !== 'rayleigh') throw dampingError('DAMPING_TYPE_UNSUPPORTED', `Unsupported damping type: ${type}.`);
  const stiffnessPolicy = normalizePolicy(specification.stiffnessPolicy || specification.stiffnessSource || 'initial');
  const stiffnessMatrix = input.stiffnessMatrix || input[`${stiffnessPolicy}Stiffness`];
  if (!stiffnessMatrix) {
    throw dampingError('RAYLEIGH_STIFFNESS_REQUIRED', `Rayleigh damping requires the ${stiffnessPolicy} stiffness matrix.`);
  }
  validateDynamicCsc(stiffnessMatrix);
  const coefficients = specification.coefficients
    ? normalizeCoefficients(specification.coefficients)
    : solveMdofRayleighCoefficients(specification);
  const matrix = combineCscMatrices([
    { matrix: massDomain.matrix, factor: coefficients.alpha },
    { matrix: stiffnessMatrix, factor: coefficients.beta },
  ]);
  const symmetryError = cscSymmetryError(matrix);
  if (symmetryError > positiveOr(specification.symmetryTolerance, 1e-10)) {
    throw dampingError('DAMPING_MATRIX_NONSYMMETRIC', 'Rayleigh damping matrix failed symmetry validation.', { symmetryError });
  }
  const diagonal = cscDiagonal(matrix);
  const minimumDiagonal = diagonal.length
    ? Array.from(diagonal).reduce((minimum, value) => Math.min(minimum, value), Infinity)
    : 0;
  const diagonalScale = Array.from(diagonal).reduce((maximum, value) => Math.max(maximum, Math.abs(value)), 1);
  if (minimumDiagonal < -diagonalScale * positiveOr(specification.positivityTolerance, 1e-12)) {
    throw dampingError('DAMPING_MATRIX_NEGATIVE_DIAGONAL', 'Rayleigh damping matrix contains a negative diagonal term.', {
      minimumDiagonal,
      diagonalScale,
      stiffnessPolicy,
    });
  }
  return finalizeDamping(matrix, massDomain, coefficients, type, stiffnessPolicy, stiffnessMatrix, symmetryError, minimumDiagonal);
}

export function dampingRatioAtOmega(rayleigh = {}, omegaInput) {
  const omega = positive(omegaInput, 'omega');
  const alpha = nonnegative(rayleigh.alpha, 'alpha');
  const beta = nonnegative(rayleigh.beta, 'beta');
  return alpha / (2 * omega) + beta * omega / 2;
}

function finalizeDamping(
  matrix,
  massDomain,
  coefficients,
  type,
  stiffnessPolicy,
  stiffnessMatrix = null,
  symmetryError = 0,
  minimumDiagonal = 0,
) {
  const core = {
    version: MDOF_DAMPING_VERSION,
    ok: true,
    type,
    matrix,
    coefficients,
    stiffnessPolicy,
    symmetryError,
    minimumDiagonal,
    source: Object.freeze({
      massHash: massDomain.massHash || null,
      massMatrixHash: massDomain.matrix.valueHash || null,
      stiffnessPatternHash: stiffnessMatrix?.patternHash || null,
      stiffnessValueHash: stiffnessMatrix
        ? stiffnessMatrix.valueHash || stableHash(Array.from(stiffnessMatrix.values || [])).slice(0, 24)
        : null,
    }),
  };
  return Object.freeze({
    ...core,
    dampingHash: stableHash({
      type,
      coefficients,
      stiffnessPolicy,
      source: core.source,
      matrix: Array.from(matrix.values),
    }).slice(0, 24),
  });
}

function normalizeTarget(input, name) {
  let omega = Number(input?.omega);
  if (!(omega > 0) && Number(input?.frequencyHz) > 0) omega = 2 * Math.PI * Number(input.frequencyHz);
  if (!(omega > 0) && Number(input?.period) > 0) omega = 2 * Math.PI / Number(input.period);
  if (!Number.isFinite(omega) || !(omega > 0)) throw dampingError('RAYLEIGH_FREQUENCY_INVALID', `${name} Rayleigh target requires positive omega, frequencyHz, or period.`);
  const dampingRatio = nonnegative(input?.dampingRatio ?? input?.zeta, `${name}.dampingRatio`);
  if (dampingRatio > 1) throw dampingError('RAYLEIGH_DAMPING_RATIO_INVALID', `${name}.dampingRatio must not exceed 1.`);
  return Object.freeze({ omega, dampingRatio });
}

function normalizeCoefficients(input) {
  const alpha = nonnegative(input.alpha, 'alpha');
  const beta = nonnegative(input.beta, 'beta');
  return Object.freeze({ version: MDOF_DAMPING_VERSION, alpha, beta, first: null, second: null, verification: null });
}

function normalizePolicy(value) {
  const policy = String(value || '').trim().toLowerCase();
  if (!RAYLEIGH_STIFFNESS_POLICIES.includes(policy)) {
    throw dampingError('RAYLEIGH_STIFFNESS_POLICY_INVALID', `Unsupported Rayleigh stiffness policy: ${value}.`);
  }
  return policy;
}

function positive(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || !(number > 0)) throw dampingError('DAMPING_VALUE_INVALID', `${name} must be positive.`);
  return number;
}

function nonnegative(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw dampingError('DAMPING_VALUE_INVALID', `${name} must be finite and nonnegative.`);
  return number;
}

function positiveOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function dampingError(code, message, details = null) {
  const error = new Error(message);
  error.name = 'MdofDampingError';
  error.code = code;
  error.details = details;
  return error;
}
