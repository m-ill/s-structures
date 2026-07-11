import assert from 'node:assert/strict';
import {
  ANALYSIS_CASE_STATUSES,
  ANALYSIS_CASE_VERSION,
  createAnalysisCase,
  createModel,
  ERROR_CODES,
  markAnalysisCasesStale,
  migrateModel,
  modelToJson,
  normalizeAnalysisCases,
  parseModelJson,
  validateAnalysisCases,
  validateModel,
} from '../src/index.js';

assert.equal(ANALYSIS_CASE_VERSION, 'p5-analysis-case-v1');
assert.ok(ANALYSIS_CASE_STATUSES.has('stale'));

const model = createModel();
assert.deepEqual(model.analysisCases, [], 'new model should include analysisCases');

const cases = normalizeAnalysisCases([
  { id: 'AC1', name: 'Modal', kind: 'modal', settings: { modeCount: 12 }, status: 'ok', lastRun: { ok: true, resultRef: 'AC1' } },
  { id: 'AC1', kind: 'responseSpectrum', status: 'bad-status' },
]);
assert.equal(cases.length, 2);
assert.equal(cases[0].status, 'ok');
assert.equal(cases[1].id, 'AC1-2', 'duplicate ids should normalize deterministically');
assert.equal(cases[1].status, 'not-run', 'bad status should normalize to not-run');

const created = createAnalysisCase({ kind: 'nlth' }, cases);
assert.equal(created.kind, 'nlth');
assert.ok(created.id.startsWith('AC'));

const stale = markAnalysisCasesStale(cases);
assert.equal(stale[0].status, 'stale');
assert.equal(stale[1].status, 'not-run');

const invalid = validateAnalysisCases([
  { id: 'A', kind: 'static', status: 'not-run' },
  { id: 'A', kind: 'other', status: 'done' },
]);
assert.ok(invalid.some((item) => item.code === 'DUPLICATE_ANALYSIS_CASE_ID'));
assert.ok(invalid.some((item) => item.code === 'BAD_ANALYSIS_CASE_KIND'));
assert.ok(invalid.some((item) => item.code === 'BAD_ANALYSIS_CASE_STATUS'));

const invalidModel = createModel({ analysisCases: [{ id: 'AC1', kind: 'unsupported', status: 'not-run' }] });
invalidModel.analysisCases[0].kind = 'unsupported';
const validation = validateModel(invalidModel);
assert.ok(validation.errors.some((item) => item.code === ERROR_CODES.BAD_ANALYSIS_CASE_KIND));

const legacy = migrateModel({ schemaVersion: 1, nodes: [], members: [], loads: [] });
assert.ok(Array.isArray(legacy.model.analysisCases));
assert.ok(legacy.migrations.some((item) => item.to === 'analysisCases'));

const roundTripModel = createModel({
  analysisCases: [createAnalysisCase({ id: 'AC_MODAL', kind: 'modal', settings: { modalModeCount: 8 }, status: 'stale' })],
});
const parsed = parseModelJson(modelToJson(roundTripModel, { exportedAt: '2026-07-09T00:00:00.000Z' }));
assert.equal(parsed.ok, true, JSON.stringify(parsed.validation.errors, null, 2));
assert.equal(parsed.model.analysisCases[0].id, 'AC_MODAL');
assert.equal(parsed.model.analysisCases[0].status, 'stale');

console.log(JSON.stringify({
  ok: true,
  version: ANALYSIS_CASE_VERSION,
  statuses: [...ANALYSIS_CASE_STATUSES],
  roundTripCases: parsed.model.analysisCases.length,
}, null, 2));
