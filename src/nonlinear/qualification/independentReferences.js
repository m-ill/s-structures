import { stableHash } from '../../core/stableHash.js';

export const PHASE8_INDEPENDENT_REFERENCE_VERSION = 'p8-m11-independent-reference-v1';
export const PHASE8_REFERENCE_CONVENTION_VERSION = 'p8-m11-reference-convention-v1';

const DEFAULT_TOLERANCE = 1e-10;

export function buildPhase8IndependentReferenceCatalog() {
  const rows = [
    source('REF-STATIC-01', 'closed-form', 'Euler-Bernoulli cantilever tip response', {
      citation: 'Euler-Bernoulli beam theory; prismatic cantilever with a transverse tip force.',
      equations: ['delta=P*L^3/(3*E*I)', 'theta=P*L^2/(2*E*I)', 'Mfix=P*L'],
    }),
    source('REF-SECTION-01', 'closed-form', 'Rectangular steel section plastic capacity', {
      citation: 'Plastic stress-block integration for a doubly symmetric rectangle.',
      equations: ['A=b*h', 'I=b*h^3/12', 'Zp=b*h^2/4', 'My=Fy*Zp'],
    }),
    source('REF-DYN-01', 'published-algorithm', 'Newmark average-acceleration integration', {
      citation: 'N. M. Newmark, A Method of Computation for Structural Dynamics, 1959.',
      equations: ['beta=1/4', 'gamma=1/2', 'M*u_ddot+C*u_dot+K*u=-M*ag'],
    }),
    source('REF-LINALG-01', 'separate-reference-solver', 'Scaled partial-pivot Gaussian elimination', {
      citation: 'Independent dense reference implementation used only for small qualification fixtures.',
      equations: ['A*x=b', 'row-scaled partial pivoting', 'back substitution'],
    }),
  ];
  return deepFreeze({
    version: PHASE8_INDEPENDENT_REFERENCE_VERSION,
    independencePolicy: 'No production element, assembly, equilibrium, sparse-solver, or result-recovery implementation is imported.',
    sources: rows,
    catalogHash: stableHash(rows).slice(0, 24),
  });
}

export function auditPhase8ReferenceConvention(input = {}) {
  const convention = {
    version: PHASE8_REFERENCE_CONVENTION_VERSION,
    units: {
      length: input.units?.length || 'm',
      force: input.units?.force || 'kN',
      moment: input.units?.moment || 'kN-m',
      mass: input.units?.mass || 'kN-s2/m',
      acceleration: input.units?.acceleration || 'm/s2',
      rotation: input.units?.rotation || 'rad',
    },
    axes: {
      global: input.axes?.global || 'right-handed XYZ',
      vertical: input.axes?.vertical || '+Z',
      excitation: input.axes?.excitation || 'relative displacement; positive ground acceleration produces -M*ag',
    },
    signs: {
      displacement: input.signs?.displacement || 'positive with selected global axis',
      baseReaction: input.signs?.baseReaction || 'support-on-structure',
      sectionAxial: input.signs?.sectionAxial || 'tension-positive',
      sectionMoment: input.signs?.sectionMoment || 'right-hand-rule',
    },
  };
  const required = [
    convention.units.length,
    convention.units.force,
    convention.units.moment,
    convention.units.mass,
    convention.units.acceleration,
    convention.axes.global,
    convention.axes.vertical,
    convention.signs.sectionAxial,
  ];
  const errors = required.some((value) => !clean(value)) ? ['REFERENCE_CONVENTION_INCOMPLETE'] : [];
  return deepFreeze({
    ...convention,
    ok: errors.length === 0,
    errors,
    conventionHash: stableHash(convention).slice(0, 24),
  });
}

export function solveIndependentDenseSystem(matrix, rhs, options = {}) {
  const A = normalizeSquareMatrix(matrix);
  const b = normalizeVector(rhs, A.length, 'rhs');
  const n = A.length;
  const scale = A.map((row) => Math.max(...row.map((value) => Math.abs(value))));
  if (scale.some((value) => !(value > 0))) throw referenceError('REFERENCE_MATRIX_SINGULAR', 'Reference matrix contains a zero row.');
  const pivotTolerance = positive(options.pivotTolerance, 1e-14);
  let pivotMinimum = Infinity;
  let pivotMaximum = 0;

  for (let column = 0; column < n; column += 1) {
    let pivotRow = column;
    let pivotScore = -1;
    for (let row = column; row < n; row += 1) {
      const score = Math.abs(A[row][column]) / scale[row];
      if (score > pivotScore) {
        pivotScore = score;
        pivotRow = row;
      }
    }
    const pivot = Math.abs(A[pivotRow][column]);
    if (!Number.isFinite(pivot) || pivot <= pivotTolerance * Math.max(1, scale[pivotRow])) {
      throw referenceError('REFERENCE_MATRIX_SINGULAR', `Reference pivot ${column} is singular.`);
    }
    if (pivotRow !== column) {
      [A[column], A[pivotRow]] = [A[pivotRow], A[column]];
      [b[column], b[pivotRow]] = [b[pivotRow], b[column]];
      [scale[column], scale[pivotRow]] = [scale[pivotRow], scale[column]];
    }
    pivotMinimum = Math.min(pivotMinimum, pivot);
    pivotMaximum = Math.max(pivotMaximum, pivot);
    for (let row = column + 1; row < n; row += 1) {
      const factor = A[row][column] / A[column][column];
      A[row][column] = 0;
      for (let index = column + 1; index < n; index += 1) A[row][index] -= factor * A[column][index];
      b[row] -= factor * b[column];
    }
  }

  const x = new Array(n).fill(0);
  for (let row = n - 1; row >= 0; row -= 1) {
    let value = b[row];
    for (let column = row + 1; column < n; column += 1) value -= A[row][column] * x[column];
    x[row] = value / A[row][row];
  }
  const residual = denseResidual(matrix, x, rhs);
  return deepFreeze({
    version: PHASE8_INDEPENDENT_REFERENCE_VERSION,
    ok: true,
    solution: x,
    residual,
    pivotMinimum,
    pivotMaximum,
    solver: 'independent-scaled-partial-pivot-dense',
    resultHash: stableHash({ x, residual }).slice(0, 24),
  });
}

export function eulerBernoulliCantileverReference(input = {}) {
  const E = positive(input.E, null, 'E');
  const I = positive(input.I, null, 'I');
  const L = positive(input.L, null, 'L');
  const P = finite(input.P, 'P');
  const response = {
    tipDisplacement: P * L ** 3 / (3 * E * I),
    tipRotation: P * L ** 2 / (2 * E * I),
    fixedEndMoment: P * L,
    fixedEndShear: P,
  };
  return referenceResult('REF-STATIC-01', input, response);
}

export function rectangularSteelSectionReference(input = {}) {
  const width = positive(input.width ?? input.b, null, 'width');
  const depth = positive(input.depth ?? input.h, null, 'depth');
  const yieldStress = positive(input.yieldStress ?? input.Fy, null, 'yieldStress');
  const response = {
    area: width * depth,
    elasticInertia: width * depth ** 3 / 12,
    elasticSectionModulus: width * depth ** 2 / 6,
    plasticSectionModulus: width * depth ** 2 / 4,
    plasticMoment: yieldStress * width * depth ** 2 / 4,
  };
  return referenceResult('REF-SECTION-01', input, response);
}

export function integrateLinearSdofNewmarkReference(input = {}) {
  const mass = positive(input.mass, null, 'mass');
  const damping = nonnegative(input.damping, 0, 'damping');
  const stiffness = positive(input.stiffness, null, 'stiffness');
  const dt = positive(input.dt, null, 'dt');
  const beta = positive(input.beta, 0.25, 'beta');
  const gamma = positive(input.gamma, 0.5, 'gamma');
  const acceleration = normalizeVector(input.groundAcceleration || input.ag || [], null, 'groundAcceleration');
  if (acceleration.length < 2) throw referenceError('REFERENCE_GROUND_MOTION_REQUIRED', 'At least two acceleration samples are required.');

  const displacement = new Array(acceleration.length).fill(0);
  const velocity = new Array(acceleration.length).fill(0);
  const relativeAcceleration = new Array(acceleration.length).fill(0);
  displacement[0] = finite(input.initialDisplacement ?? input.u0 ?? 0, 'initialDisplacement');
  velocity[0] = finite(input.initialVelocity ?? input.v0 ?? 0, 'initialVelocity');
  const forceAt = (index) => -mass * acceleration[index];
  relativeAcceleration[0] = (forceAt(0) - damping * velocity[0] - stiffness * displacement[0]) / mass;

  const a0 = 1 / (beta * dt ** 2);
  const a1 = gamma / (beta * dt);
  const a2 = 1 / (beta * dt);
  const a3 = 1 / (2 * beta) - 1;
  const a4 = gamma / beta - 1;
  const a5 = dt * (gamma / (2 * beta) - 1);
  const effectiveStiffness = stiffness + a0 * mass + a1 * damping;

  for (let index = 0; index < acceleration.length - 1; index += 1) {
    const effectiveForce = forceAt(index + 1)
      + mass * (a0 * displacement[index] + a2 * velocity[index] + a3 * relativeAcceleration[index])
      + damping * (a1 * displacement[index] + a4 * velocity[index] + a5 * relativeAcceleration[index]);
    displacement[index + 1] = effectiveForce / effectiveStiffness;
    relativeAcceleration[index + 1] = a0 * (displacement[index + 1] - displacement[index])
      - a2 * velocity[index]
      - a3 * relativeAcceleration[index];
    velocity[index + 1] = velocity[index]
      + dt * ((1 - gamma) * relativeAcceleration[index] + gamma * relativeAcceleration[index + 1]);
  }

  const time = acceleration.map((_, index) => index * dt);
  const response = {
    time,
    displacement,
    velocity,
    relativeAcceleration,
    absoluteAcceleration: relativeAcceleration.map((value, index) => value + acceleration[index]),
    effectiveStiffness,
  };
  return referenceResult('REF-DYN-01', {
    mass, damping, stiffness, dt, beta, gamma, groundAcceleration: acceleration,
    initialDisplacement: displacement[0], initialVelocity: velocity[0],
  }, response);
}

export function compareReferenceValues(actual, expected, options = {}) {
  const left = flattenFinite(actual, 'actual');
  const right = flattenFinite(expected, 'expected');
  if (left.length !== right.length) throw referenceError('REFERENCE_VECTOR_LENGTH_MISMATCH', 'Reference vectors have different lengths.');
  let absoluteMaximum = 0;
  let differenceSquared = 0;
  let expectedSquared = 0;
  for (let index = 0; index < left.length; index += 1) {
    const difference = left[index] - right[index];
    absoluteMaximum = Math.max(absoluteMaximum, Math.abs(difference));
    differenceSquared += difference ** 2;
    expectedSquared += right[index] ** 2;
  }
  const relativeL2 = Math.sqrt(differenceSquared) / Math.max(Math.sqrt(expectedSquared), Number.EPSILON);
  const absoluteTolerance = nonnegative(options.absoluteTolerance, DEFAULT_TOLERANCE, 'absoluteTolerance');
  const relativeTolerance = nonnegative(options.relativeTolerance, DEFAULT_TOLERANCE, 'relativeTolerance');
  return deepFreeze({
    ok: absoluteMaximum <= absoluteTolerance || relativeL2 <= relativeTolerance,
    count: left.length,
    absoluteMaximum,
    relativeL2,
    absoluteTolerance,
    relativeTolerance,
  });
}

export function runPhase8IndependentReferenceQualification() {
  const catalog = buildPhase8IndependentReferenceCatalog();
  const convention = auditPhase8ReferenceConvention();
  const exactSolution = [1.25, -0.75, 2.5];
  const matrix = [
    [5, -1, 0.5],
    [-1, 4, -0.25],
    [0.5, -0.25, 3],
  ];
  const rhs = matrix.map((row) => row.reduce((sum, value, index) => sum + value * exactSolution[index], 0));
  const dense = solveIndependentDenseSystem(matrix, rhs);
  const denseComparison = compareReferenceValues(dense.solution, exactSolution, {
    absoluteTolerance: 1e-12,
    relativeTolerance: 1e-12,
  });
  const cantilever = eulerBernoulliCantileverReference({ E: 2e8, I: 2.5e-4, L: 3, P: 10 });
  const section = rectangularSteelSectionReference({ width: 0.3, depth: 0.5, yieldStress: 275000 });

  const frequency = 5;
  const duration = 1;
  const coarse = freeVibrationReference(frequency, duration, 0.02);
  const fine = freeVibrationReference(frequency, duration, 0.01);
  const exact = Math.cos(frequency * duration);
  const coarseError = Math.abs(coarse.response.displacement.at(-1) - exact);
  const fineError = Math.abs(fine.response.displacement.at(-1) - exact);
  const dynamicPass = fineError < coarseError && fineError < 0.002;
  const rows = [
    qualificationRow('REF-CONVENTION', convention.ok, { conventionHash: convention.conventionHash }),
    qualificationRow('REF-LINALG-01', denseComparison.ok && dense.residual <= 1e-12, {
      residual: dense.residual,
      relativeError: denseComparison.relativeL2,
    }),
    qualificationRow('REF-STATIC-01', close(cantilever.response.tipDisplacement, 0.0018, 1e-12), cantilever.response),
    qualificationRow('REF-SECTION-01', close(section.response.plasticSectionModulus, 0.01875, 1e-12), section.response),
    qualificationRow('REF-DYN-01', dynamicPass, { coarseError, fineError, refinementRatio: fineError / coarseError }),
  ];
  const core = {
    version: PHASE8_INDEPENDENT_REFERENCE_VERSION,
    status: rows.every((row) => row.status === 'PASS') ? 'PASS' : 'FAIL',
    qualificationLevel: 'L2-L3-independent-closed-form-and-separate-reference-code',
    externalCommercialComparison: false,
    catalog,
    convention,
    results: rows,
  };
  return deepFreeze({ ...core, qualificationHash: stableHash(core).slice(0, 24) });
}

function freeVibrationReference(frequency, duration, dt) {
  const count = Math.round(duration / dt) + 1;
  return integrateLinearSdofNewmarkReference({
    mass: 1,
    damping: 0,
    stiffness: frequency ** 2,
    dt,
    groundAcceleration: new Array(count).fill(0),
    initialDisplacement: 1,
    initialVelocity: 0,
  });
}

function source(id, sourceClass, title, detail) {
  const core = {
    version: PHASE8_INDEPENDENT_REFERENCE_VERSION,
    id,
    sourceClass,
    title,
    ...detail,
    implementation: 'src/nonlinear/qualification/independentReferences.js',
    productionCodeImported: false,
  };
  return deepFreeze({ ...core, sourceHash: stableHash(core).slice(0, 24) });
}

function referenceResult(sourceId, input, response) {
  const core = {
    version: PHASE8_INDEPENDENT_REFERENCE_VERSION,
    sourceId,
    input: clone(input),
    response,
  };
  return deepFreeze({ ...core, resultHash: stableHash(core).slice(0, 24) });
}

function qualificationRow(id, pass, metrics) {
  return deepFreeze({ id, status: pass ? 'PASS' : 'FAIL', metrics, test: 'runPhase8IndependentReferenceQualification' });
}

function normalizeSquareMatrix(value) {
  if (!Array.isArray(value) || !value.length) throw referenceError('REFERENCE_MATRIX_INVALID', 'A nonempty square matrix is required.');
  const size = value.length;
  return value.map((row, rowIndex) => {
    if (!Array.isArray(row) && !ArrayBuffer.isView(row)) throw referenceError('REFERENCE_MATRIX_INVALID', `Matrix row ${rowIndex} is invalid.`);
    if (row.length !== size) throw referenceError('REFERENCE_MATRIX_INVALID', 'Reference matrix must be square.');
    return Array.from(row, (item, columnIndex) => finite(item, `matrix[${rowIndex}][${columnIndex}]`));
  });
}

function normalizeVector(value, length, path) {
  if (!Array.isArray(value) && !ArrayBuffer.isView(value)) throw referenceError('REFERENCE_VECTOR_INVALID', `${path} must be an array.`);
  if (length != null && value.length !== length) throw referenceError('REFERENCE_VECTOR_LENGTH_MISMATCH', `${path} length must be ${length}.`);
  return Array.from(value, (item, index) => finite(item, `${path}[${index}]`));
}

function flattenFinite(value, path) {
  if (typeof value === 'number') return [finite(value, path)];
  if (Array.isArray(value) || ArrayBuffer.isView(value)) {
    return Array.from(value).flatMap((item, index) => flattenFinite(item, `${path}[${index}]`));
  }
  throw referenceError('REFERENCE_VALUE_INVALID', `${path} must contain only finite numeric arrays.`);
}

function denseResidual(matrix, x, rhs) {
  let maximum = 0;
  let scale = 1;
  for (let row = 0; row < matrix.length; row += 1) {
    const value = matrix[row].reduce((sum, item, index) => sum + Number(item) * x[index], 0);
    maximum = Math.max(maximum, Math.abs(value - Number(rhs[row])));
    scale = Math.max(scale, Math.abs(Number(rhs[row])));
  }
  return maximum / scale;
}

function close(actual, expected, tolerance) {
  return Math.abs(Number(actual) - Number(expected)) <= tolerance * Math.max(1, Math.abs(Number(expected)));
}

function finite(value, path) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw referenceError('REFERENCE_VALUE_NONFINITE', `${path} must be finite.`);
  return number;
}

function positive(value, fallback, path = 'value') {
  if (value == null && fallback != null) return fallback;
  const number = finite(value, path);
  if (!(number > 0)) throw referenceError('REFERENCE_VALUE_INVALID', `${path} must be positive.`);
  return number;
}

function nonnegative(value, fallback, path) {
  if (value == null) return fallback;
  const number = finite(value, path);
  if (number < 0) throw referenceError('REFERENCE_VALUE_INVALID', `${path} must be nonnegative.`);
  return number;
}

function referenceError(code, message) {
  const error = new Error(message);
  error.name = 'Phase8IndependentReferenceError';
  error.code = code;
  return error;
}

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
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
