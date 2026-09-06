import { stableHash } from '../../src/core/stableHash.js';
import { PHASE13_RELEASE_INVARIANTS } from '../../src/platform/phase13ReleaseContract.js';

export { PHASE13_RELEASE_INVARIANTS } from '../../src/platform/phase13ReleaseContract.js';

export const PHASE13_BASELINE_VERSION = 'p13-m0-baseline-contract-v1';

export const PHASE13_CAPABILITY_REGISTRY = Object.freeze([
  capability('frame-static', 'core-frame', 'qualified', true, true),
  capability('truss-static', 'core-frame', 'qualified', true, true),
  capability('direct-p-delta', 'core-frame', 'qualified', true, true),
  capability('modal', 'core-frame', 'qualified', true, true),
  capability('response-spectrum', 'core-frame', 'qualified', true, true),
  capability('elastic-buckling', 'core-frame', 'qualified', true, true),
  capability('linear-time-history', 'core-frame', 'candidate', true, false),
  capability('slab-load-panel', 'load-generation', 'candidate', true, false),
  capability('plate-shell-lab', 'experimental-shell', 'experimental', true, false),
]);

export const PHASE13_STATUS_SURFACES = Object.freeze([
  'workspace',
  'viewport',
  'results',
  'report',
  'calculation-package',
  'agent-api',
]);

export function buildPhase13Baseline(options = {}) {
  const core = {
    version: PHASE13_BASELINE_VERSION,
    phase: 'Phase 13',
    milestone: 'P13-M0',
    sourceRevision: options.sourceRevision || null,
    generatedAt: options.generatedAt || null,
    engineOwner: 's-structures-in-house',
    releaseInvariants: { ...PHASE13_RELEASE_INVARIANTS },
    capabilities: PHASE13_CAPABILITY_REGISTRY.map((row) => ({ ...row })),
    statusSurfaces: [...PHASE13_STATUS_SURFACES],
  };
  return deepFreeze({ ...core, artifactHash: stableHash(core).slice(0, 24) });
}

export function validatePhase13Baseline(artifact = {}) {
  const errors = [];
  if (artifact.version !== PHASE13_BASELINE_VERSION) errors.push('baseline:version');
  if (artifact.phase !== 'Phase 13' || artifact.milestone !== 'P13-M0') errors.push('baseline:scope');
  if (artifact.engineOwner !== 's-structures-in-house') errors.push('baseline:engine-owner');
  if (!sameJson(artifact.releaseInvariants, PHASE13_RELEASE_INVARIANTS)) errors.push('baseline:release-invariants');
  if (!sameJson(artifact.capabilities, PHASE13_CAPABILITY_REGISTRY)) errors.push('baseline:capability-registry');
  if (!sameJson(artifact.statusSurfaces, PHASE13_STATUS_SURFACES)) errors.push('baseline:status-surfaces');
  const copy = clone(artifact);
  delete copy.artifactHash;
  if (artifact.artifactHash !== stableHash(copy).slice(0, 24)) errors.push('baseline:artifact-hash');
  return { ok: errors.length === 0, errors };
}

export function auditPhase13RunStateSurfaces(surfaceStates = {}, expected = {}) {
  const expectedState = normalizeState(expected);
  const records = PHASE13_STATUS_SURFACES.map((surface) => {
    const actual = normalizeState(surfaceStates[surface]);
    const mismatches = ['runId', 'modelHash', 'caseHash', 'status', 'stale'].filter(
      (field) => actual[field] !== expectedState[field],
    );
    return Object.freeze({ surface, status: mismatches.length ? 'MISMATCH' : 'PASS', mismatches });
  });
  return Object.freeze({
    ok: records.every((row) => row.status === 'PASS'),
    expected: expectedState,
    records,
  });
}

function capability(id, domain, maturity, executable, designTransferEligible) {
  return Object.freeze({ id, domain, maturity, executable, designTransferEligible });
}

function normalizeState(value = {}) {
  return Object.freeze({
    runId: value?.runId || null,
    modelHash: value?.modelHash || null,
    caseHash: value?.caseHash || null,
    status: value?.status || 'unavailable',
    stale: value?.stale === true,
  });
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
