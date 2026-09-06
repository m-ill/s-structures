export const PHASE17_M1 = 'P17-M1';

export const OFFICIAL_CASE_IDS = Object.freeze([
  'SB1',
  'SB2',
  'SB3',
  'SB5',
  'SB6',
  'SB7',
  'SB8',
  'SB9',
  'SB10',
  'SB12',
  'PD1',
  'SM5',
  'SM5b',
  'SM6',
  'SR1',
  'SR2',
  'SR2b',
  'P3S2',
  'SP1',
  'SH1',
  'TH1',
]);

export const CUSTOM_CASE_ID = 'P3S2-SS';

export const CASE_LIFECYCLE_STATES = Object.freeze([
  'NOT_STARTED',
  'SOURCE_LOCKED',
  'MODEL_LOCKED',
  'RUNNABLE',
  'EXECUTED',
  'REVIEWED',
  'PASS',
  'FAIL',
  'BLOCKED_SOURCE',
  'BLOCKED_REFERENCE',
  'BLOCKED_ENGINE',
  'BLOCKED_ENGINE_API',
  'BLOCKED_MODEL_EQUIVALENCE',
  'BLOCKED_QUALIFICATION',
  'CROSS_CHECK_ONLY',
]);

export const M1_STATUS = Object.freeze({
  sourceLockedWithBlockers: 'LOCKED_WITH_BLOCKERS',
  notStarted: 'NOT_STARTED',
  notLocked: 'NOT_LOCKED',
  notRun: 'NOT_RUN_M1_FRAMEWORK_ONLY',
});

export const M1_REASON_CODES = Object.freeze({
  frameworkOnly: 'P17_M1_FRAMEWORK_ONLY_NO_BENCHMARK_EXECUTION',
  sourceHasBlockers: 'P17_M0_SOURCE_LOCK_HAS_DECLARED_BLOCKERS',
  customSourceNotLocked: 'P17_CUSTOM_SOURCE_NOT_LOCKED',
  modelNotBuilt: 'P17_MODEL_NOT_BUILT',
  referenceNotLocked: 'P17_REFERENCE_NOT_LOCKED',
  toleranceNotLocked: 'P17_TOLERANCE_NOT_LOCKED',
  probesNotLocked: 'P17_PROBES_NOT_LOCKED',
  solverProfileNotLocked: 'P17_SOLVER_PROFILE_NOT_LOCKED',
  buildNotBound: 'P17_PRODUCT_BUILD_NOT_BOUND',
  noRunArtifacts: 'P17_NO_RUN_ARTIFACTS_IN_M1',
  noCaptureArtifacts: 'P17_NO_UI_CAPTURE_IN_M1',
  noReportArtifacts: 'P17_NO_CASE_REPORT_IN_M1',
  reviewNotStarted: 'P17_CASE_REVIEW_NOT_STARTED',
});

export const PRODUCT_SERVICE_BINDING = Object.freeze({
  serviceVersion: 'p9-m9-product-analysis-service-v1',
  adapterVersion: 'p17-m1-product-adapter-v1',
  publicEntrypoint: 'src/index.js',
});

export const MODEL_EQUIVALENCE_DIMENSIONS = Object.freeze([
  'UNIT_SYSTEM_AND_GLOBAL_AXES',
  'NODE_COORDINATES_AND_CONNECTIVITY',
  'ELEMENT_TYPE_AND_FORMULATION',
  'MATERIAL_AND_SECTION_CONSTANTS',
  'LOCAL_AXES_AND_STRONG_WEAK_ROUTING',
  'SUPPORT_RELEASE_LINK_DIAPHRAGM_CONSTRAINT',
  'LOAD_MAGNITUDE_DIRECTION_DISTRIBUTION_RESULTANT_CENTROID_SELF_WEIGHT',
  'MASS_SOURCE_ROTATIONAL_INERTIA_LUMPED_CONSISTENT',
  'DAMPING_SPECTRUM_INTERPOLATION_MODAL_COMBINATION',
  'MESH_INTEGRATION_STABILIZATION_SHEAR_CORRECTION',
  'PDELTA_STAGE_STEP_CONVERGENCE_HINGE_REGULARIZATION',
  'OUTPUT_PROBE_LOCATION_COMPONENT_UNIT_SIGN',
]);

export const REVIEW_ROLES = Object.freeze([
  'owner',
  'modelReviewer',
  'referenceReviewer',
  'numericalReviewer',
  'releaseReviewer',
]);

export const REQUIRED_CASE_RELATIVE_FILES = Object.freeze([
  'README.md',
  'case-manifest.json',
  'source/source-manifest.json',
  'source/transcription.md',
  'model/canonical-input.json',
  'model/sstructures-input.json',
  'model/model-equivalence.json',
  'model/modeling-notes.md',
  'reference/reference-manifest.json',
  'reference/expected-values.json',
  'reference/tolerance-manifest.json',
  'reference/probe-manifest.json',
  'runner/run.mjs',
  'tests/case-contract.mjs',
  'runs/README.md',
  'figures/README.md',
  'report/README.md',
  'review/checklist.md',
  'review/signoff.json',
]);

export const MANIFEST_SCHEMA_FILES = Object.freeze({
  suiteManifest: 'suite-manifest-schema.json',
  caseManifest: 'case-manifest-schema.json',
  sourceManifest: 'source-manifest-schema.json',
  canonicalInput: 'canonical-input-schema.json',
  sstructuresInput: 'sstructures-input-schema.json',
  modelEquivalence: 'model-equivalence-schema.json',
  referenceManifest: 'reference-manifest-schema.json',
  expectedValues: 'expected-values-schema.json',
  toleranceManifest: 'tolerance-manifest-schema.json',
  probeManifest: 'probe-manifest-schema.json',
  runRecord: 'run-record-schema.json',
  caseEvidence: 'case-evidence-schema.json',
  comparison: 'comparison-schema.json',
  captureIndex: 'capture-index-schema.json',
  reportManifest: 'report-manifest-schema.json',
  reviewSignoff: 'review-signoff-schema.json',
});

export const GENERATED_JSON_MANIFESTS = Object.freeze({
  'case-manifest.json': 'caseManifest',
  'source/source-manifest.json': 'sourceManifest',
  'model/canonical-input.json': 'canonicalInput',
  'model/sstructures-input.json': 'sstructuresInput',
  'model/model-equivalence.json': 'modelEquivalence',
  'reference/reference-manifest.json': 'referenceManifest',
  'reference/expected-values.json': 'expectedValues',
  'reference/tolerance-manifest.json': 'toleranceManifest',
  'reference/probe-manifest.json': 'probeManifest',
  'review/signoff.json': 'reviewSignoff',
});
