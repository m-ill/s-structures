import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createModel } from '../src/core/modelFactory.js';
import { normalizeNodeMass6Dof, validateNodeMass6Dof } from '../src/core/massSchema.js';
import { validateModel } from '../src/core/validation.js';
import { analyzeDynamics, buildLumpedMass } from '../src/dynamics/modal.js';
import { buildModalConstraintDomain } from '../src/dynamics/modalDiaphragm.js';
import { ensureAgentState, executeModelingAction } from '../src/ui/indexAgentActions.js';

assert.deepEqual(normalizeNodeMass6Dof(2), [2, 2, 2, 0, 0, 0]);
assert.deepEqual(normalizeNodeMass6Dof([1, 2, 3]), [1, 2, 3, 0, 0, 0]);
assert.deepEqual(normalizeNodeMass6Dof([1, 2, 3, 4, 5, 6]), [1, 2, 3, 4, 5, 6]);
assert.equal(validateNodeMass6Dof([1, 2]).code, 'NODE_MASS_COMPONENT_COUNT_INVALID');
assert.equal(validateNodeMass6Dof([1, 2, 3, 0, -1, 0]).code, 'NODE_MASS_COMPONENT_INVALID');
const agentModel = createModel();
executeModelingAction(agentModel, ensureAgentState({}), 'addNode', {
  id: 'N6', x: 0, y: 0, z: 0, mass: [1, 2, 3, 4, 5, 6],
});
assert.deepEqual(agentModel.nodes[0].mass, [1, 2, 3, 4, 5, 6]);
assert.throws(
  () => executeModelingAction(agentModel, ensureAgentState({}), 'setNodeMass', { id: 'N6', mass: [1, 2, 3, 4, -1, 6] }),
  (error) => error.code === 'NODE_MASS_COMPONENT_INVALID',
);

const invalid = frameModel();
invalid.nodes.find((node) => node.id === 'T1').mass = [1, 1, 1, 0, 0, -0.1];
assert.ok(validateModel(invalid).errors.some((row) => row.code === 'BAD_NODE_MASS'));

const nodes = [
  { id: 'A', x: -1, y: 0, z: 3, mass: [1, 1, 1, 0, 0, 0.5] },
  { id: 'B', x: 1, y: 0, z: 3, mass: [1, 1, 1, 0, 0, 0.5] },
];
const system = {
  ndof: 12,
  K: identity(12),
  free: Array.from({ length: 12 }, (_item, index) => index),
  fixedDofs: new Set(),
};
const diaphragmModel = { nodes, diaphragms: [{ id: 'D', type: 'rigid', nodeIds: ['A', 'B'] }] };
const physicalMass = buildLumpedMass(diaphragmModel, { ...system, idx: { A: 0, B: 1 }, memData: {} });
const reduced = buildModalConstraintDomain(diaphragmModel, system, physicalMass);
const rz = reduced.map.columnKeys.indexOf('dia:D:rz');
assert.ok(rz >= 0);
close(reduced.massMatrix[rz][rz], 3, 1e-12, 'TtMT direct plus offset polar inertia');
assert.equal(reduced.massAudit.passed, true);
assert.deepEqual(reduced.massAudit.rows[0].directRotationalInertia, [0, 0, 1]);
assert.deepEqual(reduced.massAudit.rows[0].offsetPolarInertia, [0, 2, 2]);
assert.match(reduced.massAudit.rows[0].ownership, /never substituted or double-counted/);

const dedupModel = {
  nodes: [{ id: 'N', x: 0, y: 0, z: 0, mass: [5, 6, 7, 0.2, 0.3, 0.4] }],
};
const dedupMass = buildLumpedMass(dedupModel, { ndof: 6, idx: { N: 0 }, memData: {} }, { id: 'MS' }, {
  rows: [{ node: 'N', massVector: [5, 6, 7] }],
});
assert.deepEqual(dedupMass, [5, 6, 7, 0.2, 0.3, 0.4]);

const model = frameModel();
const analysis = analyzeDynamics(model);
assert.equal(analysis.ok, true, analysis.reason);
assert.equal(analysis.mass.sixDof.version, 'p14-m4-six-dof-lumped-mass-v1');
assert.equal(analysis.mass.sixDof.directTranslationDeduplicated, false);
assert.equal(analysis.mass.diaphragm.passed, true);
assert.ok(analysis.mass.modalDofCount >= 3, 'Ux/Uy/Rz generalized mass coordinates must be active');
assert.ok(analysis.modes.every((mode) => mode.normalization.massNormalizationResidual < 1e-10));
assert.ok(analysis.modes.every((mode) => mode.coordinateVector.some((value) => Math.abs(value) > 0)));
const xCombined = analysis.rsa.combined.x;
const maxRz = Math.max(...xCombined.nodalDisplacements.map((row) => Math.abs(row.rz)));
const maxInertiaMoment = Math.max(...xCombined.nodalInertiaForces.map((row) => Math.abs(row.rz)));
assert.ok(maxRz > 1e-12, 'eccentric mass must produce recoverable Rz response');
assert.ok(maxInertiaMoment > 1e-12, 'direct Jz must produce recoverable inertia moment');
assert.ok(Object.values(xCombined.nodeRotations).some((vector) => Math.abs(vector[2]) > 1e-12));
assert.ok(Object.values(xCombined.nodeInertiaMoments).some((vector) => Math.abs(vector[2]) > 1e-12));
assert.equal(xCombined.memberForces.status, 'available');

const cliDirectory = await mkdtemp(join(tmpdir(), 'sstructures-p14-m4-'));
const cliModelPath = join(cliDirectory, 'model.json');
const cliCasePath = join(cliDirectory, 'case.json');
await writeFile(cliModelPath, JSON.stringify(model), 'utf8');
await writeFile(cliCasePath, JSON.stringify({
  id: 'RSA6',
  kind: 'responseSpectrum',
  settings: { modalModeCount: 3, spectrum: model.analysisSettings.responseSpectrum },
}), 'utf8');
const cli = JSON.parse(execFileSync(process.execPath, [
  'tools/sstructures-modal-rsa.mjs', cliModelPath, `--case-file=${cliCasePath}`,
], { encoding: 'utf8' }));
assert.equal(cli.status, 'ok');
assert.equal(cli.modalDofCount, analysis.mass.modalDofCount);
assert.ok(cli.sixDofMassAuditHash);
assert.ok(cli.diaphragmMassAuditHash);

console.log(JSON.stringify({
  ok: true,
  milestone: 'P14-M4',
  reducedRzMass: reduced.massMatrix[rz][rz],
  modeCount: analysis.modes.length,
  maxRz,
  maxInertiaMoment,
  memberCount: xCombined.memberForces.memberCount,
}, null, 2));

function frameModel() {
  const model = createModel();
  model.materials = [{ id: 'MAT', name: 'Steel', E: 200e6, G: 80e6, density: 0, Fy: 300e3 }];
  model.sections = [{ id: 'SEC', name: 'Column', A: 0.02, Iy: 8e-5, Iz: 1e-4, J: 2e-5, Zy: 8e-4, Zz: 1e-3 }];
  model.nodes = [
    { id: 'B1', x: 0, y: -1, z: 0, support: 'fixed' },
    { id: 'B2', x: 0, y: 1, z: 0, support: 'fixed' },
    { id: 'T1', x: 0, y: -1, z: 3, support: null, mass: [1, 1, 1, 0, 0, 0.2] },
    { id: 'T2', x: 0, y: 1, z: 3, support: null, mass: [2, 2, 2, 0, 0, 0.3] },
  ];
  model.members = [
    { id: 'C1', n1: 'B1', n2: 'T1', matId: 'MAT', secId: 'SEC', type: 'frame', releases: { i: 'rigid', j: 'rigid' } },
    { id: 'C2', n1: 'B2', n2: 'T2', matId: 'MAT', secId: 'SEC', type: 'frame', releases: { i: 'rigid', j: 'rigid' } },
  ];
  model.diaphragms = [{ id: 'D1', type: 'rigid', nodeIds: ['T1', 'T2'] }];
  model.analysisSettings = {
    ...model.analysisSettings,
    modalModeCount: 3,
    responseSpectrum: {
      enabled: true,
      method: 'CQC',
      directions: ['x', 'y'],
      dampingRatio: 0.05,
      scale: 1,
      applyBaseShearScaling: false,
      points: [{ period: 0, sa: 1 }, { period: 5, sa: 1 }],
    },
  };
  return model;
}

function identity(size) {
  return Array.from({ length: size }, (_row, row) => Array.from({ length: size }, (_column, column) => row === column ? 1 : 0));
}

function close(actual, expected, tolerance, label) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected}, got ${actual}`);
}
