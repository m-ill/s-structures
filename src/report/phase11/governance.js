import { stableHash } from '../../core/stableHash.js';

export const P11_M0_EVIDENCE_VERSION = 'p11-m0-baseline-governance-v1';
export const P11_RELEASE_MANIFEST_VERSION = 'p11-release-manifest-v1';

export const P11_REQUIRED_LOCALES = Object.freeze(['ko-KR', 'en-US']);

export const P11_CAPTURE_KINDS = Object.freeze([
  'model-isometric',
  'model-plan-elevation',
  'load-gravity',
  'load-lateral',
  'deformed-governing',
  'reactions-governing',
  'utilization-governing',
]);

export const P11_VERDICT_REASON_CODES = Object.freeze([
  'ANALYSIS_FAILED',
  'AUDIT_FAILED',
  'STALE_SNAPSHOT',
  'REQUIRED_EVIDENCE_MISSING',
  'INDEPENDENT_REFERENCE_NOT_AVAILABLE',
  'ENGINEERING_VALIDATION_INCOMPLETE',
  'ISSUE_SCOPE_LIMITED',
  'FEATURE_NOT_IN_SCOPE',
  'FEATURE_NOT_VERIFIED',
  'OPERATIONAL_CHECKS_PASSED',
]);

export const P11_GAP_ASSIGNMENTS = Object.freeze([
  ['GAP-01', 'report-i18n', ['P11-M1', 'P11-M2'], 'blocks bilingual release'],
  ['GAP-02', 'report-contracts', ['P11-M1'], 'blocks numeric parity proof'],
  ['GAP-03', 'report-verdict-layout', ['P11-M1', 'P11-M5'], 'blocks executive conclusion'],
  ['GAP-04', 'report-verdict', ['P11-M1'], 'blocks truthful qualification'],
  ['GAP-05', 'visual-evidence', ['P11-M3', 'P11-M4'], 'blocks contextual evidence'],
  ['GAP-06', 'visual-capture', ['P11-M3'], 'blocks deterministic capture'],
  ['GAP-07', 'export-service', ['P11-M6'], 'blocks atomic PDF pair'],
  ['GAP-08', 'desktop-export', ['P11-M6', 'P11-M7'], 'blocks product one-click export'],
  ['GAP-09', 'export-service', ['P11-M6'], 'blocks production runtime ownership'],
  ['GAP-10', 'report-i18n-qa', ['P11-M2', 'P11-M8'], 'blocks Korean PDF qualification'],
  ['GAP-11', 'export-security', ['P11-M6', 'P11-M8'], 'blocks privacy qualification'],
  ['GAP-12', 'visual-qa', ['P11-M3', 'P11-M8'], 'blocks visual qualification'],
  ['GAP-13', 'product-export-workflow', ['P11-M7'], 'blocks UI/API parity'],
  ['GAP-14', 'release-governance', ['P11-M0', 'P11-M9'], 'blocks evidence retention'],
].map(([id, owner, milestones, releaseImpact]) => Object.freeze({
  id,
  owner,
  milestones: Object.freeze(milestones),
  releaseImpact,
})));

export const P11_ARTIFACT_CLASSES = Object.freeze({
  trackedEvidence: Object.freeze({
    path: 'reports/validation-evidence/phase11/',
    git: 'tracked',
    retention: 'repository history',
  }),
  rawRun: Object.freeze({
    path: 'reports/phase11/<project>/<run>/',
    git: 'untracked-by-default',
    retention: '30 days in CI; release assets for qualified runs',
  }),
  deliverable: Object.freeze({
    path: 'output/pdf/phase11/',
    git: 'untracked-by-default',
    retention: 'release asset for qualified runs',
  }),
  temporary: Object.freeze({
    path: 'tmp/pdfs/phase11/<job>/',
    git: 'untracked',
    retention: 'delete at terminal job state',
  }),
});

export function buildP11M0Evidence(input) {
  const evidence = {
    schemaVersion: P11_M0_EVIDENCE_VERSION,
    milestone: 'P11-M0',
    status: 'PASS',
    qualification: 'baseline-governance-only',
    releaseQualified: false,
    generatedAt: input.generatedAt,
    sourceRevision: input.sourceRevision,
    environment: input.environment,
    baseline: input.baseline,
    registries: {
      locales: [...P11_REQUIRED_LOCALES],
      captureKinds: [...P11_CAPTURE_KINDS],
      verdictReasonCodes: [...P11_VERDICT_REASON_CODES],
    },
    gapAssignments: P11_GAP_ASSIGNMENTS.map((row) => ({
      ...row,
      milestones: [...row.milestones],
    })),
    artifactPolicy: P11_ARTIFACT_CLASSES,
    decisions: input.decisions,
    verification: input.verification,
    limitations: [
      'The office baseline is a program smoke check, not an independent engineering reference.',
      'The current report is English-first and contains no contextual visual evidence.',
      'Phase 11 bilingual rendering, capture and atomic PDF export remain unimplemented after M0.',
    ],
  };
  return { ...evidence, artifactHash: stableHash(evidence) };
}

export function validateP11M0Evidence(value) {
  const errors = [];
  if (value?.schemaVersion !== P11_M0_EVIDENCE_VERSION) errors.push('schemaVersion');
  if (value?.milestone !== 'P11-M0') errors.push('milestone');
  if (value?.status !== 'PASS') errors.push('status');
  if (value?.releaseQualified !== false) errors.push('releaseQualified');
  if (!value?.generatedAt || !value?.sourceRevision) errors.push('provenance');
  if (value?.baseline?.projectId !== 'PILOT-OFFICE-01') errors.push('baseline.projectId');
  if (value?.baseline?.model?.nodes !== 45 || value?.baseline?.model?.members !== 84) errors.push('baseline.model');
  if (value?.baseline?.pdf?.pageCount !== 22 || value?.baseline?.pdf?.a4 !== true) errors.push('baseline.pdf');
  if (value?.gapAssignments?.length !== 14) errors.push('gapAssignments');
  if (value?.registries?.locales?.length !== 2) errors.push('registries.locales');
  if (value?.registries?.captureKinds?.length !== 7) errors.push('registries.captureKinds');
  if (value?.verification?.length !== 7 || value.verification.some((row) => row.status !== 'PASS')) {
    errors.push('verification');
  }
  const { artifactHash, ...hashable } = value || {};
  if (!artifactHash || stableHash(hashable) !== artifactHash) errors.push('artifactHash');
  return { ok: errors.length === 0, errors };
}

export function buildP11ReleaseManifestSkeleton({ generatedAt, sourceRevision, m0EvidenceHash }) {
  const manifest = {
    schemaVersion: P11_RELEASE_MANIFEST_VERSION,
    status: 'blocked',
    releaseQualified: false,
    generatedAt,
    sourceRevision,
    requiredLocales: [...P11_REQUIRED_LOCALES],
    requiredMilestones: Array.from({ length: 10 }, (_item, index) => `P11-M${index}`),
    completedMilestones: ['P11-M0'],
    evidence: { 'P11-M0': m0EvidenceHash },
    artifactPairs: [],
    blockers: [
      'P11_M1_TO_M9_NOT_QUALIFIED',
      'BILINGUAL_PDF_PAIR_NOT_AVAILABLE',
      'DETERMINISTIC_VISUAL_EVIDENCE_NOT_AVAILABLE',
      'INDEPENDENT_ENGINEERING_REFERENCE_NOT_AVAILABLE',
    ],
    phase10EligibilityPreserved: true,
  };
  return { ...manifest, manifestHash: stableHash(manifest) };
}

export function validateP11ReleaseManifest(value) {
  const errors = [];
  if (value?.schemaVersion !== P11_RELEASE_MANIFEST_VERSION) errors.push('schemaVersion');
  if (value?.status !== 'blocked' || value?.releaseQualified !== false) errors.push('truthfulStatus');
  if (value?.requiredMilestones?.length !== 10) errors.push('requiredMilestones');
  if (value?.completedMilestones?.length !== 1 || value.completedMilestones[0] !== 'P11-M0') {
    errors.push('completedMilestones');
  }
  if (!value?.evidence?.['P11-M0']) errors.push('evidence');
  if (!value?.blockers?.length) errors.push('blockers');
  if (value?.phase10EligibilityPreserved !== true) errors.push('phase10EligibilityPreserved');
  const { manifestHash, ...hashable } = value || {};
  if (!manifestHash || stableHash(hashable) !== manifestHash) errors.push('manifestHash');
  return { ok: errors.length === 0, errors };
}
