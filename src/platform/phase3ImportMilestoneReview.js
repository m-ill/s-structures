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

const EXIT_CRITERIA = {
  'P3-M6': [
    criterion('M6-E1', 'ASCII DXF parser reads headers, layers, blocks, and supported entities.', 'tests/p3-m6-dxf-import.mjs'),
    criterion('M6-E2', 'Wireframe DXF converts to a valid ImportCandidate.', 'tests/p3-m6-dxf-import.mjs'),
    criterion('M6-E3', 'Unit scaling and layer coverage audit are present.', 'tests/p3-m6-dxf-import.mjs'),
    criterion('M6-E4', 'Unsupported entities are reported and listed.', 'tests/p3-m6-dxf-import.mjs'),
    criterion('M6-E5', 'Generated candidate converts to a model and analyzes in follow-up path.', 'tests/p3-m6-dxf-import.mjs'),
  ],
  'P3-M7': [
    criterion('M7-E1', 'DWG converter contract handles configured, missing, and failed states.', 'tests/p3-m7-dwg-plan.mjs'),
    criterion('M7-E2', 'Two floor-plan fixtures assemble into a 3D candidate.', 'tests/p3-m7-dwg-plan.mjs'),
    criterion('M7-E3', 'Import review UI exposes counts, warnings, and accept/reject state.', 'tests/p3-m7-import-review-ui.mjs'),
  ],
  'P3-M8': [
    criterion('M8-E1', 'XYZ, PLY, and PCD fixtures load deterministically.', 'tests/p3-pointcloud-load.mjs'),
    criterion('M8-E2', 'Normalization, downsample, and worker pipeline return audit metadata.', 'tests/p3-pointcloud-load.mjs'),
    criterion('M8-E3', 'Viewer buffer contract is stable for AI and UI inspection.', 'tests/p3-pointcloud-load.mjs'),
  ],
  'P3-M9': [
    criterion('M9-E1', 'Synthetic benchmark passes story and column extraction gates.', 'tests/p3-pointcloud-extraction.mjs'),
    criterion('M9-E2', 'Extracted candidate validates as ImportCandidate.', 'tests/p3-pointcloud-extraction.mjs'),
    criterion('M9-E3', 'Candidate converts to analysis model and elastic analysis runs.', 'tests/p3-pointcloud-e2e.mjs'),
    criterion('M9-E4', 'Real scan validation status remains explicit when no owner scan exists.', 'tests/p3-pointcloud-extraction.mjs'),
  ],
};

export function buildPhase3ImportMilestoneReview() {
  const preliminary = ROWS.filter((item) => item.status !== 'available');
  const rows = ROWS.map((item) => ({
    ...item,
    tickets: [...item.tickets],
    automatedEvidence: [...item.automatedEvidence],
    externalEvidenceRequired: [...item.externalEvidenceRequired],
    finalUseBlockedBy: [...item.finalUseBlockedBy],
    exitCriteria: (EXIT_CRITERIA[item.milestone] || []).map((criteria) => ({ ...criteria })),
    exitCriteriaSummary: summarizeExitCriteria(EXIT_CRITERIA[item.milestone] || []),
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
      exitCriteriaCount: rows.reduce((sum, item) => sum + item.exitCriteria.length, 0),
      exitCriteriaAutomatedCount: rows.reduce((sum, item) => sum + item.exitCriteria.filter((criteria) => criteria.status === 'automated').length, 0),
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

function criterion(id, requirement, evidence) {
  return {
    id,
    requirement,
    evidence,
    status: 'automated',
    source: id.startsWith('M8') || id.startsWith('M9')
      ? 'docs/phase3/IMPORT_POINT_CLOUD_PLAN.md'
      : 'docs/phase3/IMPORT_DXF_DWG_PLAN.md',
  };
}

function summarizeExitCriteria(criteria = []) {
  const automated = criteria.filter((item) => item.status === 'automated').length;
  return {
    total: criteria.length,
    automated,
    reviewRequired: criteria.length - automated,
    status: criteria.length === automated ? 'automated-exit-criteria-covered' : 'exit-criteria-review-required',
  };
}
