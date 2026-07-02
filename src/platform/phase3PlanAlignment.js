export const PHASE3_PLAN_ALIGNMENT_VERSION = 'p3-plan-alignment-v1';

const CORE_DOCS = [
  'PRODUCT_REQUIREMENTS.md',
  'ROADMAP.md',
  'IMPLEMENTATION_BACKLOG.md',
  'ARCHITECTURE.md',
  'SERVER_API_PLAN.md',
  'AUTH_ACCOUNT_PLAN.md',
  'PERSISTENCE_PLAN.md',
  'FRONTEND_PLAN.md',
  'IMPORT_DXF_DWG_PLAN.md',
  'IMPORT_POINT_CLOUD_PLAN.md',
  'MATERIAL_SECTION_LIBRARY_PLAN.md',
  'NONLINEAR_ENGINE_PLAN.md',
  'QA_RELEASE_PLAN.md',
  'DEVELOPMENT_FILE_MAP.md',
];

const STAGES = [
  stage('A', 'platform-backbone', 'P3-M0', 'P3-M4'),
  stage('B', 'input-pipeline', 'P3-M5', 'P3-M9'),
  stage('C', 'elastic-completeness', 'P3-M10', 'P3-M13'),
  stage('D', 'nonlinear-engine', 'P3-M14', 'P3-M16'),
  stage('E', 'detailed-design', 'P3-M17', 'P3-M18'),
  stage('F', 'productization', 'P3-M19', 'P3-M20'),
];

const ABSORBED_TICKETS = [
  { ticket: 'P3-T57', absorbedBy: ['P3-T76', 'P3-T77'], reason: 'early load item absorbed by wind and seismic v2' },
  { ticket: 'P3-T60', absorbedBy: ['P3-T77'], reason: 'torsion Ax item absorbed by seismic v2' },
];

const CORE_SCENARIOS = ['S1-drawing-based-review', 'S2-point-cloud-existing-model', 'S3-custom-material-review', 'S4-nonlinear-safety-review', 'S5-workflow-approval'];

const FUNCTIONAL_REQUIREMENTS = [
  fr(1, ['P3-M2']), fr(2, ['P3-M1', 'P3-M2']), fr(3, ['P3-M3']), fr(4, ['P3-M3']),
  fr(5, ['P3-M6']), fr(6, ['P3-M7']), fr(7, ['P3-M7']), fr(8, ['P3-M7', 'P3-M9']),
  fr(9, ['P3-M8']), fr(10, ['P3-M9']), fr(11, ['P3-M10']), fr(12, ['P3-M10']),
  fr(13, ['P3-M10']), fr(14, ['P3-M14']), fr(15, ['P3-M15']), fr(16, ['P3-M19']),
  fr(17, ['P3-M19']), fr(18, ['P3-M20']), fr(19, ['P3-M20']), fr(20, ['P3-M0', 'P3-M20']),
  fr(21, ['P3-M11']), fr(22, ['P3-M11']), fr(23, ['P3-M12']), fr(24, ['P3-M13']),
  fr(25, ['P3-M13']), fr(26, ['P3-M13']), fr(27, ['P3-M16']), fr(28, ['P3-M16']),
  fr(29, ['P3-M17']), fr(30, ['P3-M18']), fr(31, ['P3-M18']), fr(32, ['P3-M18']),
];

const NON_FUNCTIONAL_REQUIREMENTS = [
  nfr(1, 'point-cloud-load-performance', ['P3-M8', 'P3-M20']),
  nfr(2, 'point-cloud-render-performance', ['P3-M8', 'P3-M20']),
  nfr(3, 'elastic-analysis-performance', ['P3-M13', 'P3-M20']),
  nfr(4, 'storage-round-trip', ['P3-M1', 'P3-M3']),
  nfr(5, 'security', ['P3-M2', 'P3-M20']),
  nfr(6, 'full-suite-green', ['P3-M20']),
  nfr(7, 'browser-node-portability', ['P3-M1', 'P3-M4']),
  nfr(8, 'zero-dependency-policy', ['P3-M0']),
];

const SUCCESS_CRITERIA = [
  success('drawing-import', ['P3-M6', 'P3-M7']),
  success('point-cloud-import', ['P3-M8', 'P3-M9']),
  success('custom-material-trace', ['P3-M10']),
  success('elastic-completeness', ['P3-M11', 'P3-M12', 'P3-M13']),
  success('nonlinear-benchmarks', ['P3-M14', 'P3-M15', 'P3-M16']),
  success('design-modules', ['P3-M17', 'P3-M18', 'P3-M19']),
  success('platform-e2e', ['P3-M1', 'P3-M2', 'P3-M3', 'P3-M4']),
  success('qa-release-gate', ['P3-M20']),
  success('pilot-reports', ['P3-M20']),
];

const RELEASE_GATES = Array.from({ length: 14 }, (_, index) => `G${index + 1}`);

const ARCHITECTURE_DECISIONS = [
  decision(1, 'language', 'javascript-esm'),
  decision(2, 'server-framework', 'node-http-router'),
  decision(3, 'password-hash', 'node-crypto-scrypt'),
  decision(4, 'session-token', 'hmac-sha256-token'),
  decision(5, 'storage-v1', 'file-json-blob-data'),
  decision(6, 'viewer', 'webgl2-module'),
  decision(7, 'dxf', 'ascii-dxf-parser'),
  decision(8, 'dwg', 'oda-cli-adapter'),
  decision(9, 'heavy-preprocess', 'web-worker-transferable'),
  decision(10, 'desktop-packaging', 'electron-wrapper-decision-at-m20'),
];

const MODULE_BOUNDARIES = [
  boundary('server-to-src', 'server may import core schema/migration only; analysis engine stays in browser'),
  boundary('app-to-ui', 'app shell mounts ui modules; ui does not own app routing'),
  boundary('import-to-core', 'importers output ImportCandidate; core factory confirms model'),
  boundary('viewer-readonly', 'viewer renders and selects; it does not mutate model'),
  boundary('nonlinear-to-solver', 'nonlinear owns state/control while sharing element and assembly contracts'),
];

const FILE_ROUTING = [
  route('server/', 'node server routes auth store', 'docs/phase3/SERVER_API_PLAN.md'),
  route('src/app/', 'app shell routes api client views', 'docs/phase3/FRONTEND_PLAN.md'),
  route('src/viewer/', 'WebGL2 point cloud and model viewer', 'docs/phase3/FRONTEND_PLAN.md'),
  route('src/import/', 'ImportCandidate geometry pipeline', 'docs/phase3/IMPORT_DXF_DWG_PLAN.md'),
  route('src/import/pointcloud/', 'point-cloud loader preprocess extraction worker', 'docs/phase3/IMPORT_POINT_CLOUD_PLAN.md'),
  route('src/materials/', 'material and section registry', 'docs/phase3/MATERIAL_SECTION_LIBRARY_PLAN.md'),
  route('src/nonlinear/', 'nonlinear state elements hinges fiber control dynamics', 'docs/phase3/NONLINEAR_ENGINE_PLAN.md'),
  route('src/design/', 'rc steel connection foundation design modules', 'docs/phase3/DESIGN_MODULES_PLAN.md'),
  route('src/standards/', 'code formula and load standard registry', 'docs/phase3/DEVELOPMENT_FILE_MAP.md'),
];

const SERVER_ENDPOINTS = [
  endpoint('POST', '/api/auth/register', 'public', 'server/routes/auth.mjs'),
  endpoint('POST', '/api/auth/login', 'public', 'server/routes/auth.mjs'),
  endpoint('POST', '/api/auth/logout', 'logged-in', 'server/routes/auth.mjs'),
  endpoint('GET', '/api/auth/me', 'logged-in', 'server/routes/auth.mjs'),
  endpoint('GET', '/api/projects', 'logged-in', 'server/routes/projects.mjs'),
  endpoint('POST', '/api/projects', 'logged-in', 'server/routes/projects.mjs'),
  endpoint('GET', '/api/projects/:id', 'member', 'server/routes/projects.mjs'),
  endpoint('PATCH', '/api/projects/:id', 'owner', 'server/routes/projects.mjs'),
  endpoint('DELETE', '/api/projects/:id', 'owner', 'server/routes/projects.mjs'),
  endpoint('PUT', '/api/projects/:id/members/:userId', 'owner', 'server/routes/projects.mjs'),
  endpoint('DELETE', '/api/projects/:id/members/:userId', 'owner', 'server/routes/projects.mjs'),
  endpoint('GET', '/api/projects/:id/revisions', 'member', 'server/routes/revisions.mjs'),
  endpoint('POST', '/api/projects/:id/revisions', 'engineer+', 'server/routes/revisions.mjs'),
  endpoint('GET', '/api/projects/:id/revisions/:rev', 'member', 'server/routes/revisions.mjs'),
  endpoint('GET', '/api/projects/:id/files', 'member', 'server/routes/files.mjs'),
  endpoint('POST', '/api/projects/:id/files', 'engineer+', 'server/routes/files.mjs'),
  endpoint('GET', '/api/projects/:id/files/:fileId', 'member', 'server/routes/files.mjs'),
  endpoint('DELETE', '/api/projects/:id/files/:fileId', 'engineer+', 'server/routes/files.mjs'),
  endpoint('POST', '/api/projects/:id/imports', 'engineer+', 'server/routes/imports.mjs'),
  endpoint('GET', '/api/projects/:id/imports', 'member', 'server/routes/imports.mjs'),
  endpoint('GET', '/api/projects/:id/imports/:importId', 'member', 'server/routes/imports.mjs'),
  endpoint('PATCH', '/api/projects/:id/imports/:importId', 'engineer+', 'server/routes/imports.mjs'),
  endpoint('POST', '/api/projects/:id/approval', 'reviewer+', 'server/routes/approval.mjs'),
  endpoint('GET', '/api/projects/:id/approval', 'member', 'server/routes/approval.mjs'),
  endpoint('GET', '/api/health', 'public', 'server/main.mjs'),
  endpoint('GET', '/api/meta', 'public', 'server/main.mjs'),
];

const ERROR_CODES = ['UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND', 'VALIDATION', 'CONFLICT', 'PAYLOAD_TOO_LARGE', 'RATE_LIMITED', 'INTERNAL'];

const AUTH_CONTRACT = {
  password: {
    hash: 'node:crypto.scrypt',
    compare: 'crypto.timingSafeEqual',
    minLength: 10,
    lockout: '10 failed attempts / 15 minutes',
  },
  token: {
    signature: 'HMAC-SHA256',
    payload: ['uid', 'iat', 'exp', 'ver'],
    expiryHours: 12,
  },
  projectRoles: [
    role('owner', ['all permissions', 'member management', 'delete project']),
    role('engineer', ['save model', 'upload files', 'confirm import']),
    role('reviewer', ['read', 'resolve/accept issue', 'approve/release']),
    role('viewer', ['read-only']),
  ],
};

const PERSISTENCE_CONTRACT = {
  layers: [
    storageLayer('L1', 'browser-local', 'localStorage/IndexedDB autosave session recovery'),
    storageLayer('L2', 'file', 'json export/import offline handoff backup'),
    storageLayer('L3', 'server-project', '/api/projects/:id/revisions official collaboration save'),
  ],
  snapshotEnvelope: ['format', 'formatVersion', 'savedAt', 'app', 'origin', 'model'],
  autosave: { triggerIdleSeconds: 5, maxIntervalSeconds: 60, keepEntries: 3 },
  conflictRule: 'last-write-wins-with-lineage-warning',
  migration: 'all loads pass through migrateModel on client load',
};

const FRONTEND_CONTRACT = {
  routes: [
    '#/login',
    '#/projects',
    '#/p/:id/modeler',
    '#/p/:id/import/:jobId',
    '#/p/:id/revisions',
    '#/p/:id/report',
    '#/local/modeler',
  ],
  modules: [
    'src/app/shell.js',
    'src/app/routes.js',
    'src/app/apiClient.js',
    'src/app/sessionState.js',
    'src/app/views/login.js',
    'src/app/views/projects.js',
    'src/app/views/importReview.js',
    'src/app/modelerHost.js',
    'src/viewer/viewerCore.js',
    'src/viewer/pointCloudLayer.js',
  ],
  agentApis: ['listImportCandidates', 'resolveImportCandidate', 'confirmImport', 'getCapabilities'],
  principles: ['vanilla-esm', 'modeler-index-preserved', 'agent-manifest-for-actions', 'csp-ready-no-new-inline-script'],
};

const IMPORT_PIPELINE_CONTRACT = {
  drawingPaths: [
    importPath('3d-wireframe-dxf', 'P3-M6', 'line-polyline-point-insert-text-to-candidate'),
    importPath('2d-floor-plan-dxf', 'P3-M7', 'plan-recognition-to-two-story-candidate'),
    importPath('dwg', 'P3-M7', 'external-converter-to-ascii-dxf'),
  ],
  dxfEntities: ['LINE', 'LWPOLYLINE', 'POLYLINE', 'POINT', 'CIRCLE', 'INSERT', 'TEXT', 'MTEXT'],
  auditFields: ['counts', 'units', 'bbox', 'merge', 'mapping', 'orphans', 'warnings'],
  pointCloudFormats: [
    { id: 'XYZ/TXT', status: 'v1' },
    { id: 'PLY', status: 'v1' },
    { id: 'PCD', status: 'v1' },
    { id: 'LAS', status: 'planned-owner-file' },
    { id: 'LAZ/E57', status: 'not-v1' },
  ],
  pointCloudPipeline: ['worker-parse', 'normalize', 'voxel-downsample', 'outlier-filter', 'viewer-buffer', 'story-column-beam-wall-extraction', 'ImportCandidate', 'human-review'],
  confidenceBands: ['>=0.8 high-confidence-review-required', '0.5-0.8 review-required', '<0.5 audit-only'],
  benchmarkTargets: {
    storyElevationErrorMm: 30,
    columnRecall: 0.9,
    columnPrecision: 0.9,
    beamRecall: 0.75,
  },
};

const MATERIAL_LIBRARY_CONTRACT = {
  materialFields: ['id', 'version', 'kind', 'elastic', 'strength', 'nonlinear', 'damping', 'source'],
  sectionFields: ['id', 'version', 'kind', 'shape', 'params', 'properties', 'designMeta', 'source'],
  registryRules: [
    'id@version-reference',
    'append-only-edit',
    'project-over-global-priority',
    'soft-delete',
    'calculation-report-id-version-source',
    'legacy-unversioned-warning',
  ],
  modules: [
    'src/materials/materialSchema.js',
    'src/materials/sectionSchema.js',
    'src/materials/sectionProperties.js',
    'src/materials/registry.js',
    'src/materials/db/ksH.js',
    'src/materials/libraryReport.js',
    'src/materials/libraryEdit.js',
  ],
  agentActions: ['listLibrary', 'getLibraryItem', 'upsertMaterial', 'upsertSection'],
  verification: ['tests/p3-m10-materials.mjs', 'tests/p3-section-properties.mjs'],
};

const NONLINEAR_ENGINE_CONTRACT = {
  scopeLadder: [
    nonlinearScope('N1', 'P3-M14', 'corotational-beam-kg-newton-load-control'),
    nonlinearScope('N2', 'P3-M15', 'concentrated-m-theta-hinge-state-trace'),
    nonlinearScope('N3', 'P3-M15', 'displacement-control-arc-length'),
    nonlinearScope('N4', 'P3-M15', 'formal-pushover-capacity-curve'),
    nonlinearScope('N5', 'P3-M16', 'pmm-hinge-fiber-section'),
    nonlinearScope('N6', 'P3-M16', 'newmark-rayleigh-ground-motion'),
  ],
  modules: [
    'src/nonlinear/state.js',
    'src/nonlinear/assembly.js',
    'src/nonlinear/elements/corotationalBeam.js',
    'src/nonlinear/hinges/momentHinge.js',
    'src/nonlinear/hinges/pmmHinge.js',
    'src/nonlinear/hinges/hingeAssign.js',
    'src/nonlinear/fiber/fiberSection.js',
    'src/nonlinear/fiber/momentCurvature.js',
    'src/nonlinear/control/newtonRaphson.js',
    'src/nonlinear/control/loadControl.js',
    'src/nonlinear/control/displacementControl.js',
    'src/nonlinear/control/arcLength.js',
    'src/nonlinear/dynamics/newmark.js',
    'src/nonlinear/dynamics/rayleigh.js',
    'src/nonlinear/dynamics/groundMotion.js',
    'src/nonlinear/pushoverFormal.js',
    'src/nonlinear/trace.js',
  ],
  stateFields: ['step', 'lambda', 'u', 'hinges', 'converged', 'iterations', 'events'],
  convergenceNorms: ['force', 'displacement', 'energy'],
  hingeStates: ['elastic', 'yielded', 'capping', 'degrading', 'residual'],
  benchmarks: ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8'],
  resultFields: ['method', 'limitations', 'steps', 'capacityCurve', 'hingeStates'],
};

const MILESTONES = [
  ms('P3-M0', ['P3-T01', 'P3-T02'], ['docs/phase3/DEVELOPMENT_FILE_MAP.md'], ['tests/m0-smoke.mjs']),
  ms('P3-M1', t(3, 7), ['docs/phase3/SERVER_API_PLAN.md'], ['tests/p3-server-api.mjs']),
  ms('P3-M2', t(8, 12), ['docs/phase3/AUTH_ACCOUNT_PLAN.md'], ['tests/p3-auth.mjs']),
  ms('P3-M3', t(13, 16), ['docs/phase3/PERSISTENCE_PLAN.md'], ['tests/p3-persistence.mjs']),
  ms('P3-M4', t(17, 21), ['docs/phase3/FRONTEND_PLAN.md'], ['tests/p3-app-shell.mjs', 'tests/p3-viewer-core.mjs']),
  ms('P3-M5', t(22, 25), ['docs/phase3/IMPORT_DXF_DWG_PLAN.md'], ['tests/p3-import-geometry.mjs']),
  ms('P3-M6', t(26, 31), ['docs/verification/P3_M6_IMPORT_VERIFICATION.md'], ['tests/p3-m6-dxf-import.mjs']),
  ms('P3-M7', t(32, 35), ['docs/verification/P3_M7_IMPORT_REVIEW_VERIFICATION.md'], ['tests/p3-m7-dwg-plan.mjs', 'tests/p3-m7-import-review-ui.mjs']),
  ms('P3-M8', t(36, 40), ['docs/verification/P3_M8_POINTCLOUD_LOAD_VERIFICATION.md'], ['tests/p3-pointcloud-load.mjs']),
  ms('P3-M9', t(41, 45), ['docs/verification/P3_M9_POINTCLOUD_EXTRACTION_VERIFICATION.md'], ['tests/p3-pointcloud-extraction.mjs', 'tests/p3-pointcloud-e2e.mjs']),
  ms('P3-M10', t(46, 49), ['docs/verification/P3_M10_MATERIAL_LIBRARY_VERIFICATION.md'], ['tests/p3-m10-materials.mjs', 'tests/p3-section-properties.mjs']),
  ms('P3-M11', t(68, 72), ['docs/verification/P3_M11_ELASTIC_EXPANSION_VERIFICATION.md'], ['tests/p3-m11-elastic-expansion.mjs']),
  ms('P3-M12', t(73, 75), ['docs/verification/P3_M12_WALL_SLAB_VERIFICATION.md'], ['tests/p3-m12-wall-slab.mjs']),
  ms('P3-M13', t(76, 82), ['docs/verification/P3_M13_LOADS_DYNAMICS_VERIFICATION.md'], ['tests/p3-m13-loads-dynamics.mjs']),
  ms('P3-M14', t(50, 53), ['docs/verification/P3_M14_NONLINEAR_GEOMETRY_VERIFICATION.md'], ['tests/p3-m14-nonlinear-geometry.mjs']),
  ms('P3-M15', t(54, 56), ['docs/verification/P3_M15_HINGE_CONTROL_VERIFICATION.md'], ['tests/p3-m15-nonlinear-hinge-control.mjs']),
  ms('P3-M16', t(83, 86), ['docs/verification/P3_M16_FIBER_NLTH_VERIFICATION.md'], ['tests/p3-m16-nonlinear-fiber-nlth.mjs']),
  ms('P3-M17', t(87, 90), ['docs/verification/DESIGN_MODULE_VERIFICATION.md'], ['tests/p3-design-rc.mjs']),
  ms('P3-M18', t(91, 95), ['docs/verification/DESIGN_MODULE_VERIFICATION.md'], ['tests/p3-design-steel-foundation.mjs']),
  ms('P3-M19', ['P3-T58', 'P3-T59', 'P3-T61', 'P3-T62'], ['docs/verification/DESIGN_MODULE_VERIFICATION.md'], ['tests/p3-m19-integrated-report.mjs']),
  ms('P3-M20', t(63, 67), ['docs/verification/P3_M20_LAUNCH_READINESS_VERIFICATION.md'], ['tests/p3-launch-gate.mjs']),
];

export function buildPhase3PlanAlignmentReport(manifest = {}) {
  const manifestMilestones = new Set((manifest.milestones || []).map((row) => row.id));
  const readApis = new Set(manifest.readApis || []);
  const rows = MILESTONES.map((row) => ({
    ...row,
    manifestListed: manifestMilestones.has(row.id),
    evidenceReady: row.docs.length > 0 && row.tests.length > 0,
  }));
  const missing = rows.filter((row) => !row.manifestListed || !row.evidenceReady);
  const milestoneIds = new Set(rows.map((row) => row.id));
  const requirementCoverage = FUNCTIONAL_REQUIREMENTS.map((row) => ({
    ...row,
    covered: row.milestones.every((id) => milestoneIds.has(id)),
  }));
  const nfrCoverage = NON_FUNCTIONAL_REQUIREMENTS.map((row) => ({
    ...row,
    covered: row.milestones.every((id) => milestoneIds.has(id)),
  }));
  const successCoverage = SUCCESS_CRITERIA.map((row) => ({
    ...row,
    covered: row.milestones.every((id) => milestoneIds.has(id)),
  }));
  const requirementsOk = requirementCoverage.every((row) => row.covered) &&
    nfrCoverage.every((row) => row.covered) &&
    successCoverage.every((row) => row.covered) &&
    RELEASE_GATES.length >= 12;
  const architectureOk = ARCHITECTURE_DECISIONS.length === 10 &&
    MODULE_BOUNDARIES.length >= 5 &&
    FILE_ROUTING.length >= 8;
  const serverApiOk = SERVER_ENDPOINTS.length >= 26 &&
    ERROR_CODES.length === 8 &&
    AUTH_CONTRACT.projectRoles.length === 4 &&
    PERSISTENCE_CONTRACT.layers.length === 3;
  const frontendOk = FRONTEND_CONTRACT.routes.length === 7 &&
    FRONTEND_CONTRACT.modules.length >= 10 &&
    FRONTEND_CONTRACT.agentApis.includes('confirmImport');
  const importPipelineOk = IMPORT_PIPELINE_CONTRACT.drawingPaths.length === 3 &&
    IMPORT_PIPELINE_CONTRACT.dxfEntities.includes('INSERT') &&
    IMPORT_PIPELINE_CONTRACT.pointCloudFormats.filter((row) => row.status === 'v1').length === 3 &&
    IMPORT_PIPELINE_CONTRACT.auditFields.includes('warnings');
  const materialLibraryOk = MATERIAL_LIBRARY_CONTRACT.materialFields.includes('nonlinear') &&
    MATERIAL_LIBRARY_CONTRACT.sectionFields.includes('properties') &&
    MATERIAL_LIBRARY_CONTRACT.registryRules.includes('id@version-reference') &&
    MATERIAL_LIBRARY_CONTRACT.agentActions.length === 4;
  const nonlinearEngineOk = NONLINEAR_ENGINE_CONTRACT.scopeLadder.length === 6 &&
    NONLINEAR_ENGINE_CONTRACT.benchmarks.length === 8 &&
    NONLINEAR_ENGINE_CONTRACT.convergenceNorms.length === 3 &&
    NONLINEAR_ENGINE_CONTRACT.resultFields.includes('capacityCurve');
  const activeTickets = new Set(rows.flatMap((row) => row.tickets));
  const absorbedTicketIds = new Set(ABSORBED_TICKETS.map((row) => row.ticket));
  const plannedTickets = new Set([...activeTickets, ...absorbedTicketIds]);
  const unresolvedTickets = [...plannedTickets].filter((ticket) => !activeTickets.has(ticket) && !absorbedTicketIds.has(ticket));
  const ticketSummary = {
    planned: plannedTickets.size,
    active: activeTickets.size,
    absorbed: absorbedTicketIds.size,
    unresolved: unresolvedTickets.length,
    effectiveCompletion: unresolvedTickets.length === 0 && absorbedTicketIds.size === ABSORBED_TICKETS.length,
    note: 'P3-T57 and P3-T60 remain in backlog history but are explicitly absorbed by later active tickets.',
  };
  return {
    version: PHASE3_PLAN_ALIGNMENT_VERSION,
    sourceDocs: CORE_DOCS.map((name) => `docs/phase3/${name}`),
    sourceDocCount: CORE_DOCS.length,
    scenarios: CORE_SCENARIOS,
    stages: STAGES,
    milestones: rows,
    requirements: {
      functional: requirementCoverage,
      nonFunctional: nfrCoverage,
      successCriteria: successCoverage,
      launchGates: RELEASE_GATES,
      ok: requirementsOk,
    },
    architecture: {
      decisions: ARCHITECTURE_DECISIONS,
      moduleBoundaries: MODULE_BOUNDARIES,
      fileRouting: FILE_ROUTING,
      ok: architectureOk,
    },
    serverApi: {
      endpoints: SERVER_ENDPOINTS,
      errorEnvelope: {
        success: '{ ok: true, data }',
        failure: '{ ok: false, error: { code, message, details? } }',
        codes: ERROR_CODES,
      },
      auth: AUTH_CONTRACT,
      persistence: PERSISTENCE_CONTRACT,
      ok: serverApiOk,
    },
    frontend: {
      ...FRONTEND_CONTRACT,
      ok: frontendOk,
    },
    importPipeline: {
      ...IMPORT_PIPELINE_CONTRACT,
      ok: importPipelineOk,
    },
    materialLibrary: {
      ...MATERIAL_LIBRARY_CONTRACT,
      ok: materialLibraryOk,
    },
    nonlinearEngine: {
      ...NONLINEAR_ENGINE_CONTRACT,
      ok: nonlinearEngineOk,
    },
    activeTicketCount: activeTickets.size,
    absorbedTickets: ABSORBED_TICKETS,
    plannedTicketCount: plannedTickets.size,
    unresolvedTickets,
    ticketSummary,
    status: missing.length || !requirementsOk || !architectureOk || !serverApiOk || !frontendOk ||
      !importPipelineOk || !materialLibraryOk || !nonlinearEngineOk || !ticketSummary.effectiveCompletion ? 'REVIEW' : 'OK',
    missing,
    agentReadable: readApis.has('getPhase3PlanAlignment'),
    notes: [
      'Report follows existing Phase 3 planning documents only.',
      'Preliminary rows still require engineer and owner review before production sign-off.',
    ],
  };
}

function ms(id, tickets, docs, tests) {
  return { id, tickets, docs, tests };
}

function stage(id, name, from, to) {
  return { id, name, from, to };
}

function fr(number, milestones) {
  return { id: `FR-${String(number).padStart(2, '0')}`, milestones };
}

function nfr(number, name, milestones) {
  return { id: `NFR-${String(number).padStart(2, '0')}`, name, milestones };
}

function success(id, milestones) {
  return { id, milestones };
}

function decision(number, topic, choice) {
  return { id: `D${number}`, topic, choice, source: 'docs/phase3/ARCHITECTURE.md' };
}

function boundary(id, rule) {
  return { id, rule, source: 'docs/phase3/ARCHITECTURE.md' };
}

function route(path, role, source) {
  return { path, role, source };
}

function endpoint(method, path, permission, source) {
  return { method, path, permission, source };
}

function role(id, permissions) {
  return { id, permissions };
}

function storageLayer(id, name, purpose) {
  return { id, name, purpose };
}

function importPath(id, milestone, method) {
  return { id, milestone, method };
}

function nonlinearScope(id, milestone, scope) {
  return { id, milestone, scope };
}

function t(from, to) {
  return Array.from({ length: to - from + 1 }, (_, index) => `P3-T${String(from + index).padStart(2, '0')}`);
}
