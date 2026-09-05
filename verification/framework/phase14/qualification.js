import { stableHash } from '../../../src/core/stableHash.js';
import { getPhase14Capability, listImpactedPhase14Capabilities } from './capabilities.js';

export function createPhase14QualificationRecord(capabilityId, input = {}) {
  const capability = getPhase14Capability(capabilityId);
  if (!capability) throw new Error(`Unknown Phase 14 capability: ${capabilityId}`);
  const flags = {
    implemented: input.implemented === true,
    internallyVerified: input.internallyVerified === true,
    independentlyQualified: input.independentlyQualified === true,
    crossSolverCompared: input.crossSolverCompared === true,
    releaseAllowed: input.releaseAllowed === true,
    designTransferAllowed: input.designTransferAllowed === true,
  };
  validateProgression(flags);
  if (flags.crossSolverCompared && !capability.crossSolverEligible) {
    throw new Error(`${capability.id} is not eligible for an identical cross-solver claim.`);
  }
  const hashes = normalizeHashes(input.hashes || {});
  if (flags.implemented && !hashes.buildHash) throw new Error('Implemented capability requires buildHash.');
  if (flags.independentlyQualified && (!hashes.referenceHash || !hashes.toleranceHash || !hashes.resultHash)) {
    throw new Error('Independent qualification requires referenceHash, toleranceHash, and resultHash.');
  }
  const core = {
    version: 'p14-m0-qualification-record-v1',
    capabilityId: capability.id,
    milestone: capability.milestone,
    implementationOwner: capability.owner,
    runtimeOwner: capability.runtimeOwner,
    ...flags,
    state: qualificationState(flags),
    crossSolverStatus: capability.crossSolverEligible
      ? (flags.crossSolverCompared ? 'COMPARED' : 'NOT_RUN')
      : 'NOT_APPLICABLE-CUSTOM-CRITERION',
    hashes,
    limitations: Array.from(new Set(input.limitations || [])).map(String).sort(),
    invalidated: input.invalidated === true,
    invalidationReasons: Array.from(new Set(input.invalidationReasons || [])).map(String).sort(),
  };
  if (core.invalidated) {
    core.releaseAllowed = false;
    core.designTransferAllowed = false;
    core.state = 'invalidated';
  }
  return deepFreeze({ ...core, recordHash: stableHash(core) });
}

export function invalidatePhase14Qualifications(records = [], change = {}) {
  const impacted = new Set(listImpactedPhase14Capabilities(change.areas || []));
  const reason = clean(change.reason) || 'PRODUCTION_INPUT_CHANGED';
  return Array.from(records || []).map((record) => {
    if (!impacted.has(record.capabilityId)) return record;
    return createPhase14QualificationRecord(record.capabilityId, {
      ...record,
      releaseAllowed: false,
      designTransferAllowed: false,
      invalidated: true,
      invalidationReasons: [...(record.invalidationReasons || []), reason],
    });
  });
}

export function auditPhase14QualificationSet(records = []) {
  const byId = new Map();
  const errors = [];
  for (const record of Array.from(records || [])) {
    if (!getPhase14Capability(record?.capabilityId)) errors.push(`unknown:${record?.capabilityId || 'missing'}`);
    else if (byId.has(record.capabilityId)) errors.push(`duplicate:${record.capabilityId}`);
    else byId.set(record.capabilityId, record);
    if (record?.runtimeOwner !== 's-structures-in-house') errors.push(`runtime-owner:${record?.capabilityId || 'missing'}`);
    if (record?.designTransferAllowed && !record?.releaseAllowed) errors.push(`design-transfer:${record.capabilityId}`);
  }
  return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(errors) });
}

function validateProgression(flags) {
  const chain = [
    ['internallyVerified', 'implemented'],
    ['independentlyQualified', 'internallyVerified'],
    ['crossSolverCompared', 'independentlyQualified'],
    ['releaseAllowed', 'independentlyQualified'],
    ['designTransferAllowed', 'releaseAllowed'],
  ];
  for (const [later, earlier] of chain) {
    if (flags[later] && !flags[earlier]) throw new Error(`${later} requires ${earlier}.`);
  }
}

function qualificationState(flags) {
  if (flags.releaseAllowed) return 'release-allowed';
  if (flags.crossSolverCompared) return 'cross-solver-compared';
  if (flags.independentlyQualified) return 'independently-qualified';
  if (flags.internallyVerified) return 'internally-verified';
  if (flags.implemented) return 'implementation-complete';
  return 'planned';
}

function normalizeHashes(value) {
  const result = {};
  for (const field of ['sourceHash', 'buildHash', 'inputHash', 'referenceHash', 'toleranceHash', 'resultHash']) {
    const hash = clean(value[field]);
    if (hash && !/^[0-9a-f]{16,64}$/i.test(hash)) throw new Error(`${field} must be a hexadecimal digest.`);
    result[field] = hash?.toLowerCase() || null;
  }
  return Object.freeze(result);
}

function clean(value) { return value == null ? null : String(value).trim() || null; }

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
