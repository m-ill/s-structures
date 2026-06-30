import assert from 'node:assert/strict';
import {
  STORY_ECCENTRIC_DISTRIBUTION_VERSION,
  STORY_MASS_SUMMARY_VERSION,
  buildEccentricStoryLoadDistribution,
  buildStoryMassSummary,
  createModel,
} from '../src/index.js';
import { buildAgentManifest } from '../src/ui/agentManifest.js';
import { createIndexAgentApi } from '../src/ui/indexBridge.js';

const model = createModel();
model.nodes = [
  node('B1', 0, 0, 0, 'fixed'), node('B2', 4, 0, 0, 'fixed'),
  node('B3', 0, 4, 0, 'fixed'), node('B4', 4, 4, 0, 'fixed'),
  node('T1', 0, 0, 3, null, 1), node('T2', 4, 0, 3, null, 1),
  node('T3', 0, 4, 3, null, 3), node('T4', 4, 4, 3, null, 3),
];
model.members = [
  member('C1', 'B1', 'T1'), member('C2', 'B2', 'T2'),
  member('C3', 'B3', 'T3'), member('C4', 'B4', 'T4'),
];
model.diaphragms = [{ id: 'D1', type: 'rigid', z: 3 }];

const summary = buildStoryMassSummary(model);
assert.equal(summary.version, STORY_MASS_SUMMARY_VERSION);
assert.equal(summary.storyCount, 1);
assert.equal(summary.totalMass, 8);
assert.deepEqual(summary.rows[0].massCenter, { x: 2, y: 3 });
assert.deepEqual(summary.rows[0].diaphragmCenter, { x: 2, y: 2 });
assert.equal(summary.rows[0].stiffnessCenter.source, 'column-proxy');
assert.deepEqual({ x: summary.rows[0].stiffnessCenter.x, y: summary.rows[0].stiffnessCenter.y }, { x: 2, y: 2 });
assert.deepEqual(summary.rows[0].eccentricity.massToDiaphragm, { x: 0, y: 1 });

const dist = buildEccentricStoryLoadDistribution(model, { forces: [{ story: 1, caseId: 'EX', dir: '+x', force: 80 }] });
assert.equal(dist.version, STORY_ECCENTRIC_DISTRIBUTION_VERSION);
assert.equal(dist.storyMassVersion, STORY_MASS_SUMMARY_VERSION);
assert.equal(sum(dist.rows[0].nodeForces.map((row) => row.P)), 80);
assert.equal(dist.rows[0].torsionMz, -80);
assert.ok(forceAt(dist, 'T3') > forceAt(dist, 'T1'));

const agent = createIndexAgentApi({ model: () => model, reanalyze: () => {} }, { getLastResult: () => null });
assert.equal(agent.getStoryMassSummary().version, STORY_MASS_SUMMARY_VERSION);
assert.equal(agent.getEccentricStoryLoadDistribution({ forces: [{ story: 1, force: 80, dir: '+x' }] }).summary.rowCount, 1);

const manifest = buildAgentManifest();
assert.equal(manifest.modules.storyMassSummary, STORY_MASS_SUMMARY_VERSION);
assert.ok(manifest.readApis.includes('getEccentricStoryLoadDistribution'));
assert.ok(manifest.dataContracts.includes('phase2StoryMassSummary'));

console.log(JSON.stringify({
  ok: true,
  storyMass: STORY_MASS_SUMMARY_VERSION,
  eccentricDistribution: STORY_ECCENTRIC_DISTRIBUTION_VERSION,
  massCenter: summary.rows[0].massCenter,
}, null, 2));

function node(id, x, y, z, support, mass) {
  return { id, x, y, z, support, mass: mass == null ? undefined : [mass, mass, mass] };
}

function member(id, n1, n2) {
  return { id, type: 'frame', n1, n2, matId: 'steel', secId: 'h400' };
}

function sum(values) {
  return Number(values.reduce((acc, value) => acc + value, 0).toFixed(6));
}

function forceAt(dist, nodeId) {
  return dist.rows[0].nodeForces.find((row) => row.nodeId === nodeId)?.P || 0;
}
