import assert from 'node:assert/strict';
import { analyzeDynamics, createModel, runAnalysisCase } from '../src/index.js';

const E = 22.7e3;
const nu = 0.3;
const density = 2.4;
const thickness = 0.2;
const span = 2;
const divisions = 4;
const model = plateModel();
model.analysisSettings.modalModeCount = 1;
model.analysisSettings.responseSpectrum = {
  enabled: true,
  dampingRatio: 0.05,
  scale: 9.80665,
  directions: ['z'],
  points: [{ period: 0, sa: 0.4 }, { period: 5, sa: 0.4 }],
};

const result = analyzeDynamics(model);
assert.equal(result.ok, true, result.reason);
assert.equal(result.designBlocked, true);
assert.equal(result.shellFemQualification.numericalQualificationStatus, 'PASS');
assert.equal(result.shellFemQualification.designTransferAllowed, false);
assert.ok(result.designBlockers.includes('SHELL_MODEL_MESH_CONVERGENCE_REQUIRED'));
assert.equal(result.condensation.status, 'available');
assert.ok(result.condensation.maxRelativeEquilibriumResidual < 1e-12);
assert.equal(result.modes.length, 1);
assert.ok(result.modes[0].participation.z.massRatio > 0.9);

// Reissner-Mindlin (no rotary inertia) fundamental sinusoidal reference.
const D = E * thickness ** 3 / (12 * (1 - nu ** 2));
const G = E / (2 * (1 + nu));
const lambda = Math.PI ** 2 * (2 / span ** 2);
const compliance = 1 / (D * lambda ** 2) + 1 / ((5 / 6) * G * thickness * lambda);
// Repository dynamics units are kN, m, t, so kN/t contributes 1000 m/s².
const referenceOmega = Math.sqrt(1000 / (density * thickness * compliance));
const modalRelativeError = Math.abs(result.modes[0].omega - referenceOmega) / referenceOmega;
assert.ok(modalRelativeError < 0.1, `MITC4 modal error ${modalRelativeError}`);

const rsa = result.rsa.combined.z;
assert.ok(Number.isFinite(rsa.displacement) && rsa.displacement > 0);
assert.ok(Number.isFinite(rsa.baseShear) && rsa.baseShear > 0);
assert.ok(rsa.participatingMassRatio > 0.9);
// Shell modal forces are intentionally not promoted to member-design forces.
assert.equal(rsa.memberForceRecoveryStatus, 'unsupported');
assert.equal(rsa.memberForces.designBlocked, true);

const selfWeightMassModel = plateModel();
selfWeightMassModel.analysisSettings.modalModeCount = 1;
selfWeightMassModel.analysisSettings.responseSpectrum = { enabled: false };
selfWeightMassModel.analysisSettings.massSource = {
  combos: [],
  includeNodeMass: true,
  includeSelfWeight: true,
};
const selfWeightMassResult = analyzeDynamics(selfWeightMassModel);
assert.equal(selfWeightMassResult.ok, true, selfWeightMassResult.reason);
assert.equal(selfWeightMassResult.mass.massSource.physicalShellMassIncluded, true);
assert.ok(Math.abs(selfWeightMassResult.mass.massSource.totalMass - density * thickness * span ** 2) < 1e-12);
assert.ok(Math.abs(selfWeightMassResult.mass.total[2] - result.mass.total[2]) < 1e-12);
assert.ok(Math.abs(selfWeightMassResult.modes[0].omega - result.modes[0].omega) / result.modes[0].omega < 1e-12);
assert.equal(
  selfWeightMassResult.mass.massSource.rows.some((row) => row.sources.some((source) => source.includes('shellFemConnectivity'))),
  false,
);
assert.ok(selfWeightMassResult.mass.massSource.skipped.some((row) => row.reason === 'generated-or-massless-member'));

const strictCriteriaModel = plateModel();
strictCriteriaModel.shells = strictCriteriaModel.shells.map((shell) => ({ ...shell, formulation: 'shell' }));
strictCriteriaModel.analysisSettings.responseSpectrum = { enabled: false };
strictCriteriaModel.analysisSettings.modalModeCount = 1;
strictCriteriaModel.analysisCriteria = {
  ...strictCriteriaModel.analysisCriteria,
  criteria: {
    ...strictCriteriaModel.analysisCriteria.criteria,
    shell: {
      ...strictCriteriaModel.analysisCriteria.criteria.shell,
      drillingStiffnessRatioMax: 1e-10,
    },
  },
};
const strictCriteriaResult = analyzeDynamics(strictCriteriaModel);
assert.equal(strictCriteriaResult.ok, true);
assert.equal(strictCriteriaResult.designBlocked, true);
assert.equal(strictCriteriaResult.shellFemQualification.numericalQualificationStatus, 'BLOCKED');
assert.ok(strictCriteriaResult.shellFemQualification.blockers.includes('SHELL_DRILLING_STIFFNESS_RATIO_EXCEEDED'));

const routedModal = runAnalysisCase(model, {
  id: 'P10-M9B-SHELL-MODAL',
  kind: 'modal',
  settings: { modalModeCount: 1 },
});
assert.equal(routedModal.ok, true);
assert.equal(routedModal.status, 'review-required');
assert.equal(routedModal.qualification, 'blocked');
assert.equal(routedModal.designBlocked, true);
assert.equal(routedModal.summary.ok, false);
assert.equal(routedModal.summary.shellFemQualification.designTransferAllowed, false);

export const M9B_DYNAMICS_SNAPSHOT = Object.freeze({
  version: 'p10-m9b-mitc4-modal-rsa-v1',
  divisions,
  computedOmega: result.modes[0].omega,
  referenceOmega,
  modalRelativeError,
  participatingMassRatio: result.modes[0].participation.z.massRatio,
  rsaDisplacement: rsa.displacement,
  rsaBaseShear: rsa.baseShear,
  memberForceRecoveryStatus: rsa.memberForceRecoveryStatus,
});

console.log(JSON.stringify({ ok: true, ...M9B_DYNAMICS_SNAPSHOT }, null, 2));

function plateModel() {
  const nodes = [];
  for (let j = 0; j <= divisions; j += 1) for (let i = 0; i <= divisions; i += 1) {
    const edge = i === 0 || j === 0 || i === divisions || j === divisions;
    nodes.push({
      id: nodeId(i, j),
      x: span * i / divisions,
      y: span * j / divisions,
      z: 0,
      support: 'custom',
      fix: [true, true, edge, false, false, true],
    });
  }
  const shells = [];
  for (let j = 0; j < divisions; j += 1) for (let i = 0; i < divisions; i += 1) {
    shells.push({
      id: `P${i}-${j}`,
      nodeIds: [nodeId(i, j), nodeId(i + 1, j), nodeId(i + 1, j + 1), nodeId(i, j + 1)],
      formulation: 'plate',
      matId: 'concrete',
      thickness,
    });
  }
  return createModel({ nodes, members: [], shells });
}

function nodeId(i, j) { return `N${i}-${j}`; }
