import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { buildPhase13ElasticDashboard, buildPhase13ElasticResultQuery } from '../src/results/phase13ElasticDashboard.js';

const run = { id: 'R-PERF', caseId: 'C1', status: 'completed', qualification: 'candidate', result: { memberForces: Array.from({ length: 10000 }, (_, index) => ({ id: `M${index + 1}`, mz: index - 5000 })) } };
const started = performance.now(); const dashboard = buildPhase13ElasticDashboard({ run, current: true }); const buildMs = performance.now() - started;
const queryStarted = performance.now(); const query = buildPhase13ElasticResultQuery(dashboard, { tab: 'member-forces' }); const queryMs = performance.now() - queryStarted;
assert.equal(query.value.length, 10000); assert.ok(queryMs <= 200, `10k query ${queryMs} ms exceeds 200 ms`); assert.equal(dashboard.statusPresentation.current.colorOnly, false);
console.log(JSON.stringify({ ok: true, milestone: 'P13-M6', rows: 10000, buildMs: Number(buildMs.toFixed(2)), queryMs: Number(queryMs.toFixed(2)), colorOnlyStatus: false }, null, 2));
