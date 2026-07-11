import assert from 'node:assert/strict';
import {
  DIAPHRAGM_LOAD_PATH_WARNING,
  LANCZOS_EIGEN_VERSION,
  PHASE6_M4_RESULT_TRACE_VERSION,
  analyzeModel,
  buildDiaphragmLoadPathForces,
  buildAdvancedElasticTrace,
  buildLanczosEigenTrace,
  buildPhase6M4ResultTrace,
  combineDirectionalResponses,
  createTwoStoryElasticFrameModel,
} from '../src/index.js';

const eigen = buildLanczosEigenTrace({
  matrix: [
    [2, 0],
    [0, 8],
  ],
  mass: [1, 2],
  modeCount: 2,
  maxIterations: 2,
});
assert.equal(eigen.version, LANCZOS_EIGEN_VERSION);
assert.equal(eigen.status, 'available');
assert.ok(Math.abs(eigen.modes[0].eigenvalue - 2) < 1e-10);
assert.ok(Math.abs(eigen.modes[1].eigenvalue - 4) < 1e-10);
assert.ok(eigen.maxResidual < 1e-10);

const directional = combineDirectionalResponses({ x: 100, y: 40, z: 0 }, { method: '100-30', dirFactor: 0.3 });
assert.equal(directional.governing, 'X');
assert.equal(directional.combined, 112);

const model = createM4Model();
const analysis = analyzeModel(model);
assert.equal(analysis.ok, true, JSON.stringify(analysis.validation.errors, null, 2));
assert.equal(analysis.dynamics.ok, true, analysis.dynamics.reason || 'modal dynamics should be available');

const trace = buildPhase6M4ResultTrace(model, analysis, {
  directionMinima: { x: 1, y: 1 },
  accidentalBaseCases: ['EX'],
});
assert.equal(trace.version, PHASE6_M4_RESULT_TRACE_VERSION);
assert.ok(trace.modal.massParticipation.rows.length > 0);
assert.ok(trace.modal.massParticipation.directions.find((row) => row.direction === 'x'));
assert.ok(trace.rsa.baseShearScaling.rows.length >= 2);
assert.ok(trace.rsa.baseShearScaling.summary.maxScaleFactor >= 1);
assert.ok(trace.rsa.directional.combined > 0);
assert.ok(trace.rsa.signedResponse.generatedAccidental.length === 2);
assert.ok(trace.rsa.signedResponse.warnings.some((warning) => warning.includes('unsigned')));

assert.ok(trace.story.drift.rows.length > 0);
assert.ok(trace.story.shear.rows.length > 0);
assert.ok(trace.story.overturning.summary.maxOverturning > 0);
assert.equal(trace.story.centers.rows.length, model.stories.length);
assert.ok(trace.story.centers.warnings.some((warning) => warning.includes('column stiffness proxy')));

assert.equal(trace.diaphragm.warning, DIAPHRAGM_LOAD_PATH_WARNING);
assert.equal(trace.diaphragm.summary.semiRigidDiaphragmCount, model.stories.length);
assert.ok(trace.diaphragm.rows.length >= model.stories.length);
assert.ok(trace.diaphragm.summary.maxForce > 0);

const advanced = buildAdvancedElasticTrace(model, analysis);
assert.equal(advanced.phase6M4.version, PHASE6_M4_RESULT_TRACE_VERSION);
assert.equal(advanced.phase6M4.story.shear.rows.length, trace.story.shear.rows.length);

const rigidOnly = {
  ...model,
  diaphragms: model.diaphragms.map((item) => ({ ...item, type: 'rigid' })),
};
const rigidForces = buildDiaphragmLoadPathForces(rigidOnly, analysis);
assert.equal(rigidForces.summary.rowCount, 0);
assert.equal(rigidForces.skippedRigidDiaphragmCount, model.stories.length);

console.log(JSON.stringify({
  ok: true,
  version: PHASE6_M4_RESULT_TRACE_VERSION,
  massStatus: trace.modal.massParticipation.status,
  storyRows: trace.story.shear.rows.length,
  diaphragmRows: trace.diaphragm.rows.length,
  maxScale: trace.rsa.baseShearScaling.summary.maxScaleFactor,
}, null, 2));

function createM4Model() {
  const model = createTwoStoryElasticFrameModel();
  for (const node of model.nodes) {
    if ((Number(node.z) || 0) > 0) node.mass = [20, 20, 20];
  }
  model.analysisSettings.modalModeCount = 6;
  model.analysisSettings.responseSpectrum = {
    enabled: true,
    method: 'CQC',
    dampingRatio: 0.05,
    scale: 9.80665,
    directions: ['x', 'y'],
    points: [{ period: 0, sa: 0.4 }, { period: 5, sa: 0.4 }],
  };
  model.loadCases.push({ id: 'EX', name: 'Earthquake X', type: 'seismic' });
  model.diaphragms = model.stories.map((story) => ({
    id: `DIA-${story.id}`,
    type: 'semiRigid',
    storyId: story.id,
    nodeIds: story.nodeIds,
    inPlaneStiffness: 50000,
  }));
  return model;
}
