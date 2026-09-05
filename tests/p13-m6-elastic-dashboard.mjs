import assert from 'node:assert/strict';
import { buildPhase13ElasticDashboard, buildPhase13ElasticResultQuery, exportPhase13DashboardCsv } from '../src/results/phase13ElasticDashboard.js';

const run = { id: 'R1', caseId: 'C1', status: 'completed', qualification: 'candidate', designTransferAllowed: false, result: { displacements: [{ id: 'N1', ux: 1 }], reactions: [{ id: 'N1', fz: -2 }], memberForces: [{ id: 'M1', mz: 3, label: '=unsafe' }], story: { drift: [0.001] }, modal: { periods: [1] }, rsa: { baseShear: 10 }, pDelta: { theta: 0.02 }, buckling: { factor: 3 }, timeHistory: { steps: 2 } } };
const dashboard = buildPhase13ElasticDashboard({ run, selection: { type: 'member', id: 'M1' }, current: true });
assert.equal(dashboard.runId, 'R1'); assert.equal(dashboard.tabs.length, 10); assert.equal(dashboard.objectLinks.length, 3); assert.equal(dashboard.governing.maxAbsolute.value, 3);
const query = buildPhase13ElasticResultQuery(dashboard, { tab: 'member-forces', objectId: 'M1' });
assert.equal(query.runId, dashboard.runId); assert.equal(query.resultHash, dashboard.resultHash);
const csv = exportPhase13DashboardCsv(query); assert.equal(csv.formulaInjectionEscaped, true); assert.match(csv.text, /'=unsafe/);
const stale = buildPhase13ElasticDashboard({ run, current: false }); assert.equal(stale.designTransferAllowed, false); assert.equal(stale.historical, true);
assert.throws(() => buildPhase13ElasticDashboard({ run: { ...run, status: 'failed' } }), { code: 'P13_NON_CURRENT_RUN_SET' });
console.log(JSON.stringify({ ok: true, milestone: 'P13-M6', immutableRunParity: true, safeCsv: true }, null, 2));
