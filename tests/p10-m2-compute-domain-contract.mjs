import assert from 'node:assert/strict';
import {
  DOMAIN_BINARY_VERSION,
  domainBinaryTransferables,
  packDomainBinary,
  unpackDomainBinary,
  validateDomainBinary,
} from '../src/compute/contracts/domainBinary.js';
import { classifyElasticFactorGroups } from '../src/compute/elastic/factorGroups.js';
import { buildAnalysisDomainHashes, changedAnalysisDomainHashes } from '../src/core/analysisDomainHashes.js';
import { buildElementDescriptors } from '../src/solver/domain/elementDescriptor.js';
import { referenceFrameMatrixBatch } from '../src/compute/backends/webgpu/cpuReference.js';
import { estimateGlobalBucklingTrace } from '../src/dynamics/globalBuckling.js';
import { analyzeDynamics } from '../src/dynamics/modal.js';
import { buildNonlinearTangentAssembly } from '../src/nonlinear/assembly.js';
import { localK12 } from '../src/solver/linear3dElement.js';
import { analyzeModel } from '../src/solver/linear3d.js';
import { buildPDeltaTangentStiffness } from '../src/solver/pdelta/tangentStiffness.js';
import { createReferenceSpdGpuSession, executeProductionElastic } from '../src/compute/index.js';

const model = {
  schemaVersion: 5,
  units: { length: 'm', force: 'kN', moment: 'kN.m' },
  analysisSettings: { shearDeformation: true, validateBeforeSolve: false },
  nodes: [
    { id: 'N1', x: 0, y: 0, z: 0, support: 'fixed' },
    { id: 'N2', x: 2.4, y: 0, z: 0 },
  ],
  members: [{
    id: 'M1', type: 'frame', n1: 'N1', n2: 'N2', matId: 'MAT', secId: 'SEC',
    releases: { i: 'rigid', j: 'rigid' },
  }],
  materials: [{ id: 'MAT', E: 30000, G: 12500, Fy: 400, density: 0 }],
  sections: [{
    id: 'SEC', type: 'direct', A: 0.18, Iy: 0.00135, Iz: 0.0054, J: 0.0037,
    Ay: 0.15, Az: 0.12,
  }],
  loads: [{
    id: 'P1', type: 'point', member: 'M1', P: 120, t: 0.5,
    direction: [0, -1, 0], coordinate: 'local', case: 'D',
  }],
  loadCases: [{ id: 'D', type: 'dead' }],
  loadCombinations: [{ id: 'C1', factors: { D: 1 } }],
};

const domain = packDomainBinary(model);
assert.equal(validateDomainBinary(domain).ok, true, 'P10-M2 DomainBinary must validate');
assert.equal(DOMAIN_BINARY_VERSION, 'p10-domain-binary-v3');
assert.equal(domain.buffers.sectionProperties.length, 4, 'legacy four-wide section properties stay compatible');
assert.deepEqual([...domain.buffers.sectionShearAreas], [0.15, 0.12]);
assert.deepEqual([...domain.buffers.analysisFlags], [1]);
assert.deepEqual([...domain.buffers.memberShearDeformation], [1]);
assert.deepEqual([...domain.buffers.memberRotationalSprings], [0, 0, 0, 0]);
assert.deepEqual([...domain.buffers.memberRotationalSpringMask], [0]);
assert.deepEqual(domain.metadata.bufferLayouts.sectionShearAreas, ['Ay', 'Az']);
assert.deepEqual(domain.metadata.bufferLayouts.memberReleaseCodes, ['i', 'j']);
assert.deepEqual(domain.metadata.bufferLayouts.memberRotationalSprings, ['ryI', 'rzI', 'ryJ', 'rzJ']);
assert.deepEqual(domain.metadata.bufferLayouts.memberRotationalSpringMask, {
  encoding: 'presence-bitmask',
  bits: { ryI: 0, rzI: 1, ryJ: 2, rzJ: 3 },
  absent: 'rigid',
  presentZero: 'release',
});

const explicitZeroModel = structuredClone(model);
explicitZeroModel.members[0].releases.spring = { ryI: 0 };
const explicitZeroDomain = packDomainBinary(explicitZeroModel);
assert.deepEqual([...explicitZeroDomain.buffers.memberRotationalSprings], [0, 0, 0, 0]);
assert.deepEqual([...explicitZeroDomain.buffers.memberRotationalSpringMask], [0b0001]);
assert.notEqual(
  explicitZeroDomain.domainHash,
  domain.domainHash,
  'an explicit zero release hashes differently from an absent rigid connection',
);

const partialFixityModel = structuredClone(model);
partialFixityModel.members[0].releases.spring = { ryI: 0, rzI: 1250, rzJ: 4800 };
const partialFixityDomain = packDomainBinary(partialFixityModel);
assert.equal(validateDomainBinary(partialFixityDomain).ok, true, 'partial-fixity DomainBinary must validate');
assert.deepEqual([...partialFixityDomain.buffers.memberRotationalSprings], [0, 1250, 0, 4800]);
assert.deepEqual(
  [...partialFixityDomain.buffers.memberRotationalSpringMask],
  [0b1011],
  'presence mask distinguishes an explicit zero spring from an absent component',
);
assert.deepEqual(unpackDomainBinary(partialFixityDomain).members[0].releases, {
  i: 'rigid',
  j: 'rigid',
  spring: { ryI: 0, rzI: 1250, rzJ: 4800 },
});
assert.notEqual(partialFixityDomain.domainHash, domain.domainHash, 'partial fixity participates in the domain hash');
assert.ok(
  domainBinaryTransferables(partialFixityDomain).includes(partialFixityDomain.buffers.memberRotationalSprings.buffer),
  'rotational spring values are transferable',
);
assert.ok(
  domainBinaryTransferables(partialFixityDomain).includes(partialFixityDomain.buffers.memberRotationalSpringMask.buffer),
  'rotational spring presence mask is transferable',
);
const corruptPartialFixityDomain = {
  ...partialFixityDomain,
  buffers: {
    ...partialFixityDomain.buffers,
    memberRotationalSpringMask: new Uint8Array([0b10000]),
  },
};
assert.ok(
  validateDomainBinary(corruptPartialFixityDomain).errors.includes('domain:member-rotational-spring-mask'),
  'unknown presence bits fail closed',
);
assert.throws(() => packDomainBinary({
  ...partialFixityModel,
  members: [{ ...partialFixityModel.members[0], releases: { spring: { ryI: -1 } } }],
}), { code: 'DOMAIN_ROTATIONAL_SPRING_INVALID' }, 'negative rotational stiffness fails closed');

const inferredModel = structuredClone(model);
delete inferredModel.sections[0].Ay;
delete inferredModel.sections[0].Az;
assert.deepEqual(
  [...packDomainBinary(inferredModel).buffers.sectionShearAreas],
  [0.162, 0.162],
  'DomainBinary must pack the same GENERAL 0.9A fallback consumed by the solver',
);
const parametricModel = structuredClone(model);
parametricModel.sections[0] = {
  id: 'SEC', kind: 'parametric', shape: 'RECT', params: { B: 300, H: 600 },
};
const parametricDomain = packDomainBinary(parametricModel);
assert.ok(Math.abs(parametricDomain.buffers.sectionProperties[0] - 0.18) < 1e-14);
assert.deepEqual([...parametricDomain.buffers.sectionShearAreas], [0.15, 0.15]);

const memberDisabled = structuredClone(model);
memberDisabled.members[0].shearDeformation = false;
const memberDisabledDomain = packDomainBinary(memberDisabled);
assert.deepEqual([...memberDisabledDomain.buffers.analysisFlags], [1]);
assert.deepEqual([...memberDisabledDomain.buffers.memberShearDeformation], [0], 'member override wins');
assert.notEqual(domain.domainHash, memberDisabledDomain.domainHash, 'member formulation participates in domain hash');

const legacyEnabled = structuredClone(model);
delete legacyEnabled.analysisSettings.shearDeformation;
legacyEnabled.analysisSettings.includeShearDeformation = true;
assert.deepEqual([...packDomainBinary(legacyEnabled).buffers.analysisFlags], [1], 'legacy global alias remains readable');

const descriptor = buildElementDescriptors(model).descriptors[0];
assert.equal(descriptor.formulation.bending, 'timoshenko-2node-exact-static');
assert.equal(descriptor.formulation.shearDeformation.enabled, true);
assert.ok(Math.abs(descriptor.formulation.shearDeformation.phiZ - 0.18) < 1e-14);
assert.ok(Math.abs(descriptor.formulation.shearDeformation.phiY - 0.05625) < 1e-14);
assert.equal(
  descriptor.formulation.shearDeformation.geometricStiffness.limitationCode,
  'TIMOSHENKO_CONSISTENT_KG_NOT_IMPLEMENTED',
);
const disabledDescriptor = buildElementDescriptors(memberDisabled).descriptors[0];
assert.equal(disabledDescriptor.formulation.bending, 'euler-bernoulli');
assert.notEqual(descriptor.propertyHash, disabledDescriptor.propertyHash, 'formulation participates in descriptor property hash');
const trussModel = structuredClone(model);
trussModel.members[0].type = 'truss';
const trussDescriptor = buildElementDescriptors(trussModel).descriptors[0];
assert.equal(trussDescriptor.formulation.bending, 'not-applicable-axial-only');
assert.equal(trussDescriptor.formulation.shearDeformation.enabled, false);
assert.deepEqual([...packDomainBinary(trussModel).buffers.memberShearDeformation], [0]);

const baseHashes = buildAnalysisDomainHashes(model);
const disabledHashes = buildAnalysisDomainHashes(memberDisabled);
assert.deepEqual(changedAnalysisDomainHashes(baseHashes, disabledHashes), ['propertyHash']);
const customA = structuredClone(model);
const customB = structuredClone(model);
customA.members[0].customProps = { Ay: 0.1, Az: 0.11 };
customB.members[0].customProps = { Ay: 0.2, Az: 0.21 };
assert.notEqual(
  buildAnalysisDomainHashes(customA).propertyHash,
  buildAnalysisDomainHashes(customB).propertyHash,
  'member custom shear properties must invalidate the property domain',
);
assert.notEqual(packDomainBinary(customA).domainHash, packDomainBinary(customB).domainHash);

const combos = model.loadCombinations;
const baseFactorPlan = classifyElasticFactorGroups(model, combos);
const disabledFactorPlan = classifyElasticFactorGroups(memberDisabled, combos);
assert.notEqual(
  baseFactorPlan.baseStiffnessHash,
  disabledFactorPlan.baseStiffnessHash,
  'factorization identity must invalidate on member shear override',
);
const globalDisabled = structuredClone(model);
globalDisabled.analysisSettings.shearDeformation = false;
assert.notEqual(
  baseFactorPlan.baseStiffnessHash,
  classifyElasticFactorGroups(globalDisabled, combos).baseStiffnessHash,
  'factorization identity must invalidate on global shear setting',
);

const identity = Array.from({ length: 144 }, (_value, index) => (index % 13 === 0 ? 1 : 0));
const shadow = referenceFrameMatrixBatch({
  properties: [30e6, 12.5e6, 0.18, 0.00135, 0.0054, 0.0037, 2.4, 0.05625, 0.18],
  propertyStride: 9,
  responseTransforms: identity,
});
const expectedLocal = localK12(30e6, 12.5e6, 0.18, 0.00135, 0.0054, 0.0037, 2.4, 0.05625, 0.18).flat();
let matrixRelativeError = 0;
for (let i = 0; i < shadow.length; i += 1) {
  matrixRelativeError = Math.max(matrixRelativeError, Math.abs(shadow[i] - expectedLocal[i]) / Math.max(1, Math.abs(expectedLocal[i])));
}
assert.ok(matrixRelativeError < 5e-6, `Timoshenko frame shadow matrix relative error ${matrixRelativeError}`);
assert.throws(() => referenceFrameMatrixBatch({
  properties: [30e6, 12.5e6, 0.18, 0.00135, 0.0054, 0.0037, 2.4, -0.1, 0.18],
  propertyStride: 9,
  responseTransforms: identity,
}), { code: 'WEBGPU_FRAME_PHI_INVALID' }, 'CPU reference and WebGPU preflight share the negative-Phi error contract');

// Every secondary analysis route must consume the same Timoshenko elastic
// stiffness and surface the documented Euler-Bernoulli Kg approximation.
const modalShearModel = structuredClone(model);
modalShearModel.loads = [];
modalShearModel.nodes[1].mass = 10;
const modalEbModel = structuredClone(modalShearModel);
modalEbModel.analysisSettings.shearDeformation = false;
const modalShear = analyzeDynamics(modalShearModel, { modalModeCount: 2 });
const modalEb = analyzeDynamics(modalEbModel, { modalModeCount: 2 });
assert.equal(modalShear.ok, true);
assert.equal(modalEb.ok, true);
assert.ok(modalShear.modes[0].frequencyHz < modalEb.modes[0].frequencyHz, 'Timoshenko modal frequency must be lower than EB');
assert.ok(modalShear.modes[0].period > modalEb.modes[0].period, 'Timoshenko modal period must be longer than EB');

const axialForces = { M1: -100 };
const pdeltaShear = buildPDeltaTangentStiffness(model, { axialForces });
const pdeltaEb = buildPDeltaTangentStiffness(globalDisabled, { axialForces });
assert.equal(pdeltaShear.ok, true);
assert.equal(pdeltaEb.ok, true);
assert.notEqual(pdeltaShear.Kt[1][1], pdeltaEb.Kt[1][1], 'Direct P-Delta must consume Timoshenko Ke');
assert.equal(pdeltaShear.summary.timoshenkoApproximationCount, 1);
assert.deepEqual(pdeltaShear.summary.limitationCodes, ['TIMOSHENKO_CONSISTENT_KG_NOT_IMPLEMENTED']);
assert.equal(pdeltaEb.summary.timoshenkoApproximationCount, 0);

const nonlinearShear = buildNonlinearTangentAssembly(model, {}, { axialForces });
const nonlinearEb = buildNonlinearTangentAssembly(globalDisabled, {}, { axialForces });
assert.equal(nonlinearShear.ok, true);
assert.equal(nonlinearEb.ok, true);
assert.notEqual(nonlinearShear.K[1][1], nonlinearEb.K[1][1], 'Nonlinear tangent must consume Timoshenko Ke');
assert.equal(nonlinearShear.summary.timoshenkoApproximationCount, 1);
assert.deepEqual(nonlinearShear.summary.limitationCodes, ['TIMOSHENKO_CONSISTENT_KG_NOT_IMPLEMENTED']);
assert.ok(nonlinearShear.limitations.includes('TIMOSHENKO_CONSISTENT_KG_NOT_IMPLEMENTED'));

const bucklingModel = structuredClone(model);
bucklingModel.loads = [{
  id: 'N-COMP', type: 'nodal', node: 'N2', P: 100, dir: '-x', case: 'D',
}];
const qualifiedPreload = analyzeModel(bucklingModel);
assert.equal(qualifiedPreload.ok, true);
assert.equal(qualifiedPreload.analysisEligibility.status, 'qualified');
const buckling = estimateGlobalBucklingTrace(bucklingModel, {
  preloadResult: qualifiedPreload,
  preloadCombinationId: 'C1',
  modeCount: 1,
});
assert.equal(buckling.ok, true);
assert.equal(buckling.preload.qualification.status, 'qualified');
assert.equal(buckling.geometricStiffness.timoshenkoApproximationCount, 1);
assert.deepEqual(buckling.geometricStiffness.limitationCodes, ['TIMOSHENKO_CONSISTENT_KG_NOT_IMPLEMENTED']);
assert.ok(buckling.limitations.includes('TIMOSHENKO_CONSISTENT_KG_NOT_IMPLEMENTED'));

// Production adapter parity exercises the qualified elastic route, including the
// descriptor-driven Timoshenko stiffness and consistent member-load vector.
const cpu = analyzeModel(model);
assert.equal(cpu.ok, true);
const production = await executeProductionElastic({ model, computeTarget: 'gpu' }, {
  ...noOpContext(),
  gpuSessionFactory: (matrix, defaults) => createReferenceSpdGpuSession(matrix, defaults),
});
assert.equal(production.execution.target, 'gpu');
assert.equal(production.execution.fallbackUsed, false);
assert.equal(production.execution.resourceBalanced, true);
compareNumericTree(production.result.byCombo.C1.disp, cpu.byCombo.C1.disp, 1e-8, 'production.C1.disp');
compareNumericTree(production.result.byCombo.C1.reactions, cpu.byCombo.C1.reactions, 1e-8, 'production.C1.reactions');
compareNumericTree(production.result.byCombo.C1.memberResults, cpu.byCombo.C1.memberResults, 1e-8, 'production.C1.memberResults');
compareNumericTree(production.result.envelope, cpu.envelope, 1e-8, 'production.envelope');

console.log('P10-M2 compute/domain contract: PASS');

function noOpContext() {
  return {
    signal: { aborted: false },
    throwIfCancelled() {},
    reportProgress() {},
    commitBoundary() {},
    yieldControl() { return Promise.resolve(); },
  };
}

function compareNumericTree(actual, expected, tolerance, path) {
  if (typeof expected === 'number') {
    if (!Number.isFinite(expected)) {
      assert.ok(Object.is(actual, expected), `${path}: ${actual} vs ${expected}`);
      return;
    }
    assert.ok(Number.isFinite(actual), `${path}: finite`);
    assert.ok(Math.abs(actual - expected) <= tolerance, `${path}: ${actual} vs ${expected}`);
    return;
  }
  if (expected == null || typeof expected !== 'object') return;
  if (Array.isArray(expected)) {
    assert.equal(actual.length, expected.length, `${path}.length`);
    expected.forEach((value, index) => compareNumericTree(actual[index], value, tolerance, `${path}[${index}]`));
    return;
  }
  for (const [key, value] of Object.entries(expected)) {
    compareNumericTree(actual[key], value, tolerance, `${path}.${key}`);
  }
}
