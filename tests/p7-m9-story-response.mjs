import assert from 'node:assert/strict';
import { buildStoryDriftTrace } from '../src/results/story/drift.js';
import { buildStoryOverturningTrace } from '../src/results/story/overturning.js';
import { buildStoryShearTrace } from '../src/results/story/shear.js';

const model = twoStoryModel();
const analysis = twoStoryRsaAnalysis();
analysis.byCombo = {
  STATIC_DECOY: {
    disp: Object.fromEntries(model.nodes.map((node) => [node.id, [999, 999, 0]])),
    reactions: { B1: [1e9, 1e9, 0], B2: [1e9, 1e9, 0] },
  },
};

const drift = buildStoryDriftTrace(model, analysis);
const shear = buildStoryShearTrace(model, analysis);
const overturning = buildStoryOverturningTrace(model, analysis);
assert.equal(drift.status ?? drift.resultStatus, 'available');
assert.equal(shear.status, 'available');
assert.equal(overturning.status, 'available');
assert.equal(drift.rows.length, 2);
assert.equal(shear.rows.length, 2);
assert.equal(overturning.rows.length, 2);

const drift1 = rowAt(drift.rows, 1);
const drift2 = rowAt(drift.rows, 2);
close(drift1.driftX, Math.hypot(0.01, 0.002), 1e-12, 'story 1 drift');
close(drift2.driftX, Math.hypot(0.02, 0.003), 1e-12, 'story 2 drift');
close(drift1.driftRatio, Math.hypot(0.01, 0.002) / 3, 1e-12, 'story 1 drift ratio');

const shear1 = rowAt(shear.rows, 1);
const shear2 = rowAt(shear.rows, 2);
close(shear1.storyShearX, Math.hypot(30, 2), 1e-12, 'story 1 shear');
close(shear2.storyShearX, Math.hypot(20, -1), 1e-12, 'story 2 shear');
close(shear1.storyTorsionMz, Math.hypot(6, 2), 1e-12, 'story 1 torsion');
close(shear2.storyTorsionMz, Math.hypot(4, 1), 1e-12, 'story 2 torsion');
assert.equal(shear1.dimensions.storyShearX, 'force');
assert.equal(shear1.dimensions.storyTorsionMz, 'moment');

const overturning1 = rowAt(overturning.rows, 1);
const overturning2 = rowAt(overturning.rows, 2);
close(overturning1.overturningY, Math.hypot(150, 3), 1e-12, 'base overturning');
close(overturning2.overturningY, Math.hypot(60, -3), 1e-12, 'story 2 overturning');

for (const trace of [drift, shear, overturning]) {
  assert.equal(trace.summary.staticReferenceCount, 0);
  assert.deepEqual(trace.provenance.staticCaseReferences, []);
  assert.ok(trace.rows.every((row) => row.analysisCaseId === 'RSA-STORY'));
  assert.ok(trace.rows.every((row) => row.provenance.source === 'rsa-modal-nodal-response'));
  assert.ok(trace.rows.every((row) => !String(row.comboId).includes('STATIC_DECOY')));
}

const changedStatic = {
  ...analysis,
  byCombo: { STATIC_DECOY_2: { disp: {}, reactions: {} } },
};
assert.deepEqual(
  buildStoryShearTrace(model, changedStatic).rows.map(responseValues),
  shear.rows.map(responseValues),
  'story response must be invariant to static result changes',
);

const scaled = buildStoryShearTrace(model, analysis, { rsaScaleFactors: { x: 2 } });
close(rowAt(scaled.rows, 1).storyShearX, 2 * shear1.storyShearX, 1e-12, 'scaled story shear');
assert.equal(rowAt(scaled.rows, 1).provenance.scaling.applied, true);

const unsupported = buildStoryShearTrace(model, { byCombo: analysis.byCombo });
assert.equal(unsupported.status, 'unsupported');
assert.equal(unsupported.designBlocked, true);
assert.deepEqual(unsupported.rows, []);

console.log(JSON.stringify({
  ok: true,
  story1Drift: drift1.drift,
  story1Shear: shear1.storyShearX,
  story1Torsion: shear1.storyTorsionMz,
  baseOverturning: overturning1.overturningY,
}, null, 2));

function twoStoryModel() {
  const levels = [0, 3, 6];
  const nodes = levels.flatMap((z, level) => [
    { id: `${level === 0 ? 'B' : `F${level}`}A`, x: 0, y: -1, z },
    { id: `${level === 0 ? 'B' : `F${level}`}B`, x: 0, y: 1, z },
  ]);
  return {
    units: { length: 'm', force: 'kN', moment: 'kN.m' },
    nodes,
    members: [],
    loads: [{ id: 'STATIC-LOAD', node: 'F2A', case: 'STATIC_DECOY', P: 1e12, direction: 'x' }],
    stories: [],
  };
}

function twoStoryRsaAnalysis() {
  const nodeIds = ['BA', 'BB', 'F1A', 'F1B', 'F2A', 'F2B'];
  const mode1Disp = { BA: 0, BB: 0, F1A: 0.01, F1B: 0.01, F2A: 0.03, F2B: 0.03 };
  const mode2Disp = { BA: 0, BB: 0, F1A: 0.002, F1B: 0.002, F2A: -0.001, F2B: -0.001 };
  const mode1Force = { BA: 0, BB: 0, F1A: 6, F1B: 4, F2A: 12, F2B: 8 };
  const mode2Force = { BA: 0, BB: 0, F1A: 2, F1B: 1, F2A: 0, F2B: -1 };
  return {
    dynamics: {
      rsa: {
        method: 'SRSS',
        units: { length: 'm', displacement: 'm', force: 'kN', baseShear: 'kN' },
        spectrum: { dampingRatio: 0.05 },
        provenance: {
          source: 'modal-response-spectrum-recovery',
          analysisCaseId: 'RSA-STORY',
          resultPath: 'analysisCases.RSA-STORY.result',
          staticCaseReferences: [],
        },
        modal: [{
          direction: 'x',
          responses: [
            modalResponse('M1', 1, nodeIds, mode1Disp, mode1Force),
            modalResponse('M2', 0.6, nodeIds, mode2Disp, mode2Force),
          ],
        }],
        combined: { x: { method: 'SRSS', baseShear: Math.hypot(30, 2) } },
      },
    },
  };
}

function modalResponse(mode, period, nodeIds, displacements, forces) {
  return {
    mode,
    period,
    recoveryStatus: 'available',
    nodalDisplacements: nodeIds.map((nodeId) => vectorRow(nodeId, displacements[nodeId])),
    nodalInertiaForces: nodeIds.map((nodeId) => vectorRow(nodeId, forces[nodeId])),
  };
}

function vectorRow(nodeId, x) {
  return { nodeId, vector: [x, 0, 0], x, y: 0, z: 0 };
}

function rowAt(rows, story) {
  return rows.find((row) => row.story === story && row.direction === 'x');
}

function responseValues(row) {
  return {
    story: row.story,
    direction: row.direction,
    forceX: row.forceX,
    storyShearX: row.storyShearX,
    storyTorsionMz: row.storyTorsionMz,
  };
}

function close(actual, expected, tolerance, label) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected}, got ${actual}`);
}
