import { DOMAIN_ADAPTER_COMPATIBILITY_VERSION } from '../../metadata/numericVersions.js';
export { DOMAIN_ADAPTER_COMPATIBILITY_VERSION };
import { stableHash } from '../../core/stableHash.js';
import { CANONICAL_ANALYSIS_DOMAIN_VERSION } from './canonicalDomain.js';


export const CANONICAL_DOMAIN_ADAPTERS = Object.freeze([
  'linear',
  'direct-pdelta',
  'modal',
  'rsa',
  'nonlinear',
  'pushover',
  'nlth',
]);

export function buildDomainAdapterIdentity(domain, adapter) {
  if (domain?.version !== CANONICAL_ANALYSIS_DOMAIN_VERSION) {
    const error = new TypeError('Canonical analysis domain is required.');
    error.code = 'CANONICAL_DOMAIN_REQUIRED';
    throw error;
  }
  if (!CANONICAL_DOMAIN_ADAPTERS.includes(adapter)) {
    const error = new TypeError(`Unknown canonical domain adapter: ${adapter}`);
    error.code = 'CANONICAL_DOMAIN_ADAPTER_UNKNOWN';
    throw error;
  }
  const identity = {
    version: DOMAIN_ADAPTER_COMPATIBILITY_VERSION,
    adapter,
    domainVersion: domain.version,
    domainHash: domain.identity.domainHash,
    topologyHash: domain.identity.topologyHash,
    propertyHash: domain.identity.propertyHash,
    constraintHash: domain.identity.constraintHash,
    constraintContractHash: domain.identity.constraintContractHash,
    massHash: domain.identity.massHash,
    nonlinearHash: domain.identity.nonlinearHash,
    originMapHash: domain.identity.originMapHash,
    metadataHash: domain.identity.metadataHash,
    unitSystemHash: domain.identity.unitSystemHash,
    nodeIds: [...domain.identity.nodeIds],
    elementIds: [...domain.identity.elementIds],
    descriptorHashes: clone(domain.identity.descriptorHashes),
  };
  return { ...identity, adapterHash: stableHash(identity).slice(0, 24) };
}

export function compareDomainAdapterIdentities(identities = [], options = {}) {
  if (!identities.length) return { ok: false, reason: 'DOMAIN_ADAPTER_IDENTITIES_REQUIRED', differences: [] };
  const reference = identities[0];
  const keys = [
    'topologyHash',
    'propertyHash',
    'constraintHash',
    'constraintContractHash',
    'massHash',
    'nonlinearHash',
    'originMapHash',
    'metadataHash',
    'unitSystemHash',
    'nodeIds',
    'elementIds',
    'descriptorHashes',
  ];
  if (options.exactDomain === true) keys.unshift('domainHash');
  const differences = [];
  for (const item of identities.slice(1)) {
    for (const key of keys) {
      if (stableHash(item[key]) !== stableHash(reference[key])) differences.push({ adapter: item.adapter, key });
    }
  }
  return { version: DOMAIN_ADAPTER_COMPATIBILITY_VERSION, ok: differences.length === 0, differences };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
