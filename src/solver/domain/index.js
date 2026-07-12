export {
  CANONICAL_ANALYSIS_DOMAIN_VERSION,
  buildCanonicalAnalysisDomain,
  deriveCanonicalAnalysisDomain,
} from './canonicalDomain.js';
export {
  CANONICAL_CONSTRAINT_VERSION,
  buildConstraintSystem,
  expandConstraintDisplacements,
  reduceConstraintMatrix,
  reduceConstraintVector,
} from './constraintSystem.js';
export {
  CANONICAL_ELEMENT_DESCRIPTOR_VERSION,
  buildElementDescriptors,
} from './elementDescriptor.js';
export {
  DOMAIN_CAPABILITY_SCAN_VERSION,
  scanAnalysisDomainCapabilities,
} from './capabilityScan.js';
export {
  DOMAIN_ADAPTER_COMPATIBILITY_VERSION,
  CANONICAL_DOMAIN_ADAPTERS,
  buildDomainAdapterIdentity,
  compareDomainAdapterIdentities,
} from './compatibility.js';
export {
  SUPPORT_CONSTRAINT_VERSION,
  STRUCTURAL_DOF_KEYS,
  LEGACY_SETTLEMENT_KEYS,
  buildFixedDofs,
  collectPrescribedDofs,
} from './supportConstraints.js';
