import assert from 'node:assert/strict';
import {
  DIAPHRAGM_SUMMARY_VERSION,
  DIAPHRAGM_VERSION,
  ERROR_CODES,
  RIGID_DIAPHRAGM_BENCHMARK_VERSION,
  analyzeModel,
  buildDiaphragmSummary,
  createModel,
  runRigidDiaphragmBenchmark,
  validateModel,
} from '../src/index.js';
import { buildAgentManifest } from '../src/ui/agentManifest.js';
import { createIndexAgentApi } from '../src/ui/indexBridge.js';

const model = createModel();
model.nodes = [
  { id: 'B1', x: 0, y: 0, z: 0, support: 'fixed' },
  { id: 'T1', x: 0, y: 0, z: 3 },
  { id: 'B2', x: 4, y: 0, z: 0, support: 'fixed' },
  { id: 'T2', x: 4, y: 0, z: 3 },
];
model.members = [member('C1', 'B1', 'T1'), member('C2', 'B2', 'T2')];
model.loads = [{ id: 'P1', type: 'nodal', node: 'T1', P: 20, dir: '+x', case: 'D' }];
model.loadCombinations = [{ id: 'D_ONLY', name: '1.0D', type: 'strength', factors: { D: 1 } }];
model.diaphragms = [{ id: 'DIA1', type: 'rigid', z: 3 }];

const analysis = analyzeModel(model);
assert.equal(analysis.ok, true);
assert.equal(Math.abs(analysis.byCombo.D_ONLY.disp.T1[0] - analysis.byCombo.D_ONLY.disp.T2[0]) <= 1e-8, true);
assert.equal(analysis.byCombo.D_ONLY.solver.diaphragmCount, 1);

const summary = buildDiaphragmSummary(model);
assert.equal(summary.version, DIAPHRAGM_SUMMARY_VERSION);
assert.equal(summary.diaphragmVersion, DIAPHRAGM_VERSION);
assert.equal(summary.count, 1);
assert.equal(summary.groups[0].nodeCount, 2);

const bad = validateModel({ ...model, diaphragms: [{ id: 'BAD', type: 'semi-rigid', nodeIds: ['NOPE'] }] });
assert.ok(bad.errors.some((item) => item.code === ERROR_CODES.BAD_DIAPHRAGM_TYPE));
assert.ok(bad.errors.some((item) => item.code === ERROR_CODES.BAD_DIAPHRAGM_NODE_REF));

const gate = runRigidDiaphragmBenchmark();
assert.equal(gate.version, RIGID_DIAPHRAGM_BENCHMARK_VERSION);
assert.equal(gate.ok, true, JSON.stringify(gate, null, 2));

const agent = createIndexAgentApi({ model: () => model, reanalyze: () => {} }, { getLastResult: () => analysis });
assert.equal(agent.getDiaphragmSummary().version, DIAPHRAGM_SUMMARY_VERSION);
assert.equal(agent.prepareResultView('getRigidDiaphragmBenchmark').version, RIGID_DIAPHRAGM_BENCHMARK_VERSION);

const manifest = buildAgentManifest();
assert.equal(manifest.modules.diaphragm, DIAPHRAGM_VERSION);
assert.ok(manifest.readApis.includes('getRigidDiaphragmBenchmark'));
assert.ok(manifest.dataContracts.includes('phase2RigidDiaphragmBenchmark'));

console.log(JSON.stringify({
  ok: true,
  diaphragm: DIAPHRAGM_VERSION,
  benchmark: RIGID_DIAPHRAGM_BENCHMARK_VERSION,
  maxPlanDelta: gate.maxPlanDelta,
}, null, 2));

function member(id, n1, n2) {
  return { id, type: 'frame', n1, n2, matId: 'steel', secId: 'h300', releases: { i: 'rigid', j: 'rigid' } };
}
