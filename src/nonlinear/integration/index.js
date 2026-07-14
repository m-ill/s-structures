export {
  NONLINEAR_INTEGRATION_CAPABILITY_VERSION,
  NONLINEAR_INTEGRATION_MODES,
  evaluateNonlinearIntegrationCapabilities,
  requireNonlinearIntegrationCapabilities,
} from './capabilityMatrix.js';
export {
  NONLINEAR_SUPPORT_SPRING_VERSION,
  SUPPORT_DISPLACEMENT_COMPONENTS,
  SUPPORT_STIFFNESS_COMPONENTS,
  buildNonlinearSupportSprings,
  evaluateNonlinearSupportSprings,
} from './supportSprings.js';
export {
  NONLINEAR_INTEGRATION_GOVERNANCE_VERSION,
  auditCanonicalAnalysisAdapterIdentities,
  auditNonlinearResultFreshness,
  buildNonlinearDesignTransferGuard,
  buildNonlinearResultDependencies,
} from './governance.js';
export {
  NONLINEAR_INTEGRATED_RESULT_VERSION,
  NONLINEAR_RESULT_ADAPTER_VERSION,
  NONLINEAR_RESULT_DIMENSIONS,
  recoverIntegratedNonlinearState,
  recoverNonlinearHistoryEnvelope,
} from './resultRecovery.js';
