import { buildCanonicalAnalysisDomain, deriveCanonicalAnalysisDomain } from '../domain/canonicalDomain.js';
import { buildDomainAdapterIdentity } from '../domain/compatibility.js';

export const PDELTA_ANALYSIS_DOMAIN_VERSION = 'p8-m1-expanded-analysis-domain-adapter-v2';

export function buildExpandedAnalysisDomain(model = {}, factors = null, options = {}) {
  const adapter = options.domainAdapter
    || (options.pDeltaMethod === 'direct' || options.includeGeometricStiffness === true ? 'direct-pdelta' : 'linear');
  const domainOptions = {
    analysisCase: options.analysisCase || null,
    factors,
    scale: options.scale,
    extraLoads: options.extraLoads,
    activeMemberIds: options.activeMemberIds,
    strictCapabilities: options.strictCapabilities === true,
    capabilityOptions: options.capabilityOptions,
    allowInvalidReferences: options.allowInvalidReferences === true
      || (adapter === 'linear' && model.analysisSettings?.validateBeforeSolve === false),
  };
  const canonical = options.canonicalBase && !options.activeMemberIds
    ? deriveCanonicalAnalysisDomain(options.canonicalBase, domainOptions)
    : buildCanonicalAnalysisDomain(model, domainOptions);
  return {
    ...canonical,
    version: PDELTA_ANALYSIS_DOMAIN_VERSION,
    canonicalVersion: canonical.version,
    adapterIdentity: buildDomainAdapterIdentity(canonical, adapter),
  };
}
