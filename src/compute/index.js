export {
  DOMAIN_BINARY_ENDIANNESS,
  DOMAIN_BINARY_VERSION,
  domainBinaryTransferables,
  packDomainBinary,
  unpackDomainBinary,
  validateDomainBinary,
} from './contracts/domainBinary.js';
export { SPARSE_PATTERN_VERSION, createSparsePattern, createSparsePatternFromDomain, validateSparsePattern } from './contracts/sparsePattern.js';
export { STATE_ARENA_VERSION, createStateArena } from './contracts/stateArena.js';
export { RESULT_CHUNK_VERSION, createResultChunk, validateResultChunk } from './contracts/resultChunk.js';
export {
  COMPUTE_BACKEND_CONTRACT_VERSION,
  COMPUTE_BACKEND_TARGETS,
  COMPUTE_OPERATION_CAPABILITIES,
  adaptLegacyComputeBackend,
  assertComputeBackendPolicy,
  computeBackendSupportsMatrixClass,
  createComputeSession,
  describeComputeBackend,
  normalizeComputeTarget,
  preflightComputeBackend,
} from './backends/contract.js';
export { ANALYSIS_EXECUTION_PLAN_VERSION, createAnalysisExecutionPlan, executionSettingsBytes, validateAnalysisExecutionPlan } from './execution/executionPlan.js';
export {
  ANALYSIS_ADAPTER_VERSION,
  ANALYSIS_OPERATION_KINDS,
  analysisResultParityHash,
  createCurrentAnalysisComputeBackend,
  createCurrentAnalysisExecutor,
  describeCurrentAnalysisAdapter,
  executeCurrentAnalysis,
  prepareAnalysisContracts,
} from './adapters/analysisAdapters.js';
export {
  COMPUTE_WORKER_PROTOCOL_VERSION,
  COMPUTE_JOB_EVENT_TYPES,
  COMPUTE_JOB_REQUEST_TYPES,
  COMPUTE_JOB_TERMINAL_TYPES,
  createComputeCancelRequest,
  createComputeDisposeRequest,
  createComputeStartRequest,
  validateComputeJobRequest,
} from './runtime/protocol.js';
export { COMPUTE_WORKER_CORE_VERSION, ComputeCancellationError, createComputeWorkerCore } from './runtime/workerCore.js';
export { COMPUTE_WORKER_CLIENT_VERSION, ComputeJobCancelledError, ComputeJobError, ComputeWorkerClient, createComputeWorkerClient } from './runtime/workerClient.js';
export { RESOURCE_LEDGER_VERSION, createResourceLedger } from './telemetry/resourceLedger.js';
export { COMPUTE_TELEMETRY_VERSION, createComputeTelemetry } from './telemetry/telemetry.js';
export {
  SYNC_ANALYSIS_COMPATIBILITY_POLICY,
  SYNC_ANALYSIS_COMPATIBILITY_VERSION,
  SYNC_ANALYSIS_DEPRECATION_INVENTORY,
  analyzeModelSyncCompatibility,
  listSyncAnalysisDeprecations,
} from './compatibility/syncFacade.js';
