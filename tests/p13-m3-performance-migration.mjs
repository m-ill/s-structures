import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { buildPhase13LoadWorkspace, previewPhase13SlabPanelChangeSet } from '../src/loads/phase13LoadWorkspace.js';
import { stableHash } from '../src/core/stableHash.js';

const model = createPanels(250);
previewPhase13SlabPanelChangeSet(model);
const durations = [];
for (let index = 0; index < 5; index += 1) {
  const started = performance.now();
  const preview = previewPhase13SlabPanelChangeSet(model);
  durations.push(performance.now() - started);
  assert.equal(preview.status, 'ready');
  assert.equal(preview.equilibrium.every((row) => row.status === 'PASS'), true);
}
durations.sort((a, b) => a - b);
const p95 = durations[Math.ceil(durations.length * 0.95) - 1];
assert.ok(p95 <= 2000, `250-panel preview p95 ${p95} ms exceeds 2000 ms`);
const reopened = JSON.parse(JSON.stringify(model));
assert.equal(stableHash(buildPhase13LoadWorkspace(reopened)), stableHash(buildPhase13LoadWorkspace(model)));
console.log(JSON.stringify({ ok: true, milestone: 'P13-M3', panelCount: 250, previewP95Ms: Number(p95.toFixed(2)), saveReopenParity: true }, null, 2));

function createPanels(count) {
  const nodes = []; const members = []; const slabPanels = [];
  for (let index = 0; index < count; index += 1) {
    const x = (index % 25) * 5; const y = Math.floor(index / 25) * 4;
    const ids = [0, 1, 2, 3].map((corner) => `N${index}-${corner}`);
    nodes.push(
      { id: ids[0], x, y, z: 0 }, { id: ids[1], x: x + 4, y, z: 0 },
      { id: ids[2], x: x + 4, y: y + 3, z: 0 }, { id: ids[3], x, y: y + 3, z: 0 },
    );
    for (let edge = 0; edge < 4; edge += 1) members.push({ id: `M${index}-${edge}`, n1: ids[edge], n2: ids[(edge + 1) % 4] });
    slabPanels.push({ id: `P${index}`, nodeIds: ids, load: 5, case: 'D', distribution: index % 2 ? 'one-way' : 'two-way' });
  }
  return { nodes, members, slabPanels, loads: [], loadCases: [{ id: 'D', type: 'dead' }], loadCombinations: [], massSources: [] };
}
