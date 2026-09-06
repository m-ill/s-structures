import assert from 'node:assert/strict';
import {
  analyzeDynamics,
  assembleZeroLengthPmmHinge3dDomain,
  assembleStiffness3D,
  buildElasticLink6dofMatrix,
  createModel,
  createMonotonePchip,
  createPmmHinge3dProperty,
  createPmmHinge3dState,
  evaluatePmmHinge3d,
  evaluateZeroLengthPmmHinge3d,
  recoverElasticLink6dofResponse,
  validateModel,
} from '../src/index.js';
import { runSb12, runSh1 } from '../verification/framework/benchmarks/strix21Completion.js';

const model = createModel({
  nodes: [
    { id: 'B', x: 0, y: 0, z: 0, support: 'fixed' },
    { id: 'T', x: 3, y: 2, z: 1, support: null, mass: [2, 2, 2, 1, 1, 1] },
  ],
  members: [],
  links: [{ id: 'L1', n1: 'B', n2: 'T', stiffness: [100, 200, 300, 400, 500, 600], betaDeg: 17, shearDist: 0.4 }],
  materials: [],
  sections: [],
  analysisSettings: { modalModeCount: 6, responseSpectrum: { enabled: false } },
});
const validation = validateModel(model);
assert.equal(validation.ok, true, JSON.stringify(validation.errors, null, 2));
const assembly = assembleStiffness3D(model.nodes, model.members, { model });
assert.equal(assembly.ok, true, assembly.reason);
assert.equal(assembly.linkData.length, 1);
assert.ok(maxSymmetryError(assembly.K) <= 1e-10);
const modal = analyzeDynamics(model);
assert.equal(modal.ok, true, modal.reason);
assert.equal(modal.modes.length, 6);

const built = buildElasticLink6dofMatrix({
  nodeI: model.nodes[0], nodeJ: model.nodes[1], stiffness: model.links[0].stiffness, betaDeg: 17, shearDist: 0.4,
});
const displacement = [0, 0, 0, 0, 0, 0, 0.01, -0.02, 0.03, 0.001, -0.002, 0.003];
const recovered = recoverElasticLink6dofResponse({ built, displacement });
assert.ok(recovered.strainEnergy >= 0);
const matrixForce = built.globalStiffness.map((row) => row.reduce((sum, value, index) => sum + value * displacement[index], 0));
assert.ok(Math.max(...matrixForce.map((value, index) => Math.abs(value - recovered.globalEndForce[index]))) <= 1e-12);
const work = displacement.reduce((sum, value, index) => sum + value * recovered.globalEndForce[index], 0);
assert.ok(Math.abs(work - 2 * recovered.strainEnergy) <= 1e-10 * Math.max(1, Math.abs(work)));

const pchip = createMonotonePchip([-2, -1, 0, 1], [60, 84, 100, 114]);
const samples = Array.from({ length: 61 }, (_unused, index) => pchip.evaluate(-2 + 3 * index / 60).value);
assert.ok(samples.every((value, index) => index === 0 || value >= samples[index - 1] - 1e-12));
assert.ok(Math.min(...samples) >= 60 && Math.max(...samples) <= 114);

const property = createPmmHinge3dProperty({
  id: 'PMM', axialStiffness: 1e7, rotationalStiffness: 1e10,
  mu: 1e8, thetaP: 0.02, thetaPC: 0.04, rc: 1.25, rr: 0.2, interactionExponent: 1.5,
});
const response = evaluatePmmHinge3d(property, { axial: 0.02, thetaY: 0.007, thetaZ: 0.013 });
assert.ok(response.interaction.phi >= 1);
assert.ok(response.interaction.beta <= 1);
assert.equal(response.tangent.method, 'one-sided-numerical-algorithmic-difference');
const state = createPmmHinge3dState({ step: 0 });
state.setTrial({ step: 1 });
assert.deepEqual(state.commit(), { step: 1 });
state.setTrial({ step: 2 });
assert.deepEqual(state.revert(), { step: 1 });
const element = evaluateZeroLengthPmmHinge3d({ property, displacement });
assert.equal(element.equilibriumResidual, 0);
const zeroElement = evaluateZeroLengthPmmHinge3d({ property, displacement: new Array(12).fill(0) });
assert.ok(zeroElement.endForce.every((value) => value === 0), 'zero deformation must produce zero PMM hinge force');
const domainDisplacement = new Array(18).fill(0);
domainDisplacement[10] = 0.002;
domainDisplacement[11] = 0.003;
const pmmDomain = assembleZeroLengthPmmHinge3dDomain({
  nodes: [
    { id: 'A', x: 0, y: 0, z: 0 },
    { id: 'B', x: 0, y: 0, z: 0 },
    { id: 'C', x: 2, y: 0, z: 0 },
  ],
  zeroLengthPmmHinges: [{ id: 'ZH1', n1: 'A', n2: 'B', property }],
}, { displacement: domainDisplacement });
assert.equal(pmmDomain.ok, true, pmmDomain.reason);
assert.equal(pmmDomain.elementCount, 1);
assert.equal(pmmDomain.elements[0].dof.length, 12);
assert.ok(pmmDomain.internalForce.some((value) => Math.abs(value) > 0));
assert.ok(Math.abs(pmmDomain.internalForce[4] + pmmDomain.internalForce[10]) <= 1e-12);
assert.ok(Math.abs(pmmDomain.internalForce[5] + pmmDomain.internalForce[11]) <= 1e-12);

const sb12Runs = [runSb12(), runSb12(), runSb12()];
const sh1Runs = [runSh1(), runSh1(), runSh1()];
for (const [id, rows] of [['SB12', sb12Runs], ['SH1', sh1Runs]]) {
  assert.ok(rows.every((row) => row.status === 'PASS'), `${id} failed`);
  assert.equal(new Set(rows.map((row) => row.engineeringHash)).size, 1, `${id} is not deterministic`);
}

console.log(JSON.stringify({
  ok: true,
  milestone: 'P18-LINK-PMM',
  link: { matrixHash: built.matrixHash, responseHash: recovered.responseHash, modalFrequenciesHz: modal.modes.map((mode) => mode.frequencyHz) },
  pmm: { propertyHash: property.propertyHash, responseHash: response.responseHash, elementResponseHash: element.elementResponseHash, assemblyHash: pmmDomain.assemblyHash },
  cases: { SB12: sb12Runs[0].engineeringHash, SH1: sh1Runs[0].engineeringHash },
}, null, 2));

function maxSymmetryError(matrix) {
  let maximum = 0;
  for (let row = 0; row < matrix.length; row += 1) for (let column = row + 1; column < matrix.length; column += 1) {
    maximum = Math.max(maximum, Math.abs(matrix[row][column] - matrix[column][row]));
  }
  return maximum;
}
