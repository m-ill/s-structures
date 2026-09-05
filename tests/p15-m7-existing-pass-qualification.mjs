import assert from 'node:assert/strict';
import {
  blockPhase15ExistingPassQualification,
  generalizedEigenResidual,
  massWeightedMac,
  maximumMassOrthogonality,
  qualifyPhase15Pd1,
  qualifyPhase15Sb1,
  qualifyPhase15Sb8,
  qualifyPhase15Sb9,
  qualifyPhase15Sb10,
  qualifyPhase15Sm5,
} from '../verification/framework/phase15/index.js';

const binding = Object.freeze({
  referenceHash: 'a'.repeat(64),
  toleranceHash: 'b'.repeat(64),
  probeHash: 'c'.repeat(64),
});

const sb1Input = {
  binding,
  levels: [1, 2, 4, 8].map((elements) => ({
    elements,
    tipDisplacement: -0.107865,
    tipRotation: 5.3933e-5,
    supportReaction: 1000,
    supportMoment: -3e6,
    strainEnergy: 0.5,
    externalWork: 1,
    equilibriumResidual: 1e-12,
  })),
  references: {
    tipDisplacement: -0.107865,
    tipRotation: 5.3933e-5,
    supportReaction: 1000,
    supportMoment: -3e6,
  },
};
const sb1 = qualifyPhase15Sb1(sb1Input);
assert.equal(sb1.status, 'PASS');
assert.deepEqual(sb1.audit.lineage, [1, 2, 4, 8]);
const sb1EnergyMutation = structuredClone(sb1Input);
sb1EnergyMutation.levels[2].externalWork = 0.8;
assert.equal(qualifyPhase15Sb1(sb1EnergyMutation).status, 'FAIL');
const sb1MissingEnergy = structuredClone(sb1Input);
delete sb1MissingEnergy.levels[1].externalWork;
assert.equal(qualifyPhase15Sb1(sb1MissingEnergy).status, 'FAIL', 'partial lineage evidence must fail closed');

const sb8References = [102.149414, 364.059185, 706.690082, 1078.102736, 1455.799333, 1832.019784];
const sb8Input = {
  binding,
  references: sb8References,
  scope: {
    formulation: 'timoshenko-2node',
    shearDeformation: true,
    mass: 'lumped-translational',
    rotaryInertia: false,
  },
  levels: [32, 64, 128, 256].map((elements, levelIndex) => ({
    elements,
    massOrthogonalityMax: 1e-12,
    modes: sb8References.map((frequencyHz, modeIndex) => ({
      frequencyHz: frequencyHz * (1 + [0.002, 0.001, 0.0005, 0][levelIndex]),
      eigenResidual: 1e-10 * (modeIndex + 1),
      generalizedMass: 1 + 1e-11 * (modeIndex + 1),
      macToReference: 0.9999,
    })),
  })),
};
const sb8 = qualifyPhase15Sb8(sb8Input);
assert.equal(sb8.status, 'PASS');
assert.equal(sb8.audit.modalAudits.length, 4);
const sb8MacMutation = structuredClone(sb8Input);
sb8MacMutation.levels.at(-1).modes[3].macToReference = 0.8;
assert.equal(qualifyPhase15Sb8(sb8MacMutation).status, 'FAIL');
const sb8MissingResidual = structuredClone(sb8Input);
delete sb8MissingResidual.levels[1].modes[2].eigenResidual;
assert.equal(qualifyPhase15Sb8(sb8MissingResidual).status, 'FAIL', 'partial modal audit must fail closed');

const sb9Input = {
  binding,
  references: { bending: -69.179684, axial: -0.193149, combined: -69.372833 },
  levels: [1, 2, 4].map((elements, levelIndex) => ({
    elements,
    bending: -69.179684,
    axial: -0.193149,
    combined: -69.372833,
    componentRuns: {
      bending: { executed: true, calculationHash: `${levelIndex + 1}`.repeat(64) },
      axial: { executed: true, calculationHash: `${levelIndex + 4}`.repeat(64) },
      combined: { executed: true, calculationHash: `${levelIndex + 7}`.repeat(64) },
    },
  })),
};
const sb9 = qualifyPhase15Sb9(sb9Input);
assert.equal(sb9.status, 'PASS');
assert.ok(sb9.audit.maximumComponentIdentityResidual < 1e-15);
const sb9CancellationMutation = structuredClone(sb9Input);
sb9CancellationMutation.levels.at(-1).bending += 2;
sb9CancellationMutation.levels.at(-1).axial -= 2;
const sb9Mutated = qualifyPhase15Sb9(sb9CancellationMutation);
assert.equal(sb9Mutated.audit.maximumComponentIdentityResidual < 1e-15, true, 'component cancellation preserves only the sum identity');
assert.equal(sb9Mutated.status, 'FAIL', 'signed component metrics must kill offsetting component mutations');
const sb9StaleRunMutation = structuredClone(sb9Input);
sb9StaleRunMutation.levels[1].componentRuns.bending.calculationHash = sb9StaleRunMutation.levels[0].componentRuns.bending.calculationHash;
assert.equal(qualifyPhase15Sb9(sb9StaleRunMutation).status, 'FAIL', 'a calculation hash cannot be reused across component or mesh runs');

const sb10Responses = [
  response('brace-e1-axial', -10000, 'brace E1 axial force', 'N', 'member-local-x', 'tension-positive'),
  response('brace-e2-axial', -20000, 'brace E2 axial force', 'N', 'member-local-x', 'tension-positive'),
  response('apex-displacement-x', -0.25, 'apex displacement x', 'mm', 'global-x', 'positive-global-x'),
  response('apex-displacement-z', -0.5, 'apex displacement z', 'mm', 'global-z', 'positive-global-z'),
  response('support-n1-reaction-x', -6000, 'support N1 reaction x', 'N', 'global-x', 'positive-global-x'),
  response('support-n1-reaction-z', 8000, 'support N1 reaction z', 'N', 'global-z', 'positive-global-z'),
  response('support-n2-reaction-x', 16000, 'support N2 reaction x', 'N', 'global-x', 'positive-global-x'),
  response('support-n2-reaction-z', 12000, 'support N2 reaction z', 'N', 'global-z', 'positive-global-z'),
];
const sb10Input = { binding, responses: sb10Responses, equilibriumResidual: 1e-12 };
const sb10 = qualifyPhase15Sb10(sb10Input);
assert.equal(sb10.status, 'PASS');
assert.ok(sb10.audit.magnitudeMutationMetrics.length >= 1);
assert.ok(sb10.audit.magnitudeMutationMetrics.every((metric) => metric.status === 'FAIL'));
const sb10SignMutation = structuredClone(sb10Input);
sb10SignMutation.responses[0].actual *= -1;
assert.equal(qualifyPhase15Sb10(sb10SignMutation).status, 'FAIL');

const pd1References = {
  displacementWithoutTension: -1.041667,
  momentWithoutTension: 22.5,
  displacementWithTension: -0.543305,
  momentWithTension: 11.498079,
};
const pd1Runs = [];
for (const elements of [8, 16, 32]) for (const loadSteps of [2, 4, 8]) {
  const perturbation = (32 / elements - 1) * 1e-5 + (8 / loadSteps - 1) * 1e-5;
  pd1Runs.push({
    elements,
    loadSteps,
    converged: true,
    responses: Object.fromEntries(Object.entries(pd1References).map(([key, value]) => [key, value * (1 + perturbation)])),
    stages: Array.from({ length: loadSteps }, () => ({
      converged: true,
      forceResidual: 1e-10,
      momentResidual: 2e-10,
      workBalanceResidual: 5e-9,
    })),
  });
}
const pd1Input = { binding, references: pd1References, runs: pd1Runs };
const pd1 = qualifyPhase15Pd1(pd1Input);
assert.equal(pd1.status, 'PASS');
assert.deepEqual(pd1.audit.meshLineage, [8, 16, 32]);
assert.deepEqual(pd1.audit.loadStepLineage, [2, 4, 8]);
const pd1WorkMutation = structuredClone(pd1Input);
pd1WorkMutation.runs[0].stages[0].workBalanceResidual = 1e-2;
assert.equal(qualifyPhase15Pd1(pd1WorkMutation).status, 'FAIL');

const identity = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const stiffness = [[1, 0, 0], [0, 4, 0], [0, 0, 9]];
const basis = identity.map((row) => row.slice());
const gammas = [0.8, 0.5, 0.3];
const sm5Input = {
  binding,
  independentReference: true,
  references: [1, 4, 9],
  referenceModes: basis,
  massMatrix: identity,
  stiffnessMatrix: stiffness,
  massUnit: 't',
  expectedMassUnit: 't',
  modes: basis.map((vector, index) => ({
    eigenvalue: [1, 4, 9][index],
    vector,
    participation: {
      x: {
        gamma: gammas[index],
        modalMass: 1,
        effectiveMass: gammas[index] ** 2,
        massRatio: gammas[index] ** 2,
      },
    },
  })),
};
const sm5 = qualifyPhase15Sm5(sm5Input);
assert.equal(sm5.status, 'PASS');
assert.ok(sm5.audit.eigenResiduals.every((value) => value === 0));
assert.ok(sm5.audit.massWeightedMac.every((value) => value === 1));
assert.equal(massWeightedMac([1, 0], [-2, 0], [2, 3]), 1, 'MAC is orientation invariant');
assert.equal(generalizedEigenResidual([[2, 0], [0, 8]], [[2, 0], [0, 2]], [1, 0], 1), 0);
assert.equal(maximumMassOrthogonality([[1, 0], [0, 1]], [2, 3]), 0);
const sm5ModeMutation = structuredClone(sm5Input);
sm5ModeMutation.referenceModes[0] = [0, 1, 0];
assert.equal(qualifyPhase15Sm5(sm5ModeMutation).status, 'FAIL');
const sm5UnitMutation = structuredClone(sm5Input);
sm5UnitMutation.massUnit = 'kg';
assert.equal(qualifyPhase15Sm5(sm5UnitMutation).status, 'FAIL');
const blockedSm5 = blockPhase15ExistingPassQualification('SM5', ['SM5_INDEPENDENT_REFERENCE_MODES_UNAVAILABLE'], {
  actualResidualAuditCompleted: true,
});
assert.equal(blockedSm5.status, 'BLOCKED');
assert.equal(blockedSm5.mandatoryGates[0].status, 'BLOCKED');
assert.match(blockedSm5.qualificationHash, /^[0-9a-f]{64}$/);

console.log(JSON.stringify({
  ok: true,
  milestone: 'P15-M7',
  qualifiedCases: [sb1, sb8, sb9, sb10, pd1, sm5].map((row) => row.caseId),
  mutationKillCount: 10,
  contracts: ['signed-response', 'lineage', 'equilibrium', 'energy', 'MAC', 'mass-orthogonality', 'participation', 'work-balance'],
}, null, 2));

function response(id, reference, quantity, unit, axis, signConvention) {
  return { id, actual: reference, reference, quantity, unit, axis, signConvention };
}
