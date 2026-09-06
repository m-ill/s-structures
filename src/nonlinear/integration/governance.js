import { buildAnalysisDomainHashes } from '../../core/analysisDomainHashes.js';
import { stableHash } from '../../core/stableHash.js';
import {
  CANONICAL_DOMAIN_ADAPTERS,
  buildDomainAdapterIdentity,
  compareDomainAdapterIdentities,
} from '../../solver/domain/compatibility.js';

export const NONLINEAR_INTEGRATION_GOVERNANCE_VERSION = 'p8-m9-integration-governance-v1';

export function buildNonlinearResultDependencies(input = {}) {
  const domain = input.domain;
  if (!domain?.identity || !domain?.constraint?.ok) {
    const error = new TypeError('Canonical domain is required to bind a nonlinear result.');
    error.code = 'NONLINEAR_RESULT_DOMAIN_REQUIRED';
    throw error;
  }
  const model = input.model || domain.solverModel || {};
  const analysisCase = input.analysisCase || domain.analysisCase || null;
  const sourceHashes = buildAnalysisDomainHashes(model, analysisCase);
  const core = {
    version: NONLINEAR_INTEGRATION_GOVERNANCE_VERSION,
    sourceModelHash: stableHash(model),
    caseId: analysisCase?.id || null,
    caseHash: stableHash(analysisCase).slice(0, 24),
    sourceHashes,
    canonical: {
      domainHash: domain.identity.domainHash,
      identityHash: domain.identity.identityHash,
      topologyHash: domain.identity.topologyHash,
      propertyHash: domain.identity.propertyHash,
      constraintHash: domain.identity.constraintHash,
      loadHash: domain.identity.loadHash,
      massHash: domain.identity.massHash,
      nonlinearHash: domain.identity.nonlinearHash,
      outputHash: domain.identity.outputHash,
      originMapHash: domain.identity.originMapHash,
      metadataHash: domain.identity.metadataHash,
      unitSystemHash: domain.identity.unitSystemHash,
      constraintContractHash: domain.identity.constraintContractHash,
    },
    nodeIds: [...domain.identity.nodeIds],
    elementIds: [...domain.identity.elementIds],
    resultDimensions: clone(input.resultDimensions || null),
    massSourceId: input.massDomain?.sourceSnapshot?.sourceId || null,
    massSourceHash: input.massDomain?.sourceSnapshot?.sourceHash || null,
    loadSetHash: input.loadSetHash || null,
    step: input.step ?? null,
    time: input.time ?? null,
  };
  return deepFreeze({ ...core, dependencyHash: stableHash(core).slice(0, 24) });
}

export function auditNonlinearResultFreshness(result = {}, current = {}, analysisCase = null) {
  const expected = result.dependencies || result.integration?.dependencies || result.provenance?.dependencies;
  if (!expected) return freshnessFailure('NONLINEAR_RESULT_DEPENDENCIES_MISSING');
  const domain = current?.constraint ? current : current.domain;
  const model = current?.constraint ? null : current.model || (current.domain ? null : isModelContext(current) ? current : null);
  const caseInput = analysisCase || current.analysisCase || domain?.analysisCase || null;
  if (!domain?.identity && !model) {
    return freshnessFailure('NONLINEAR_RESULT_CURRENT_CONTEXT_REQUIRED');
  }
  const massDomain = current?.constraint ? null : current.massDomain || null;
  const loadSetHash = current?.constraint ? null : current.loadSetHash ?? null;
  if ((expected.massSourceId || expected.massSourceHash) && !massDomain?.sourceSnapshot) {
    return freshnessFailure('NONLINEAR_RESULT_MASS_CONTEXT_REQUIRED');
  }
  if (expected.loadSetHash != null && loadSetHash == null) {
    return freshnessFailure('NONLINEAR_RESULT_LOAD_SET_CONTEXT_REQUIRED');
  }
  const sourceHashes = model ? buildAnalysisDomainHashes(model, caseInput) : null;
  const actual = {
    sourceModelHash: model ? stableHash(model) : null,
    caseHash: stableHash(caseInput).slice(0, 24),
    sourceHashes,
    canonical: domain?.identity ? {
      domainHash: domain.identity.domainHash,
      identityHash: domain.identity.identityHash,
      topologyHash: domain.identity.topologyHash,
      propertyHash: domain.identity.propertyHash,
      constraintHash: domain.identity.constraintHash,
      loadHash: domain.identity.loadHash,
      massHash: domain.identity.massHash,
      nonlinearHash: domain.identity.nonlinearHash,
      outputHash: domain.identity.outputHash,
      originMapHash: domain.identity.originMapHash,
      metadataHash: domain.identity.metadataHash,
      unitSystemHash: domain.identity.unitSystemHash,
      constraintContractHash: domain.identity.constraintContractHash,
    } : null,
  };
  const changes = [];
  if (model) compare(changes, 'model', 'sourceModelHash', expected.sourceModelHash, actual.sourceModelHash);
  compare(changes, 'case', 'caseHash', expected.caseHash, actual.caseHash);
  if (sourceHashes) {
    for (const key of HASH_KEYS) compare(changes, categoryFor(key), `sourceHashes.${key}`, expected.sourceHashes?.[key], sourceHashes[key]);
  }
  if (domain?.identity) {
    for (const key of CANONICAL_KEYS) compare(changes, categoryFor(key), `canonical.${key}`, expected.canonical?.[key], actual.canonical[key]);
  }
  if (expected.massSourceId || expected.massSourceHash) {
    compare(changes, 'mass', 'massSourceId', expected.massSourceId, massDomain.sourceSnapshot.sourceId || null);
    compare(changes, 'mass', 'massSourceHash', expected.massSourceHash, massDomain.sourceSnapshot.sourceHash || null);
  }
  if (expected.loadSetHash != null) compare(changes, 'load', 'loadSetHash', expected.loadSetHash, loadSetHash);
  const core = {
    version: NONLINEAR_INTEGRATION_GOVERNANCE_VERSION,
    ok: changes.length === 0,
    stale: changes.length > 0,
    reason: changes.length ? 'NONLINEAR_RESULT_STALE' : null,
    changes: changes.sort((a, b) => `${a.category}:${a.key}`.localeCompare(`${b.category}:${b.key}`)),
    expectedDependencyHash: expected.dependencyHash || null,
  };
  return deepFreeze({ ...core, auditHash: stableHash(core).slice(0, 24) });
}

export function buildNonlinearDesignTransferGuard(result = {}, current = {}, analysisCase = null) {
  const freshness = auditNonlinearResultFreshness(result, current, analysisCase);
  const blockers = [];
  if (result.ok !== true) blockers.push('NONLINEAR_RESULT_NOT_SUCCESSFUL');
  if (!freshness.ok) blockers.push(freshness.reason);
  if (result.designBlocked === true) blockers.push(result.designBlockReason || 'NONLINEAR_RESULT_DESIGN_BLOCKED');
  if (!['verified', 'production'].includes(result.qualification)) blockers.push('NONLINEAR_RESULT_NOT_QUALIFIED');
  const dimensions = result.dimensions || result.integration?.dimensions;
  if (!dimensions?.displacement || !dimensions?.force || !dimensions?.moment) blockers.push('NONLINEAR_RESULT_DIMENSIONS_MISSING');
  const core = {
    version: NONLINEAR_INTEGRATION_GOVERNANCE_VERSION,
    allowed: blockers.length === 0,
    reason: blockers[0] || null,
    blockers: [...new Set(blockers)],
    freshness,
    resultHash: result.resultHash || result.integrationHash || null,
  };
  return deepFreeze({ ...core, guardHash: stableHash(core).slice(0, 24) });
}

export function auditCanonicalAnalysisAdapterIdentities(domain, adapters = CANONICAL_DOMAIN_ADAPTERS) {
  const identities = adapters.map((adapter) => buildDomainAdapterIdentity(domain, adapter));
  const comparison = compareDomainAdapterIdentities(identities);
  const core = {
    version: NONLINEAR_INTEGRATION_GOVERNANCE_VERSION,
    ok: comparison.ok,
    adapters: [...adapters],
    identities,
    differences: comparison.differences,
  };
  return deepFreeze({ ...core, auditHash: stableHash(core).slice(0, 24) });
}

function freshnessFailure(reason) {
  return deepFreeze({
    version: NONLINEAR_INTEGRATION_GOVERNANCE_VERSION,
    ok: false,
    stale: true,
    reason,
    changes: [],
    expectedDependencyHash: null,
  });
}

function compare(changes, category, key, expected, actual) {
  if (expected == null || actual == null) return;
  if (stableHash(expected) !== stableHash(actual)) changes.push({ category, key, expected, actual });
}

function categoryFor(key) {
  if (key.includes('topology')) return 'topology';
  if (key.includes('property')) return 'property';
  if (key.includes('constraint')) return 'constraint';
  if (key.includes('load')) return 'load';
  if (key.includes('mass')) return 'mass';
  if (key.includes('nonlinear')) return 'nonlinear';
  if (key.includes('output')) return 'output';
  if (key.includes('origin')) return 'origin';
  if (key.includes('metadata')) return 'metadata';
  if (key.includes('unit')) return 'units';
  if (key.includes('domain') || key.includes('identity')) return 'domain';
  return 'model';
}

function clone(value) {
  if (value == null) return value;
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function isModelContext(value) {
  if (!value || typeof value !== 'object') return false;
  return value.schemaVersion != null
    || Array.isArray(value.nodes)
    || Array.isArray(value.members)
    || Array.isArray(value.materials)
    || Array.isArray(value.sections);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}

const HASH_KEYS = Object.freeze([
  'domainHash',
  'topologyHash',
  'propertyHash',
  'constraintHash',
  'loadHash',
  'massHash',
  'nonlinearHash',
  'outputHash',
]);
const CANONICAL_KEYS = Object.freeze([
  'domainHash',
  'identityHash',
  'topologyHash',
  'propertyHash',
  'constraintHash',
  'loadHash',
  'massHash',
  'nonlinearHash',
  'outputHash',
  'originMapHash',
  'metadataHash',
  'unitSystemHash',
  'constraintContractHash',
]);
