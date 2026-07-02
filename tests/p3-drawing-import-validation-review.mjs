import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  analyzeModel,
  buildAgentManifest,
  buildPhase3DrawingImportValidationReview,
  createDwgConversionPlan,
  importCandidateToModel,
  importDxfToCandidate,
  PHASE3_DRAWING_IMPORT_VALIDATION_REVIEW_VERSION,
  summarizeImportEntry,
} from '../src/index.js';
import { createIndexAgentApi } from '../src/ui/indexBridge.js';

const dxfText = readFileSync('tests/fixtures/dxf/min-frame.dxf', 'utf8');
const candidate = importDxfToCandidate(dxfText, {
  fileId: 'office-sample-min-frame.dxf',
  tolerance: 1e-6,
  minLength: 1e-4,
  layerMap: {
    'S-COL': { kind: 'column', section: 'H300', material: 'SS275' },
    'S-BEAM': { kind: 'beam', section: 'H300', material: 'SS275' },
  },
});
const model = importCandidateToModel(candidate);
const analysis = analyzeModel(model);
const dwgPlan = createDwgConversionPlan({
  inputPath: 'office-sample.dwg',
  converterPath: 'C:/Tools/ODAFileConverter.exe',
});
const reviewEntry = summarizeImportEntry({ id: 'office-sample-import', status: 'confirmed', candidate });
const review = buildPhase3DrawingImportValidationReview({
  dxfFixtures: [{ id: 'office-sample-min-frame', candidate, analysisOk: analysis.ok }],
  dwgConversions: [{ id: 'office-sample-dwg', plan: dwgPlan, log: 'planned conversion command recorded' }],
  overlayEvidence: [{
    id: 'office-sample-overlay',
    sourcePath: 'tests/fixtures/dxf/min-frame.dxf',
    reportPath: 'reports/import-validation/office-sample-overlay.md',
    reviewer: 'owner-review-placeholder',
  }],
  reviewEntries: [reviewEntry],
});

assert.equal(review.version, PHASE3_DRAWING_IMPORT_VALIDATION_REVIEW_VERSION);
assert.equal(review.summary.ok, true);
assert.equal(review.summary.productionReady, false);
assert.equal(review.summary.agentDecision, 'drawing-import-ready-for-owner-review');
assert.deepEqual(review.summary.missing, []);
assert.equal(review.groups.find((row) => row.id === 'real-office-dxf-fixtures').ok, true);
assert.equal(review.groups.find((row) => row.id === 'visual-overlay-evidence').ok, true);
assert.equal(review.dxfRows[0].status, 'validated');
assert.equal(review.dxfRows[0].layerAuditPresent, true);
assert.equal(review.dxfRows[0].unitAuditPresent, true);
assert.equal(review.dwgRows[0].status, 'ready-to-convert');
assert.equal(review.overlayRows[0].status, 'recorded');
assert.equal(review.reviewRows[0].accepted, true);
assert.ok(review.requiredEvidence.includes('external DWG converter path and conversion log'));

const empty = buildPhase3DrawingImportValidationReview();
assert.equal(empty.summary.ok, false);
assert.ok(empty.summary.missing.includes('real-office-dxf-fixtures'));
assert.equal(empty.summary.agentDecision, 'collect-drawing-import-validation-evidence');

const manifest = buildAgentManifest();
assert.equal(manifest.modules.phase3DrawingImportValidationReview, PHASE3_DRAWING_IMPORT_VALIDATION_REVIEW_VERSION);
assert.ok(manifest.readApis.includes('getPhase3DrawingImportValidationReview'));
assert.ok(manifest.dataContracts.includes('phase3DrawingImportValidationReview'));
assert.equal(manifest.qaCommands.phase3DrawingImportValidation, 'node tests/p3-drawing-import-validation-review.mjs');

const agent = createIndexAgentApi({ model: () => null, reanalyze: () => {} });
assert.equal(agent.getPhase3DrawingImportValidationReview().version, PHASE3_DRAWING_IMPORT_VALIDATION_REVIEW_VERSION);

console.log(JSON.stringify({
  ok: true,
  version: review.version,
  groups: review.groups.length,
  missingWhenEmpty: empty.summary.missing.length,
}, null, 2));
