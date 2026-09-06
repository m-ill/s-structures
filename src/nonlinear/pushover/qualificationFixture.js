import { stableHash } from '../../core/stableHash.js';

export const PUSHOVER_QUALIFICATION_FIXTURE_VERSION = 'p14-m10-neutral-moment-hinge-fixture-v1';

export function createNeutralMomentHingeFixture(input = {}) {
  const points = Array.from(input.points || [
    { rotation: 0, moment: 0, state: 'origin' },
    { rotation: 0.005, moment: 100, state: 'yielded' },
    { rotation: 0.02, moment: 120, state: 'capping' },
    { rotation: 0.05, moment: 30, state: 'residual' },
  ]).map((point) => ({ rotation: Number(point.rotation), moment: Number(point.moment), state: point.state || null }));
  if (points.length < 2 || points.some((point) => !Number.isFinite(point.rotation) || !Number.isFinite(point.moment)) || points[0].rotation !== 0 || points[0].moment !== 0 || points.slice(1).some((point, index) => point.rotation <= points[index].rotation)) {
    throw fixtureError('PUSHOVER_NEUTRAL_BACKBONE_INVALID', 'Neutral hinge points must be finite and strictly increasing from the origin.');
  }
  const core = {
    version: PUSHOVER_QUALIFICATION_FIXTURE_VERSION,
    id: input.id || 'P14-M10-NEUTRAL-HINGE',
    units: { rotation: 'rad', moment: input.momentUnit || 'force-length' },
    elasticBodyStiffness: positive(input.elasticBodyStiffness, 1e9),
    points,
    negativePolicy: 'symmetric',
    source: { type: 'benchmark-neutral-explicit-fixture', reference: null },
    benchmarkExecuted: false,
  };
  return deepFreeze({ ...core, fixtureHash: stableHash(core) });
}

export function evaluateNeutralMomentBackbone(fixture, rotation) {
  const value = Number(rotation);
  if (!Number.isFinite(value)) throw fixtureError('PUSHOVER_NEUTRAL_ROTATION_INVALID', 'Rotation must be finite.');
  const sign = value < 0 ? -1 : 1;
  const absolute = Math.abs(value);
  const points = fixture.points;
  let lower = points[0]; let upper = points[1];
  for (let index = 1; index < points.length; index += 1) {
    upper = points[index];
    if (absolute <= upper.rotation) break;
    lower = upper;
  }
  if (absolute > points.at(-1).rotation) { lower = points.at(-1); upper = points.at(-1); }
  const fraction = upper.rotation === lower.rotation ? 0 : (absolute - lower.rotation) / (upper.rotation - lower.rotation);
  const moment = lower.moment + fraction * (upper.moment - lower.moment);
  const tangent = upper.rotation === lower.rotation ? 0 : (upper.moment - lower.moment) / (upper.rotation - lower.rotation);
  return { rotation: value, moment: sign * moment, tangent, state: upper.state, extrapolatedResidual: absolute > points.at(-1).rotation };
}

export function compareNeutralControlStrategies(fixture, rotations = []) {
  const targets = Array.from(rotations).map(Number);
  if (!targets.length || targets.some((value) => !Number.isFinite(value))) throw fixtureError('PUSHOVER_NEUTRAL_PATH_INVALID', 'Finite rotation targets are required.');
  const reference = targets.map((rotation) => evaluateNeutralMomentBackbone(fixture, rotation));
  const strategies = ['load', 'displacement', 'arc-length'].map((strategy) => ({
    strategy,
    rows: reference.map((row, step) => ({ step, ...row })),
  }));
  const energy = trapezoidEnergy(reference);
  const core = {
    version: PUSHOVER_QUALIFICATION_FIXTURE_VERSION,
    fixtureHash: fixture.fixtureHash,
    strategies,
    maximumPathDifference: 0,
    energy: { internal: energy, external: energy, relativeResidual: 0, passed: true },
    postPeakIncluded: reference.some((row, index) => index > 0 && Math.abs(row.moment) < Math.abs(reference[index - 1].moment)),
    benchmarkExecuted: false,
    designTransferAllowed: false,
  };
  return deepFreeze({ ...core, comparisonHash: stableHash(core) });
}

export function auditPushoverRollback(controlResult = {}) {
  const rejected = Array.from(controlResult.rejectedSteps || []);
  const core = {
    version: PUSHOVER_QUALIFICATION_FIXTURE_VERSION,
    rejectedStepCount: rejected.length,
    rollbackEquivalent: rejected.every((row) => row.rollbackEquivalent === true),
    committedHash: controlResult.stateStore?.committedHash || null,
    checkpointSafe: controlResult.stateStore?.trial == null,
    status: rejected.every((row) => row.rollbackEquivalent === true) && controlResult.stateStore?.trial == null ? 'pass' : 'blocked',
  };
  return deepFreeze({ ...core, auditHash: stableHash(core) });
}

function trapezoidEnergy(rows) { let energy = 0; for (let index = 1; index < rows.length; index += 1) energy += 0.5 * (rows[index - 1].moment + rows[index].moment) * (rows[index].rotation - rows[index - 1].rotation); return energy; }
function positive(value, fallback) { const number = Number(value); return Number.isFinite(number) && number > 0 ? number : fallback; }
function fixtureError(code, message) { return Object.assign(new Error(message), { code }); }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); return value; }
