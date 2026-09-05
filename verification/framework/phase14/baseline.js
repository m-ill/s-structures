import { stableHash } from '../../../src/core/stableHash.js';
import { PHASE14_CAPABILITIES, PHASE14_CAPABILITY_IMPACT_MAP } from './capabilities.js';
import { auditPhase14QualificationSet, createPhase14QualificationRecord } from './qualification.js';

export const PHASE14_BASELINE_VERSION = 'p14-m0-governance-baseline-v1';

export const PHASE14_RELEASE_INVARIANTS = Object.freeze({
  runtimeSolverOwner: 's-structures-in-house',
  openSeesRuntimeUsed: false,
  externalSolverRuntimeDependency: false,
  benchmarkExpectedInProduction: false,
  benchmarkExecutionStarted: false,
  finalDesignTransferAllowed: false,
});

export function buildPhase14Baseline(input = {}) {
  const qualifications = PHASE14_CAPABILITIES.map((capability) => createPhase14QualificationRecord(capability.id));
  const core = {
    version: PHASE14_BASELINE_VERSION,
    phase: 'Phase 14',
    milestone: 'P14-M0',
    createdAt: clean(input.createdAt),
    sourceRevision: sourceRevision(input.sourceRevision),
    dirtySummary: normalizeDirtySummary(input.dirtySummary),
    phase13BaselineVersion: clean(input.phase13BaselineVersion),
    releaseInvariants: { ...PHASE14_RELEASE_INVARIANTS },
    capabilityRegistry: PHASE14_CAPABILITIES.map((row) => ({ ...row, referenceLevels: [...row.referenceLevels] })),
    capabilityImpactMap: Object.fromEntries(Object.entries(PHASE14_CAPABILITY_IMPACT_MAP).map(([key, ids]) => [key, [...ids]])),
    qualifications,
  };
  return deepFreeze({ ...core, baselineHash: stableHash(core) });
}

export function validatePhase14Baseline(artifact = {}) {
  const errors = [];
  if (artifact.version !== PHASE14_BASELINE_VERSION) errors.push('baseline:version');
  if (artifact.phase !== 'Phase 14' || artifact.milestone !== 'P14-M0') errors.push('baseline:scope');
  if (!/^[0-9a-f]{40}$/i.test(artifact.sourceRevision || '')) errors.push('baseline:source-revision');
  if (stableHash(artifact.releaseInvariants || {}) !== stableHash(PHASE14_RELEASE_INVARIANTS)) errors.push('baseline:release-invariants');
  if (stableHash(artifact.capabilityRegistry || []) !== stableHash(PHASE14_CAPABILITIES)) errors.push('baseline:capability-registry');
  if (stableHash(artifact.capabilityImpactMap || {}) !== stableHash(PHASE14_CAPABILITY_IMPACT_MAP)) errors.push('baseline:impact-map');
  const audit = auditPhase14QualificationSet(artifact.qualifications || []);
  if (!audit.ok || artifact.qualifications?.length !== PHASE14_CAPABILITIES.length) errors.push('baseline:qualifications');
  if ((artifact.qualifications || []).some((record) => record.state !== 'planned')) errors.push('baseline:initial-state');
  const copy = clone(artifact);
  delete copy.baselineHash;
  if (artifact.baselineHash !== stableHash(copy)) errors.push('baseline:hash');
  return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(errors) });
}

function normalizeDirtySummary(value = {}) {
  const result = {};
  for (const field of ['modified', 'added', 'deleted', 'renamed', 'untracked']) {
    const count = Number(value[field] || 0);
    result[field] = Number.isInteger(count) && count >= 0 ? count : 0;
  }
  return result;
}

function sourceRevision(value) {
  const result = clean(value);
  if (!/^[0-9a-f]{40}$/i.test(result || '')) throw new Error('sourceRevision must be a 40-character commit hash.');
  return result.toLowerCase();
}

function clean(value) { return value == null ? null : String(value).trim() || null; }
function clone(value) { return JSON.parse(JSON.stringify(value)); }

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
