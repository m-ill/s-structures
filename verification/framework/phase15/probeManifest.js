import {
  cloneStrictJson,
  immutable,
  optionalText,
  requiredHash,
  requiredText,
  strictCanonicalHash,
} from './strictCanonical.js';

export const PHASE15_PROBE_MANIFEST_VERSION = 'p15-probe-manifest-v1';
export const PHASE15_RECOVERY_POLICIES = Object.freeze([
  'raw',
  'extrapolated',
  'averaged',
  'joint',
  'section-end',
  'element-end-action',
  'global-extreme',
]);

export function createPhase15ProbeManifest(input = {}) {
  const probes = Array.from(input.probes || [], normalizeProbe).sort((left, right) => left.id.localeCompare(right.id));
  if (!probes.length) throw new Error('Probe manifest requires at least one probe.');
  if (new Set(probes.map((row) => row.id)).size !== probes.length) throw new Error('Probe manifest contains duplicate probe ids.');
  const core = {
    version: PHASE15_PROBE_MANIFEST_VERSION,
    caseId: requiredText(input.caseId, 'caseId').toUpperCase(),
    specVersion: requiredText(input.specVersion, 'specVersion'),
    referenceHash: requiredHash(input.referenceHash, 'referenceHash'),
    probes,
    frozenBeforeRun: input.frozenBeforeRun === true,
    approvedBy: optionalText(input.approvedBy),
    approvalHash: input.approvalHash == null ? null : requiredHash(input.approvalHash, 'approvalHash'),
  };
  return immutable({ ...core, probeHash: strictCanonicalHash(core, 'probe manifest') });
}

export function isApprovedPhase15ProbeManifest(manifest = {}) {
  try {
    const rebuilt = createPhase15ProbeManifest(manifest);
    return manifest.version === PHASE15_PROBE_MANIFEST_VERSION
      && manifest.frozenBeforeRun === true
      && Boolean(manifest.approvedBy)
      && /^[0-9a-f]{64}$/i.test(manifest.approvalHash || '')
      && strictCanonicalHash(manifest, 'probe manifest') === strictCanonicalHash(rebuilt, 'rebuilt probe manifest');
  } catch {
    return false;
  }
}

function normalizeProbe(probe, index) {
  if (!probe || typeof probe !== 'object' || Array.isArray(probe)) throw new TypeError(`probes[${index}] must be an object.`);
  const recoveryPolicy = requiredText(probe.recoveryPolicy, `probes[${index}].recoveryPolicy`);
  if (!PHASE15_RECOVERY_POLICIES.includes(recoveryPolicy)) {
    throw new Error(`probes[${index}].recoveryPolicy must be one of ${PHASE15_RECOVERY_POLICIES.join(', ')}.`);
  }
  const location = cloneStrictJson(probe.location, `probes[${index}].location`);
  if (location == null || (typeof location === 'object' && !Object.keys(location).length)) {
    throw new Error(`probes[${index}].location is required.`);
  }
  return {
    id: requiredText(probe.id, `probes[${index}].id`),
    resultKind: requiredText(probe.resultKind, `probes[${index}].resultKind`),
    location,
    axis: requiredText(probe.axis, `probes[${index}].axis`),
    signConvention: requiredText(probe.signConvention, `probes[${index}].signConvention`),
    unit: requiredText(probe.unit, `probes[${index}].unit`),
    recoveryPolicy,
    component: optionalText(probe.component),
  };
}
