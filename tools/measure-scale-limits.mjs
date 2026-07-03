import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { performance } from 'node:perf_hooks';
import { analyzeModel, createModel } from '../src/index.js';

const OUT = 'reports/validation-evidence/scale-limits.json';
const cases = [
  { id: 'scale-0500', bays: 8, stories: 2, analyze: true },
  { id: 'scale-1000', bays: 12, stories: 2, analyze: true },
  { id: 'scale-2000', bays: 18, stories: 2, analyze: false },
  { id: 'scale-4000', bays: 25, stories: 2, analyze: false },
];

const rows = [];
for (const item of cases) {
  const genStart = performance.now();
  const model = createGridFrameModel(item);
  const generationMs = elapsed(genStart);
  const row = {
    id: item.id,
    targetBays: item.bays,
    stories: item.stories,
    nodeCount: model.nodes.length,
    memberCount: model.members.length,
    generationMs,
    analysisMs: null,
    analysisStatus: item.analyze ? 'not-run' : 'deferred-long-run',
  };
  if (item.analyze) {
    const analysisStart = performance.now();
    const analysis = analyzeModel(model);
    row.analysisMs = elapsed(analysisStart);
    row.analysisStatus = analysis.ok ? 'ok' : 'ng';
    row.comboCount = Object.keys(analysis.byCombo || {}).length;
  }
  rows.push(row);
}

const report = {
  version: 'p4-scale-limits-v1',
  generatedAt: new Date().toISOString(),
  recommended: {
    routineInteractiveMemberLimit: 1000,
    reviewRequiredAboveMembers: 2000,
    longRunValidationRequiredAtMembers: 4000,
  },
  rows,
};

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ ok: true, version: report.version, rows: rows.length, out: OUT }, null, 2));

function createGridFrameModel({ bays, stories }) {
  const model = createModel();
  model.loadCases = [{ id: 'D', name: 'Dead load', type: 'dead' }];
  model.loadCombinations = [{ id: 'SLS-D', name: '1.0D', type: 'service', factors: { D: 1 } }];
  const nodeId = (ix, iy, iz) => `N${ix}_${iy}_${iz}`;
  for (let iz = 0; iz <= stories; iz += 1) {
    for (let iy = 0; iy <= bays; iy += 1) {
      for (let ix = 0; ix <= bays; ix += 1) {
        model.nodes.push({ id: nodeId(ix, iy, iz), x: ix * 6, y: iy * 6, z: iz * 3.4, support: iz === 0 ? 'fixed' : null });
      }
    }
  }
  let i = 1;
  const add = (n1, n2, role) => model.members.push({
    id: `M${i++}`, type: 'frame', n1, n2, matId: 'steel', secId: 'h400',
    localAxis: { roll: 0, strongAxis: 'z' }, design: { role },
  });
  for (let iz = 0; iz < stories; iz += 1) {
    for (let iy = 0; iy <= bays; iy += 1) for (let ix = 0; ix <= bays; ix += 1) add(nodeId(ix, iy, iz), nodeId(ix, iy, iz + 1), 'column');
  }
  for (let iz = 1; iz <= stories; iz += 1) {
    for (let iy = 0; iy <= bays; iy += 1) for (let ix = 0; ix < bays; ix += 1) add(nodeId(ix, iy, iz), nodeId(ix + 1, iy, iz), 'beam');
    for (let ix = 0; ix <= bays; ix += 1) for (let iy = 0; iy < bays; iy += 1) add(nodeId(ix, iy, iz), nodeId(ix, iy + 1, iz), 'beam');
  }
  for (const node of model.nodes.filter((row) => row.z > 0 && row.x === 0)) {
    model.loads.push({ id: `L${model.loads.length + 1}`, case: 'D', node: node.id, P: [0, 0, -5] });
  }
  return model;
}

function elapsed(start) {
  return Number((performance.now() - start).toFixed(3));
}
