export const PHASE3_IMPORT_MILESTONE_REVIEW_VERSION = 'p3-import-milestone-review-v1';

const ROWS = [
  row('P3-M6', ['P3-T26', 'P3-T27', 'P3-T28', 'P3-T29', 'P3-T30', 'P3-T31'], 'available', [
    'tests/p3-m6-dxf-import.mjs',
  ], [
    'real-world DXF variants',
    'candidate-to-viewer usability review',
  ]),
  row('P3-M7', ['P3-T32', 'P3-T33', 'P3-T34', 'P3-T35'], 'preliminary', [
    'tests/p3-m7-dwg-plan.mjs',
    'tests/p3-m7-import-review-ui.mjs',
  ], [
    'configured external DWG converter run',
    'office floor-plan fixture recall report',
  ]),
  row('P3-M8', ['P3-T36', 'P3-T37', 'P3-T38', 'P3-T39', 'P3-T40'], 'preliminary', [
    'tests/p3-pointcloud-load.mjs',
  ], [
    'large-file performance evidence',
    'binary LAS/PCD owner fixtures',
  ]),
  row('P3-M9', ['P3-T41', 'P3-T42', 'P3-T43', 'P3-T44', 'P3-T45'], 'preliminary', [
    'tests/p3-pointcloud-extraction.mjs',
    'tests/p3-pointcloud-e2e.mjs',
  ], [
    'real scan beam/wall validation',
    'field confidence threshold review',
  ]),
];

export function buildPhase3ImportMilestoneReview() {
  const preliminary = ROWS.filter((item) => item.status !== 'available');
  const rows = ROWS.map((item) => ({
    ...item,
    tickets: [...item.tickets],
    automatedEvidence: [...item.automatedEvidence],
    externalEvidenceRequired: [...item.externalEvidenceRequired],
    finalUseBlockedBy: [...item.finalUseBlockedBy],
  }));
  return {
    version: PHASE3_IMPORT_MILESTONE_REVIEW_VERSION,
    scope: 'P3-M6 to P3-M9 input pipeline',
    sourceDocs: [
      'docs/phase3/P3_M6_M9_REBUILD_ORDER.md',
      'docs/phase3/IMPORT_DXF_DWG_PLAN.md',
      'docs/phase3/IMPORT_POINT_CLOUD_PLAN.md',
    ],
    rows,
    summary: {
      milestoneCount: ROWS.length,
      automatedEvidenceCount: ROWS.reduce((sum, item) => sum + item.automatedEvidence.length, 0),
      preliminaryCount: preliminary.length,
      productionReady: preliminary.length === 0,
      agentDecision: preliminary.length ? 'import-pipeline-review-required' : 'import-pipeline-ready',
    },
    agentUse: {
      readApi: 'getPhase3ImportMilestoneReview',
      importApis: ['listImportCandidates', 'resolveImportCandidate', 'confirmImport'],
      rule: 'Use automated evidence for regression confidence, but keep field-file validation explicit.',
    },
  };
}

function row(milestone, tickets, status, automatedEvidence, externalEvidenceRequired) {
  return {
    milestone,
    tickets,
    status,
    automatedEvidence,
    externalEvidenceRequired,
    finalUseBlockedBy: status === 'available' ? [] : externalEvidenceRequired,
  };
}
