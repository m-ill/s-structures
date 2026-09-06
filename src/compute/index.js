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
export * from './nonlinear/index.js';
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
  PRODUCTION_ELASTIC_ADAPTER_VERSION,
  PRODUCTION_ELASTIC_BACKEND_ID,
  PRODUCTION_ELASTIC_HYBRID_BACKEND_ID,
  PRODUCTION_ELASTIC_OPERATION,
  createProductionElasticComputeBackend,
  createProductionElasticExecutor,
  describeProductionElasticAdapter,
  elasticPhysicalParityHash,
  executeProductionElastic,
  isProductionElasticBackendId,
} from './adapters/elasticProductionAdapter.js';
export {
  PRODUCTION_EIGEN_ADAPTER_VERSION,
  PRODUCTION_EIGEN_BACKEND_ID,
  PRODUCTION_EIGEN_OPERATIONS,
  createProductionEigenComputeBackend,
  createProductionEigenExecutor,
  describeProductionEigenAdapter,
  executeProductionEigen,
  isProductionEigenBackendId,
} from './adapters/eigenProductionAdapter.js';
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
export { COMPUTE_ANALYSIS_WORKER_VERSION, attachComputeAnalysisWorker, createComputeAnalysisExecutor } from './runtime/analysisWorker.js';
export { RESOURCE_LEDGER_VERSION, createResourceLedger } from './telemetry/resourceLedger.js';
export { COMPUTE_TELEMETRY_VERSION, createComputeTelemetry } from './telemetry/telemetry.js';
export {
  COMMON_SPARSE_MATRIX_VERSION,
  combineCscMatrices,
  createCscFromTriplets,
  cscDiagonal,
  cscMatVec,
  cscQuadratic,
  cscRowNorms,
  cscSymmetryError,
  cscToCsr,
  cscToDense,
  csrToCsc,
  denseToCsc,
  denseToTriplets,
  extractCscSubmatrix,
  sparsePatternHash,
  sparseStats,
  sparseValueHash,
  tripletsToCsc,
  validateCommonSparseMatrix,
} from './sparse/matrix.js';
export {
  DETERMINISTIC_SPARSE_ASSEMBLY_VERSION,
  MUTABLE_SPARSE_ACCUMULATOR_VERSION,
  SPARSE_ASSEMBLY_BASIS,
  addMutableSparseValue,
  assembleSparseBlocks,
  createDeterministicSparseAssembler,
  createMutableSparseAccumulator,
  extractDeterministicCscSubmatrix,
  finalizeMutableSparseAccumulator,
} from './sparse/assembly.js';
export { SPARSE_SYMBOLIC_VERSION, symbolicFactor } from './sparse/symbolic.js';
export { SPARSE_LDLT_VERSION, factorLdlt, solveLdlt } from './sparse/ldlt.js';
export { SPARSE_LU_VERSION, factorSparseLu, solveSparseLu } from './sparse/lu.js';
export { SPARSE_ICCG_VERSION, factorIncompleteCholesky, solveIccg } from './sparse/iccg.js';
export { SPARSE_FACTOR_RUNTIME_VERSION, createSparseFactorRuntime } from './sparse/factorRuntime.js';
export { CPU_SPARSE_BACKEND_ID, createCpuSparseBackend, resolveCpuWasmSparseBackend } from './backends/cpuSparseBackend.js';
export {
  SYMMETRIC_SPARSE_OPERATOR_VERSION,
  createSymmetricSparseOperator,
  createSymmetricSparseOperatorFromDense,
  sparseOperatorMatvecParity,
} from './eigen/sparseOperator.js';
export {
  SMALL_DENSE_REFERENCE_LIMIT,
  SMALL_SYMMETRIC_EIGEN_VERSION,
  modalAssuranceCriterion,
  solveSmallSymmetricEigen,
} from './eigen/smallSymmetric.js';
export { REQUESTED_MODE_EIGEN_VERSION, solveRequestedGeneralizedEigen } from './eigen/requestedModes.js';
export {
  WASM_SPARSE_BACKEND_ID,
  WASM_SPARSE_DIAGNOSTICS_VERSION,
  createWasmSparseBackend,
} from './backends/wasmCpuBackend.js';
export * from './backends/webgpu/index.js';
export * from './hybrid/index.js';
export { ELASTIC_FACTOR_GROUP_VERSION, classifyElasticFactorGroups, elasticFactorKeyForCombo } from './elastic/factorGroups.js';
export { ELASTIC_FACTOR_SESSION_VERSION, createElasticFactorSession } from './elastic/factorSession.js';
export {
  SPD_SOLVE_POLICY_VERSION,
  computeSpdTrueResidual,
  createSpdSolvePolicy,
  equilibrateSpdSystem,
} from './elastic/spdSolvePolicy.js';
export {
  HYBRID_ELASTIC_SESSION_VERSION,
  createHybridElasticSession,
  solveElasticCombinationHybrid,
} from './elastic/hybridElasticSession.js';
export {
  HYBRID_PDELTA_TANGENT_VERSION,
  createHybridPDeltaTangentSolver,
} from './elastic/hybridPDelta.js';
export { ELASTIC_ANALYSIS_SERVICE_VERSION, createElasticAnalysisService } from './product/elasticAnalysisService.js';
export { EIGEN_ANALYSIS_SERVICE_VERSION, createEigenAnalysisService } from './product/eigenAnalysisService.js';
export { ANALYSIS_CASE_ENGINE_VERSION, executeAnalysisCase, executeAnalysisCaseAsync, hasAnalysisCaseEngine } from './product/analysisCaseEngine.js';
export {
  PRODUCT_ANALYSIS_SERVICE_VERSION,
  PRODUCT_ANALYSIS_CAPABILITY_VERSION,
  PRODUCT_ANALYSIS_JOB_VERSION,
  PRODUCT_ANALYSIS_REPORT_VERSION,
  PRODUCT_COMPUTE_TARGETS,
  createAnalysisProductService,
} from './product/analysisProductService.js';
export {
  SYNC_ANALYSIS_COMPATIBILITY_POLICY,
  SYNC_ANALYSIS_COMPATIBILITY_VERSION,
  SYNC_ANALYSIS_DEPRECATION_INVENTORY,
  analyzeModelSyncCompatibility,
  listSyncAnalysisDeprecations,
} from './compatibility/syncFacade.js';
