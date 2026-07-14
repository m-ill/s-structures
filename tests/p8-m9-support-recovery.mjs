import assert from 'node:assert/strict';
import { buildCanonicalAnalysisDomain } from '../src/solver/domain/canonicalDomain.js';
import { createNonlinearStateStore } from '../src/nonlinear/core/stateStore.js';
import { buildCorotationalFrame3dEntries } from '../src/nonlinear/elements/corotationalFrame3d.js';
import { createEquilibriumAssembler } from '../src/nonlinear/equilibrium/assembler.js';
import { solveMdofNewtonStep } from '../src/nonlinear/equilibrium/newton.js';
import { createDenseReferenceBackend } from '../src/nonlinear/equilibrium/referenceBackends.js';
import { recoverIntegratedNonlinearState } from '../src/nonlinear/integration/resultRecovery.js';

const spring = await solveModel(springCantileverModel());
assert.equal(spring.integration.audits.ok, true, JSON.stringify(spring.integration.audits, null, 2));
assert.ok(Math.abs(spring.evaluation.supportReactionsFull[0] + 1) < 1e-7);
assert.equal(Object.keys(spring.evaluation.supportResponses).length, 6);
assert.ok(spring.evaluation.energies.supportSpringStrain > 0);
assert.equal(spring.integration.stories.length, 1);

const settlement = await solveModel(settlementBarModel());
const settlementSpring = settlement.evaluation.supportResponses['support-spring:B:ux'];
assert.ok(Math.abs(settlementSpring.deformation) > 0);
assert.ok(Math.abs(settlementSpring.supportReaction) > 0);
assert.equal(settlement.integration.audits.globalEquilibrium.ok, true);

const released = await solveModel(releasedBeamModel());
const releasedMember = released.integration.members.M;
assert.equal(releasedMember.audits.releasedForces.ok, true, JSON.stringify(releasedMember.audits.releasedForces));
assert.equal(releasedMember.audits.stationClosure.ok, true, JSON.stringify(releasedMember.audits.stationClosure));
assert.ok(releasedMember.stations.xs.length >= 5);

const truss = await solveModel(trussModel());
const trussForces = truss.integration.members.T.endForces;
assert.ok(Math.abs(trussForces[0]) > 0);
for (const dof of [1, 2, 3, 4, 5, 7, 8, 9, 10, 11]) assert.ok(Math.abs(trussForces[dof]) < 1e-9);

const selfWeightModel = springCantileverModel();
selfWeightModel.materials[0].density = 7.85;
selfWeightModel.analysisSettings.includeSelfWeight = true;
const selfWeightDomain = buildCanonicalAnalysisDomain(selfWeightModel, { factors: { D: 1 } });
assert.ok(selfWeightDomain.loads.some((row) => row.id === 'sw_M'));

console.log(JSON.stringify({
  ok: true,
  verificationIds: [
    'NL-INT-07', 'NL-INT-08', 'NL-INT-09', 'NL-INT-10',
    'NL-INT-11', 'NL-INT-13', 'NL-INT-14',
  ],
  springReactionX: spring.evaluation.supportReactionsFull[0],
  springEnergy: spring.evaluation.energies.supportSpringStrain,
  settlementReaction: settlementSpring.supportReaction,
  releasedMomentMaximum: releasedMember.audits.releasedForces.maximum,
  stationClosureRelative: releasedMember.audits.stationClosure.relative,
  storyCount: spring.integration.stories.length,
  selfWeightLoadCount: selfWeightDomain.loads.filter((row) => row.id.startsWith('sw_')).length,
}, null, 2));

async function solveModel(model) {
  const domain = buildCanonicalAnalysisDomain(model, { factors: { D: 1 } });
  assert.equal(domain.ok, true, domain.reason);
  const elements = buildCorotationalFrame3dEntries(domain);
  const assembler = createEquilibriumAssembler({ domain, elements });
  const stateStore = createNonlinearStateStore({
    domainHash: domain.identity.domainHash,
    initialState: { q: new Array(domain.constraint.reducedDofCount).fill(0), elementStates: {}, energies: {} },
  });
  const solved = await solveMdofNewtonStep({
    assembler,
    stateStore,
    targetLambda: 1,
    backend: createDenseReferenceBackend({ limit: 300 }),
    options: {
      maxIterations: 30,
      lineSearch: true,
      convergence: {
        forceAbsolute: 1e-6,
        forceRelative: 1e-9,
        momentAbsolute: 1e-6,
        momentRelative: 1e-9,
        displacementAbsolute: 1e-11,
        displacementRelative: 1e-9,
        rotationAbsolute: 1e-11,
        rotationRelative: 1e-9,
        energyAbsolute: 1e-10,
        energyRelative: 1e-9,
      },
    },
  });
  assert.equal(solved.ok, true, JSON.stringify({ reason: solved.reason, iterations: solved.iterations, details: solved.details }, null, 2));
  const integration = recoverIntegratedNonlinearState({ model, domain, evaluation: solved.evaluation, analysisType: 'nonlinear-static' });
  return { domain, evaluation: solved.evaluation, integration };
}

function springCantileverModel() {
  return baseModel({
    nodes: [
      { id: 'B', x: 0, y: 0, z: 0, support: 'spring', spring: sixSprings(10000, 1e8) },
      { id: 'T', x: 0, y: 0, z: 3 },
    ],
    members: [frame('M', 'B', 'T')],
    loads: [{ id: 'PX', type: 'nodal', node: 'T', P: 1, direction: [1, 0, 0], case: 'D' }],
  });
}

function settlementBarModel() {
  return baseModel({
    nodes: [
      { id: 'A', x: 0, y: 0, z: 0, support: 'fixed' },
      {
        id: 'B', x: 2, y: 0, z: 0, support: 'spring', spring: sixSprings(5000, 1e8),
        settlement: { ux: 0.001 },
      },
    ],
    members: [frame('M', 'A', 'B')],
    loads: [],
  });
}

function releasedBeamModel() {
  return baseModel({
    nodes: [
      { id: 'A', x: 0, y: 0, z: 0, support: 'fixed' },
      { id: 'B', x: 4, y: 0, z: 0, support: 'pin' },
    ],
    members: [{ ...frame('M', 'A', 'B'), releases: { i: 'rigid', j: 'pin' } }],
    loads: [{ id: 'W', type: 'udl', member: 'M', w: 2, dir: '-z', case: 'D' }],
  });
}

function trussModel() {
  return baseModel({
    nodes: [
      { id: 'A', x: 0, y: 0, z: 0, support: 'fixed' },
      { id: 'B', x: 2, y: 0, z: 0, support: 'custom', fix: [false, true, true, true, true, true] },
    ],
    members: [{ ...frame('T', 'A', 'B'), type: 'truss', behavior: 'truss' }],
    loads: [{ id: 'PX', type: 'nodal', node: 'B', P: 2, direction: [1, 0, 0], case: 'D' }],
  });
}

function baseModel({ nodes, members, loads }) {
  return {
    schemaVersion: 5,
    unitSystem: { length: 'm', force: 'kN', mass: 'tonne', time: 's' },
    nodes,
    members,
    materials: [{ id: 'MAT', E: 210e6, G: 80e6, density: 0 }],
    sections: [{ id: 'SEC', A: 0.02, Iy: 8e-5, Iz: 1.2e-4, J: 3e-5 }],
    loads,
    loadCases: [{ id: 'D', name: 'Dead', type: 'dead' }],
    loadCombinations: [{ id: 'D1', name: 'Dead', type: 'service', factors: { D: 1 } }],
    analysisSettings: { includeSelfWeight: false },
  };
}

function frame(id, n1, n2) {
  return {
    id, type: 'frame', behavior: 'frame', n1, n2, matId: 'MAT', secId: 'SEC',
    localAxis: { refVector: [0, 1, 0], roll: 0, strongAxis: 'z' },
  };
}

function sixSprings(translation, other) {
  return { kx: translation, ky: other, kz: other, krx: other, kry: other, krz: other };
}
