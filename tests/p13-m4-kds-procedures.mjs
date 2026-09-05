import assert from 'node:assert/strict';
import { createPhase13KdsApproval, createPhase13KdsSourceSnapshot, evaluatePhase13KdsApproval, executePhase13KdsProcedure } from '../src/loads/phase13KdsProcedures.js';

const missing = createPhase13KdsSourceSnapshot({ code: 'KDS' });
assert.equal(missing.status, 'blocked');
assert.ok(missing.errors.includes('KDS_SOURCE_HASH_REQUIRED'));
const source = createPhase13KdsSourceSnapshot({
  sourceId: 'KDS-FIXTURE-1', authority: 'official-fixture', code: 'KDS test fixture', edition: '2026-test',
  effectiveDate: '2026-01-01', sourceLocator: 'offline://approved-fixture', sourceHash: 'a'.repeat(64),
  fixtureHash: 'b'.repeat(64), formulaVersion: 'fixture-formula-v1', reviewStatus: 'approved',
  clauseMap: { 'wind-story-transfer': 'fixture-wind', 'seismic-story-distribution': 'fixture-seismic', 'snow-project-input': 'fixture-snow' },
  reviewer: 'engineer', approvedAt: '2026-08-05T00:00:00Z', branchCoverageApproved: true,
});
assert.equal(source.status, 'approved');
assert.equal(createPhase13KdsSourceSnapshot({ ...source, supersededBy: 'NEW-PACK' }).status, 'blocked');
const model = { nodes: [{ id: 'N1', x: 0, y: 0, z: 0 }, { id: 'N2', x: 0, y: 10, z: 3 }], stories: [{ id: 'S1', z: 3, weight: 100 }, { id: 'S2', z: 6, weight: 80 }] };
const wind = executePhase13KdsProcedure({ source, procedureId: 'wind-story-transfer', model, parameters: { pressure: 1, direction: 'x' } });
assert.equal(wind.status, 'review-ready'); assert.equal(wind.engineerReviewRequired, true); assert.match(wind.traceHash, /^[0-9a-f]{24}$/);
assert.equal(wind.designTransferAllowed, false); assert.equal(wind.trace.roundingUsedForSolverInput, false);
const seismic = executePhase13KdsProcedure({ source, procedureId: 'seismic-story-distribution', model, parameters: { baseShear: 90 } });
assert.equal(seismic.output.rows.reduce((sum, row) => sum + row.force, 0), 90);
const snow = executePhase13KdsProcedure({ source, procedureId: 'snow-project-input', model, parameters: { pressure: 2, area: 50 } });
assert.equal(snow.output.totalLoad, 100); assert.equal(snow.output.generatedAutomaticallyFromCodeMap, false);
const blocked = executePhase13KdsProcedure({ source: missing, procedureId: 'wind-story-transfer', model, parameters: { pressure: 1 } });
assert.equal(blocked.status, 'blocked'); assert.equal(blocked.output, null);
const approval = createPhase13KdsApproval(wind, { reviewer: 'engineer', memo: 'fixture review', approvedAt: '2026-08-05T01:00:00Z', projectId: 'P1', revisionId: 'R1' });
assert.equal(evaluatePhase13KdsApproval(wind, approval, { projectId: 'P1', revisionId: 'R1' }).designTransferAllowed, true);
assert.equal(evaluatePhase13KdsApproval(wind, approval, { projectId: 'P1', revisionId: 'R2' }).designTransferAllowed, false);
console.log(JSON.stringify({ ok: true, milestone: 'P13-M4', procedures: 3, approvalStaleGuard: true }, null, 2));
