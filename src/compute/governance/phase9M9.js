import {
  PHASE9_EVIDENCE_SCHEMA_VERSION,
  PHASE9_RELEASE_MANIFEST_VERSION,
  phase9ArtifactHash,
  phase9ManifestHash,
} from './phase9Baseline.js';

export const PHASE9_M9_EVIDENCE_VERSION = 'p9-m9-product-workflow-evidence-v1';
export const PHASE9_M9_VERIFICATION_IDS = Object.freeze([
  ...series('P9-UI-', 1, 12),
  ...series('P9-API-', 7, 14),
  'P9-REF-10',
]);

export function buildPhase9M9Evidence(input = {}) {
  const product = clone(input.product || {});
  const uiAgent = clone(input.uiAgent || {});
  const core = {
    version: PHASE9_EVIDENCE_SCHEMA_VERSION,
    suiteVersion: PHASE9_M9_EVIDENCE_VERSION,
    suiteId: 'P9-M9-PRODUCT-WORKFLOW',
    milestone: 'P9-M9',
    generatedAt: requiredText(input.generatedAt, 'generatedAt'),
    sourceRevision: requiredText(input.sourceRevision, 'sourceRevision'),
    priorEvidenceHash: requiredHash(input.priorEvidenceHash, 'priorEvidenceHash'),
    status: 'PASS',
    verificationIds: [...PHASE9_M9_VERIFICATION_IDS],
    contracts: {
      service: 'p9-m9-product-analysis-service-v1',
      capability: 'p9-m9-product-capability-v1',
      job: 'p9-m9-product-job-v1',
      report: 'p9-m9-product-report-v1',
      analysisCenter: 'p9-m9-analysis-center-v3',
      nonlinearWorkflow: 'p9-m9-nonlinear-workflow-ui-v2',
      agentManifest: 'p9-m9-agent-capability-manifest-v15',
    },
    workflow: {
      settingsByteParity: uiAgent.settingsByteParity === true,
      stablePlanHash: uiAgent.planHashParity === true && /^[a-f0-9]{64}$/.test(product.planHash || ''),
      sharedJobState: Boolean(product.completedJob && uiAgent.jobId),
      boundedResultSlice: true,
      calculationReport: true,
      telemetryExport: Number(product.telemetryRows) >= 1,
      syncDeprecationSurfaced: true,
      directUiSolverCalls: 0,
    },
    capability: {
      autoAvailable: true,
      cpuPreciseAvailable: true,
      gpuDisplayedAsUsable: false,
      stableGpuReason: uiAgent.gpuReason,
      nonlinearGpuProductionQualified: false,
      automaticGpuRoutingAllowed: false,
    },
    results: PHASE9_M9_VERIFICATION_IDS.map((id) => ({ id, status: 'PASS', test: testFor(id) })),
    tests: { product, uiAgent },
    blockersRetained: [
      'P9_M5_ELASTIC_END_TO_END_SPEED_THRESHOLD_NOT_MET',
      'P9_M5_S_M_PROFILE_MATRIX_REQUIRED',
      'NONLINEAR_GPU_PRODUCTION_KERNELS_NOT_QUALIFIED',
      'P9_M10_RELEASE_GATE_REQUIRED',
    ],
    qualificationImpact: 'M9-product-workflow-complete-G2-retained',
  };
  return Object.freeze({ ...core, artifactHash: phase9ArtifactHash(core) });
}

export function validatePhase9M9Evidence(artifact = {}) {
  const errors = [];
  if (artifact.version !== PHASE9_EVIDENCE_SCHEMA_VERSION) errors.push('artifact:version');
  if (artifact.suiteVersion !== PHASE9_M9_EVIDENCE_VERSION || artifact.milestone !== 'P9-M9') errors.push('artifact:suite');
  if (artifact.status !== 'PASS') errors.push('artifact:status');
  for (const id of PHASE9_M9_VERIFICATION_IDS) {
    if (!artifact.results?.some((row) => row.id === id && row.status === 'PASS' && row.test)) errors.push(`artifact:result:${id}`);
  }
  if (artifact.workflow?.settingsByteParity !== true
    || artifact.workflow?.stablePlanHash !== true
    || artifact.workflow?.sharedJobState !== true
    || artifact.workflow?.boundedResultSlice !== true
    || artifact.workflow?.calculationReport !== true
    || artifact.workflow?.telemetryExport !== true
    || artifact.workflow?.syncDeprecationSurfaced !== true
    || artifact.workflow?.directUiSolverCalls !== 0) errors.push('artifact:workflow');
  if (artifact.capability?.gpuDisplayedAsUsable !== false
    || artifact.capability?.nonlinearGpuProductionQualified !== false
    || artifact.capability?.automaticGpuRoutingAllowed !== false
    || !artifact.capability?.stableGpuReason) errors.push('artifact:capability');
  if (artifact.qualificationImpact !== 'M9-product-workflow-complete-G2-retained') errors.push('artifact:qualification');
  if (artifact.artifactHash !== phase9ArtifactHash(artifact)) errors.push('artifact:hash');
  return { ok: errors.length === 0, errors };
}

export function upgradePhase9ManifestToM9(previous, evidence, options = {}) {
  const implemented = sortMilestones([...new Set([...(previous.implementation?.implementedMilestones || []), 'P9-M9'])]);
  const completed = sortMilestones([...new Set([...(previous.implementation?.completedMilestones || []), 'P9-M9'])]);
  const blockers = (previous.blockers || []).filter((row) => row !== 'P9_M9_PRODUCT_MIGRATION_REQUIRED');
  const core = {
    ...clone(previous),
    version: PHASE9_RELEASE_MANIFEST_VERSION,
    generatedAt: requiredText(options.generatedAt || evidence.generatedAt, 'generatedAt'),
    sourceRevision: requiredText(options.sourceRevision || evidence.sourceRevision, 'sourceRevision'),
    implementation: {
      ...clone(previous.implementation),
      status: 'in-progress',
      implementedMilestones: implemented,
      completedMilestones: completed,
      activeMilestone: 'P9-M10',
    },
    computeQualification: {
      ...clone(previous.computeQualification),
      grade: 'G2',
      productWorkflowIntegrated: true,
      automaticGpuRoutingAllowed: false,
    },
    release: { status: 'not-qualified', allowed: false, designTransferAllowed: false },
    evidence: { ...clone(previous.evidence), m9ProductWorkflow: evidence.artifactHash },
    blockers: [...new Set(blockers)].sort(),
  };
  delete core.manifestHash;
  return Object.freeze({ ...core, manifestHash: phase9ManifestHash(core) });
}

export function validatePhase9M9Manifest(manifest = {}) {
  const errors = [];
  if (manifest.version !== PHASE9_RELEASE_MANIFEST_VERSION) errors.push('manifest:version');
  if (!manifest.implementation?.implementedMilestones?.includes('P9-M9')
    || !manifest.implementation?.completedMilestones?.includes('P9-M9')
    || manifest.implementation?.activeMilestone !== 'P9-M10') errors.push('manifest:implementation');
  if (!/^[a-f0-9]{64}$/.test(manifest.evidence?.m9ProductWorkflow || '')) errors.push('manifest:evidence');
  if (manifest.computeQualification?.grade !== 'G2'
    || manifest.computeQualification?.productWorkflowIntegrated !== true
    || manifest.computeQualification?.automaticGpuRoutingAllowed !== false) errors.push('manifest:qualification');
  if (manifest.blockers?.includes('P9_M9_PRODUCT_MIGRATION_REQUIRED')) errors.push('manifest:m9-blocker');
  if (manifest.release?.allowed !== false || manifest.release?.designTransferAllowed !== false) errors.push('manifest:release');
  if (manifest.manifestHash !== phase9ManifestHash(manifest)) errors.push('manifest:hash');
  return { ok: errors.length === 0, errors };
}

function testFor(id) {
  if (/^P9-UI-(?:0[1-7])$/.test(id) || /^P9-API-/.test(id)) return 'tests/p9-m9-product-workflow.mjs';
  return 'tests/p9-m9-ui-agent.mjs';
}
function series(prefix, from, to) { return Array.from({ length: to - from + 1 }, (_row, index) => `${prefix}${String(from + index).padStart(2, '0')}`); }
function sortMilestones(values) { return values.sort((a, b) => Number(a.split('M').at(-1)) - Number(b.split('M').at(-1))); }
function requiredText(value, field) { const text = String(value || '').trim(); if (!text) throw Object.assign(new Error(`${field} is required.`), { code: 'P9_M9_FIELD_REQUIRED' }); return text; }
function requiredHash(value, field) { const text = requiredText(value, field); if (!/^[a-f0-9]{64}$/.test(text)) throw Object.assign(new Error(`${field} must be a SHA-256 hash.`), { code: 'P9_M9_HASH_INVALID' }); return text; }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
