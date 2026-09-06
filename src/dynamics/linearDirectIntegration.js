import { createElasticFactorSession } from '../compute/elastic/factorSession.js';
import { stableHash } from '../core/stableHash.js';
import { createCanonicalAccelerationSeries } from './groundMotionSeries.js';
import { buildModalDampingMatrix } from './modalDamping.js';

export const LINEAR_DIRECT_THA_VERSION = 'p14-m2-linear-direct-tha-v2';
export const LINEAR_DIRECT_NEWMARK = Object.freeze({ beta: 0.25, gamma: 0.5 });

export function rayleighDampingFromModes(mass, stiffness, modes = [], dampingRatio = 0.05) {
  const omegas = modes.map((mode) => Number(mode?.omega)).filter((value) => value > 0).slice(0, 2);
  const zeta = Math.max(0, Number(dampingRatio) || 0);
  let massCoefficient = 0;
  let stiffnessCoefficient = 0;
  if (omegas.length >= 2 && Math.abs(omegas[1] - omegas[0]) > 1e-14) {
    massCoefficient = 2 * zeta * omegas[0] * omegas[1] / (omegas[0] + omegas[1]);
    stiffnessCoefficient = 2 * zeta / (omegas[0] + omegas[1]);
  } else if (omegas.length === 1) {
    massCoefficient = 2 * zeta * omegas[0];
  }
  return {
    matrix: addScaled(mass, massCoefficient, stiffness, stiffnessCoefficient),
    massCoefficient,
    stiffnessCoefficient,
    modeOmegas: omegas,
    dampingRatio: zeta,
  };
}

export function runLinearDirectTha({
  mass = [],
  stiffness = [],
  damping = null,
  dampingType = 'rayleigh',
  modalDampingRatios = null,
  modes = [],
  dampingRatio = 0.05,
  influence = [],
  forceVector = null,
  dt = 0.02,
  accelerations = [],
  times = null,
  targetDt = null,
  interpolation = 'linear',
  accelerationUnit = 'model',
  accelerationScale = 1,
  displacementUnit = 'm',
  initialDisplacement = [],
  initialVelocity = [],
  energyTol = 1e-8,
  factorSession = null,
  recordId = null,
  signal = null,
  checkpointEvery = 0,
  onCheckpoint = null,
  restart = null,
} = {}) {
  const n = stiffness.length;
  validateSquare(mass, n, 'mass');
  validateSquare(stiffness, n, 'stiffness');
  if (!(Number(dt) > 0)) throw new Error('dt must be positive.');
  const series = createCanonicalAccelerationSeries({
    accelerations,
    times,
    dt,
    targetDt,
    interpolation,
    accelerationUnit,
    recordId,
  });
  const unitFactor = accelerationUnitFactor(accelerationUnit, displacementUnit);
  const ground = series.accelerations.map((value, index) => {
    if (!Number.isFinite(value)) throw new Error(`acceleration at step ${index} must be finite.`);
    return value * Number(accelerationScale) * unitFactor;
  });
  const requestedDampingType = String(dampingType || 'rayleigh').trim().toLowerCase();
  const rayleigh = damping || requestedDampingType === 'modal' ? null : rayleighDampingFromModes(mass, stiffness, modes, dampingRatio);
  const modalDamping = damping || requestedDampingType !== 'modal' ? null : buildModalDampingMatrix({
    mass,
    modes,
    dampingRatio,
    dampingRatios: modalDampingRatios,
  });
  const C = damping || modalDamping?.matrix || rayleigh.matrix;
  validateSquare(C, n, 'damping');
  const p = forceVector ? vector(forceVector, n) : matVec(mass, vector(influence, n));
  let u = vector(initialDisplacement, n);
  let v = vector(initialVelocity, n);
  let a = solveDenseSession(mass, add(scale(p, -Number(ground[0] || 0)), scale(add(matVec(C, v), matVec(stiffness, u)), -1)), null, 'initial-mass');
  const beta = LINEAR_DIRECT_NEWMARK.beta;
  const gamma = LINEAR_DIRECT_NEWMARK.gamma;
  const step = series.target.dt || Number(dt);
  const n0 = 1 / (beta * step * step);
  const n1 = gamma / (beta * step);
  const n2 = 1 / (beta * step);
  const n3 = 1 / (2 * beta) - 1;
  const n4 = gamma / beta - 1;
  const n5 = step * (gamma / (2 * beta) - 1);
  const effectiveStiffness = addScaled(stiffness, 1, mass, n0, C, n1);
  const runHash = stableHash({
    version: LINEAR_DIRECT_THA_VERSION,
    seriesHash: series.seriesHash,
    mass: stableHash(mass),
    stiffness: stableHash(stiffness),
    damping: stableHash(C),
    force: stableHash(p),
    step,
    accelerationScale: Number(accelerationScale),
  });
  const ownedSession = !factorSession;
  const session = factorSession || createElasticFactorSession();
  let rows = [];
  let externalWork = 0;
  let dampingDissipation = 0;
  let initialEnergy = energy(mass, stiffness, u, v);
  let maxEnergyError = 0;
  let startStep = 1;
  let lastCheckpoint = null;
  if (restart) {
    if (restart.version !== 'p14-m2-linear-tha-checkpoint-v1' || restart.runHash !== runHash) {
      if (ownedSession) session.dispose();
      throw Object.assign(new Error('Linear THA restart checkpoint does not match the current run.'), { code: 'LINEAR_THA_RESTART_HASH_MISMATCH' });
    }
    u = vector(restart.state?.displacement, n);
    v = vector(restart.state?.velocity, n);
    a = vector(restart.state?.acceleration, n);
    rows = Array.from(restart.rows || []).map((item) => ({ ...item, displacement: item.displacement.slice(), velocity: item.velocity.slice(), acceleration: item.acceleration.slice() }));
    externalWork = Number(restart.energy?.externalWork) || 0;
    dampingDissipation = Number(restart.energy?.dampingDissipation) || 0;
    initialEnergy = Number(restart.energy?.initialEnergy) || 0;
    maxEnergyError = Number(restart.energy?.maxEnergyError) || 0;
    startStep = Number(restart.nextStep);
    if (!Number.isInteger(startStep) || startStep < 1 || startStep > ground.length) throw Object.assign(new Error('Linear THA restart step is invalid.'), { code: 'LINEAR_THA_RESTART_STEP_INVALID' });
    lastCheckpoint = restart;
  } else if (ground.length) rows.push(row(0, step, ground[0], u, v, a, initialEnergy, 0));
  if (signal?.aborted) return cancelledLinearTha(ownedSession ? session.dispose() : session.snapshot(), runHash, lastCheckpoint);
  for (let i = startStep; i < ground.length; i += 1) {
    if (signal?.aborted) return cancelledLinearTha(ownedSession ? session.dispose() : session.snapshot(), runHash, lastCheckpoint);
    const applied = scale(p, -ground[i]);
    const effective = add(
      applied,
      matVec(mass, add(scale(u, n0), scale(v, n2), scale(a, n3))),
      matVec(C, add(scale(u, n1), scale(v, n4), scale(a, n5))),
    );
    const solved = session.solve(effectiveStiffness, effective, {
      groupKey: 'linear-tha-effective-stiffness',
      componentKey: 'newmark-average-acceleration',
      matrixClass: 'spd',
    });
    if (!solved.ok) throw Object.assign(new Error(solved.reason || 'Direct THA factor solve failed.'), { code: solved.reason });
    const nextU = solved.x;
    const nextA = add(scale(add(nextU, scale(u, -1)), n0), scale(v, -n2), scale(a, -n3));
    const nextV = add(v, scale(add(scale(a, 1 - gamma), scale(nextA, gamma)), step));
    const du = add(nextU, scale(u, -1));
    const previousApplied = scale(p, -ground[i - 1]);
    externalWork += 0.5 * dot(add(previousApplied, applied), du);
    dampingDissipation += 0.5 * step * (dot(v, matVec(C, v)) + dot(nextV, matVec(C, nextV)));
    u = nextU;
    v = nextV;
    a = nextA;
    const currentEnergy = energy(mass, stiffness, u, v);
    const error = Math.abs(currentEnergy + dampingDissipation - initialEnergy - externalWork)
      / Math.max(1, Math.abs(initialEnergy), Math.abs(externalWork), Math.abs(currentEnergy));
    maxEnergyError = Math.max(maxEnergyError, error);
    rows.push(row(i, step, ground[i], u, v, a, currentEnergy, error));
    if (Number(checkpointEvery) > 0 && (i % Math.max(1, Math.trunc(Number(checkpointEvery))) === 0 || i === ground.length - 1)) {
      lastCheckpoint = buildCheckpoint({ runHash, nextStep: i + 1, u, v, a, rows, externalWork, dampingDissipation, initialEnergy, maxEnergyError });
      if (typeof onCheckpoint === 'function') onCheckpoint(lastCheckpoint);
    }
  }
  const factorization = ownedSession ? session.dispose() : session.snapshot();
  return {
    version: LINEAR_DIRECT_THA_VERSION,
    ok: rows.length > 0,
    status: rows.length ? 'available' : 'blocked',
    method: 'linear-direct-newmark-average-acceleration',
    integration: 'direct',
    newmark: { ...LINEAR_DIRECT_NEWMARK },
    rayleigh: rayleigh
      ? { ...rayleigh, matrix: undefined }
      : { source: modalDamping ? 'modal-damping-matrix' : 'provided-damping-matrix' },
    damping: damping ? { type: 'provided', matrixHash: stableHash(damping) }
      : modalDamping ? { ...modalDamping, matrix: undefined }
        : { type: 'rayleigh', ...rayleigh, matrix: undefined },
    stiffnessSnapshot: { policy: 'initial-elastic', hash: stableHash(stiffness) },
    massSnapshot: { hash: stableHash(mass) },
    factorization,
    runHash,
    checkpoint: lastCheckpoint,
    partialPublish: false,
    published: true,
    energy: {
      tolerance: Number(energyTol),
      maxRelativeError: maxEnergyError,
      qualified: maxEnergyError <= Number(energyTol),
      balance: 'mechanical-energy + damping-dissipation - initial-energy - external-work',
    },
    record: { id: recordId, sampleCount: ground.length, accelerationUnit, accelerationScale: Number(accelerationScale), unitConversionFactor: unitFactor, seriesHash: series.seriesHash, interpolation: series.interpolation, sourceSampleCount: series.source.sampleCount },
    rows,
    maxDisplacement: Math.max(0, ...rows.flatMap((item) => item.displacement.map(Math.abs))),
    finalState: rows.length ? rows[rows.length - 1] : null,
    designBlocked: maxEnergyError > Number(energyTol),
    designBlockers: maxEnergyError > Number(energyTol) ? ['LINEAR_THA_ENERGY_TOLERANCE_EXCEEDED'] : [],
  };
}

function buildCheckpoint({ runHash, nextStep, u, v, a, rows, externalWork, dampingDissipation, initialEnergy, maxEnergyError }) {
  const core = {
    version: 'p14-m2-linear-tha-checkpoint-v1',
    runHash,
    nextStep,
    state: { displacement: Array.from(u), velocity: Array.from(v), acceleration: Array.from(a) },
    energy: { externalWork, dampingDissipation, initialEnergy, maxEnergyError },
    rows: rows.map((item) => ({ ...item, displacement: item.displacement.slice(), velocity: item.velocity.slice(), acceleration: item.acceleration.slice() })),
  };
  return Object.freeze({ ...core, checkpointHash: stableHash(core) });
}

function cancelledLinearTha(factorization, runHash, checkpoint) {
  return {
    version: LINEAR_DIRECT_THA_VERSION,
    ok: false,
    status: 'cancelled',
    reason: 'LINEAR_THA_CANCELLED',
    method: 'linear-direct-newmark-average-acceleration',
    integration: 'direct',
    runHash,
    checkpoint,
    rows: [],
    partialPublish: false,
    factorization,
    designBlocked: true,
    designBlockers: ['LINEAR_THA_CANCELLED'],
  };
}

function row(step, dt, groundAcceleration, displacement, velocity, acceleration, mechanicalEnergy, energyError) {
  return { step, time: step * dt, groundAcceleration, displacement: Array.from(displacement), velocity: Array.from(velocity), acceleration: Array.from(acceleration), mechanicalEnergy, energyError };
}

function solveDenseSession(matrix, rhs, session, componentKey) {
  const owned = !session;
  const active = session || createElasticFactorSession();
  const solved = active.solve(matrix, rhs, { groupKey: 'linear-tha-initial-state', componentKey, matrixClass: 'spd' });
  if (owned) active.dispose();
  if (!solved.ok) throw Object.assign(new Error(solved.reason || 'Matrix solve failed.'), { code: solved.reason });
  return solved.x;
}

function energy(M, K, u, v) { return 0.5 * dot(v, matVec(M, v)) + 0.5 * dot(u, matVec(K, u)); }
function vector(values, n) { return Array.from({ length: n }, (_, index) => Number(values[index]) || 0); }
function scale(values, factor) { return values.map((value) => value * factor); }
function add(...vectors) { return vectors[0].map((_, index) => vectors.reduce((sum, values) => sum + (Number(values[index]) || 0), 0)); }
function dot(a, b) { return a.reduce((sum, value, index) => sum + value * (Number(b[index]) || 0), 0); }
function matVec(matrix, values) { return matrix.map((row) => dot(row, values)); }
function addScaled(...args) {
  const matrices = [];
  for (let i = 0; i < args.length; i += 2) matrices.push([args[i], Number(args[i + 1])]);
  return matrices[0][0].map((row, i) => row.map((_, j) => matrices.reduce((sum, [matrix, factor]) => sum + factor * (Number(matrix[i]?.[j]) || 0), 0)));
}
function validateSquare(matrix, n, name) {
  if (!Array.isArray(matrix) || matrix.length !== n || matrix.some((row) => !Array.isArray(row) || row.length !== n)) throw new Error(`${name} matrix must be ${n}x${n}.`);
}

function accelerationUnitFactor(accelerationUnit, displacementUnit) {
  const source = String(accelerationUnit || 'model').trim().toLowerCase().replace(/\^/g, '');
  if (source === 'model' || source.startsWith('model-')) return 1;
  const metres = ({ m: 1, mm: 0.001, cm: 0.01, in: 0.0254, ft: 0.3048 })[String(displacementUnit || 'm').toLowerCase()] || 1;
  if (source === 'g') return 9.80665 / metres;
  if (['m/s2', 'm/s²', 'm/s/s'].includes(source)) return 1 / metres;
  throw new Error(`Unsupported acceleration unit: ${accelerationUnit}`);
}
