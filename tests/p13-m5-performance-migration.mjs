import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { previewPhase13TableEdit } from '../src/modeling/phase13PracticalEditors.js';
import { stableHash } from '../src/core/stableHash.js';

const model = { members: Array.from({ length: 1000 }, (_, index) => ({ id: `M${index + 1}`, secId: 'S1', role: 'beam', offsets: { i: [0, 0, 0], j: [0, 0, 0] } })), nodes: [], stories: [], diaphragms: [] };
const started = performance.now();
const preview = previewPhase13TableEdit(model, { collection: 'members', ids: model.members.map((row) => row.id), patch: { secId: 'S2' } });
const duration = performance.now() - started;
assert.equal(preview.status, 'ready'); assert.equal(preview.changes.length, 1000); assert.ok(duration <= 2000, `1000-row preview ${duration} ms exceeds 2000 ms`);
const reopened = JSON.parse(JSON.stringify(model)); assert.equal(stableHash(reopened), stableHash(model));
console.log(JSON.stringify({ ok: true, milestone: 'P13-M5', rowCount: 1000, previewMs: Number(duration.toFixed(2)), migrationParity: true }, null, 2));
