import assert from 'node:assert/strict';
import {
  PARTIAL_FIXITY_LIMITATION_CODES,
  analyzeDynamics,
  analyzeModel,
  analyzePDeltaCombinations,
  buildElementDescriptors,
  buildPDeltaTangentStiffness,
  createModel,
  estimateGlobalBucklingTrace,
  evaluateNonlinearIntegrationCapabilities,
  runSecondOrderPDelta,
} from '../src/index.js';
import { buildAnalysisDomainHashes, changedAnalysisDomainHashes } from '../src/core/analysisDomainHashes.js';
import { classifyElasticFactorGroups } from '../src/compute/elastic/factorGroups.js';

const E = 30e6;
const G = 12.5e6;
const L = 2.4;
const Iy = 0.00135;
const Iz = 0.0054;
const finite = routeModel({ ryI: (3 * E * Iy) / L, rzI: (6 * E * Iz) / L });
const absent = routeModel(null);
const zero = routeModel({ rzI: 0 });

const descriptorBuild = buildElementDescriptors(finite);
assert.equal(descriptorBuild.ok, true, JSON.stringify(descriptorBuild.errors));
const descriptor = descriptorBuild.descriptors[0];
assert.equal(descriptor.partialFixity.enabled, true);
assert.equal(descriptor.partialFixity.ok, true);
assert.equal(descriptor.partialFixity.method, 'internal-rotation-static-condensation');
assert.deepEqual(descriptor.partialFixity.dofs, [4, 5]);
assert.deepEqual(
  descriptor.partialFixity.entries.map(({ key, dof, end, axis, stiffnessRatio }) => ({ key, dof, end, axis, stiffnessRatio })),
  [
    { key: 'ryI', dof: 4, end: 'i', axis: 'y', stiffnessRatio: 3 },
    { key: 'rzI', dof: 5, end: 'i', axis: 'z', stiffnessRatio: 6 },
  ],
);
const absentDescriptor = buildElementDescriptors(absent).descriptors[0];
assert.equal(absentDescriptor.partialFixity.enabled, false);
assert.notEqual(descriptor.descriptorHash, absentDescriptor.descriptorHash, 'connection springs must participate in descriptor identity');

const absentHashes = buildAnalysisDomainHashes(absent);
const finiteHashes = buildAnalysisDomainHashes(finite);
assert.deepEqual(
  changedAnalysisDomainHashes(absentHashes, finiteHashes),
  ['constraintHash'],
  'partial fixity is a member-kinematic constraint-domain change',
);
assert.notEqual(
  classifyElasticFactorGroups(absent, absent.loadCombinations).baseStiffnessHash,
  classifyElasticFactorGroups(finite, finite.loadCombinations).baseStiffnessHash,
  'connection stiffness changes must invalidate factorization identity',
);

// The current corotational implementation does not own internal connection
// rotations.  It must reject the model during capability preflight rather
// than silently using the condensed linear response in a nonlinear solve.
const nonlinear = evaluateNonlinearIntegrationCapabilities(finite);
assert.equal(nonlinear.ok, false);
assert.ok(nonlinear.blocking.some((item) => (
  item.code === PARTIAL_FIXITY_LIMITATION_CODES.NONLINEAR_UNSUPPORTED
  && item.entityId === 'M1'
)));

// Global buckling likewise requires one shared Ke/Kg connection transform.
// Until implemented, the solver contract is explicitly fail-closed.
const buckling = estimateGlobalBucklingTrace(finite, { modeCount: 1 });
assert.equal(buckling.ok, false);
assert.equal(buckling.blocked, true);
assert.equal(buckling.reason, PARTIAL_FIXITY_LIMITATION_CODES.BUCKLING_UNSUPPORTED);
assert.deepEqual(buckling.domain.memberIds, ['M1']);
assert.equal(buckling.guidance.code, 'REMOVE_OR_IMPLEMENT_BUCKLING_PARTIAL_FIXITY');

// Direct P-Delta admits finite springs using the documented prismatic Kg
// approximation and records the qualification limitation.  An explicit-zero
// connection is release-equivalent and therefore remains fail-closed.
const pdelta = buildPDeltaTangentStiffness(finite, { axialForces: { M1: -100 } });
assert.equal(pdelta.ok, true, pdelta.reason);
assert.equal(pdelta.summary.partialFixityApproximationCount, 1);
assert.deepEqual(pdelta.summary.partialFixityMemberIds, ['M1']);
assert.ok(pdelta.summary.limitationCodes.includes(
  PARTIAL_FIXITY_LIMITATION_CODES.PRISMATIC_KG_APPROXIMATION,
));
assert.equal(pdelta.designEligibility.eligible, true);
assert.equal(pdelta.designEligibility.status, 'qualified-with-limitation');
assert.ok(pdelta.designEligibility.limitationCodes.includes(
  PARTIAL_FIXITY_LIMITATION_CODES.PRISMATIC_KG_APPROXIMATION,
));

const releaseLimit = buildPDeltaTangentStiffness(zero, { axialForces: { M1: -100 } });
assert.equal(releaseLimit.ok, false);
assert.equal(releaseLimit.reason, 'DIRECT_PDELTA_PARTIAL_FIXITY_RELEASE_LIMIT_UNSUPPORTED');
assert.equal(releaseLimit.designEligibility.eligible, false);
assert.equal(releaseLimit.designEligibility.status, 'blocked');
assert.deepEqual(releaseLimit.releaseLimitMemberIds, ['M1']);

const direct = runSecondOrderPDelta(finite, { D: 1 }, { loadSteps: 1 });
assert.equal(direct.ok, true, direct.reason);
assert.equal(direct.compatibility.status, 'supported-with-limitation');
assert.deepEqual(direct.compatibility.partialFixityMemberIds, ['M1']);
assert.ok(direct.compatibility.limitationCodes.includes(
  PARTIAL_FIXITY_LIMITATION_CODES.PRISMATIC_KG_APPROXIMATION,
));
assert.equal(direct.designEligibility.eligible, true);
assert.equal(direct.designEligibility.status, 'qualified-with-limitation');
assert.ok(direct.designEligibility.limitationCodes.includes(
  PARTIAL_FIXITY_LIMITATION_CODES.PRISMATIC_KG_APPROXIMATION,
));
assert.equal(direct.result.memberResults.M1.partialFixity.enabled, true);
assert.ok(direct.result.memberResults.M1.partialFixity.maxClosureResidual <= 1e-10);
assert.ok(direct.result.memberResults.M1.partialFixity.maxElasticClosureResidual <= 1e-10);
assert.equal(
  direct.result.memberResults.M1.partialFixity.secondOrderApproximation.code,
  PARTIAL_FIXITY_LIMITATION_CODES.PRISMATIC_KG_APPROXIMATION,
);
assert.equal(
  direct.result.memberResults.M1.partialFixity.secondOrderApproximation.totalEndClosure,
  'not-applicable-under-prismatic-kg-approximation',
);
for (const row of direct.result.memberResults.M1.partialFixity.rows) {
  assert.equal(row.closureBasis, 'elastic-condensed-ke');
  assert.equal(row.geometricContributionAppliedToSpring, false);
  assert.equal(row.elasticMemberEndMoment + row.geometricJointEndMoment, row.totalReportedEndMoment);
  assert.equal(row.elasticClosureResidual, row.closureResidual);
}

const timoshenkoFinite = {
  ...finite,
  loads: [
    ...finite.loads,
    { id: 'AXIAL', type: 'nodal', node: 'N2', P: 100, dir: '-x', case: 'D' },
    { id: 'UDL', type: 'udl', member: 'M1', w: 2, direction: [0, -1, 0], coordinate: 'local', case: 'D' },
  ],
  analysisSettings: { ...finite.analysisSettings, shearDeformation: true },
};
const timoshenkoDirect = runSecondOrderPDelta(timoshenkoFinite, { D: 1 }, { loadSteps: 1 });
assert.equal(timoshenkoDirect.ok, true, timoshenkoDirect.reason);
assert.deepEqual(
  new Set(timoshenkoDirect.designEligibility.limitationCodes),
  new Set([
    'TIMOSHENKO_CONSISTENT_KG_NOT_IMPLEMENTED',
    PARTIAL_FIXITY_LIMITATION_CODES.PRISMATIC_KG_APPROXIMATION,
  ]),
);
assert.ok(timoshenkoDirect.iterations.every((row) => (
  row.tangent.limitationCodes.includes('TIMOSHENKO_CONSISTENT_KG_NOT_IMPLEMENTED')
  && row.tangent.limitationCodes.includes(PARTIAL_FIXITY_LIMITATION_CODES.PRISMATIC_KG_APPROXIMATION)
)));
assert.equal(
  timoshenkoDirect.result.recovery.resistingForceEquation,
  'q_total = q_elastic(d_member_face, Ke_raw, f0_raw) + Kg_prismatic(N) * d_joint_local',
);
assert.equal(
  timoshenkoDirect.result.recovery.connectionKinematics.limitationCode,
  PARTIAL_FIXITY_LIMITATION_CODES.PRISMATIC_KG_APPROXIMATION,
);
assert.ok(timoshenkoDirect.result.memberResults.M1.partialFixity.maxElasticClosureResidual <= 1e-10);

const directCombinations = analyzePDeltaCombinations(
  finite,
  finite.loadCombinations,
  { pDeltaMethod: 'direct', loadSteps: 1 },
);
assert.equal(directCombinations.ok, true, directCombinations.reason);
assert.equal(directCombinations.designEligibility.status, 'qualified-with-limitation');
assert.deepEqual(
  directCombinations.designEligibility.limitationCodes,
  [PARTIAL_FIXITY_LIMITATION_CODES.PRISMATIC_KG_APPROXIMATION],
);
assert.deepEqual(
  directCombinations.envelope.designEligibility,
  directCombinations.designEligibility,
);
assert.deepEqual(
  directCombinations.summary.limitationCodes,
  directCombinations.designEligibility.limitationCodes,
);

const directProduct = analyzeModel({
  ...finite,
  analysisSettings: {
    ...finite.analysisSettings,
    pDeltaMethod: 'direct',
    pDeltaLoadSteps: 1,
  },
});
assert.equal(directProduct.ok, true, directProduct.reason);
assert.equal(directProduct.designEligibility.status, 'qualified-with-limitation');
assert.deepEqual(
  directProduct.designEligibility.limitationCodes,
  [PARTIAL_FIXITY_LIMITATION_CODES.PRISMATIC_KG_APPROXIMATION],
);
assert.deepEqual(directProduct.design.pDeltaTransfer, directProduct.pDelta.designEligibility);

const rsaModel = createModel();
rsaModel.analysisSettings = {
  ...rsaModel.analysisSettings,
  shearDeformation: false,
  modalModeCount: 4,
  memberStations: 21,
  responseSpectrum: {
    enabled: true,
    method: 'SRSS',
    directions: ['y'],
    dampingRatio: 0.05,
    scale: 1,
    points: [{ period: 0, sa: 1 }, { period: 10, sa: 1 }],
  },
};
rsaModel.nodes = [
  { id: 'N1', x: 0, y: 0, z: 0, support: 'fixed' },
  { id: 'N2', x: 0, y: 0, z: 4, support: null, mass: [10, 10, 0] },
];
rsaModel.members = [{
  id: 'M1',
  type: 'frame',
  n1: 'N1',
  n2: 'N2',
  matId: 'steel',
  secId: 'h300',
  localAxis: { roll: 0, strongAxis: 'z' },
  releases: { i: 'rigid', j: 'rigid', spring: { ryI: 1000 } },
}];
rsaModel.loads = [];
const dynamics = analyzeDynamics(rsaModel);
assert.equal(dynamics.ok, true, dynamics.reason);
assert.equal(dynamics.rsa.designBlocked, false);
assert.equal(dynamics.rsa.memberForces.qualified, true);
assert.equal(dynamics.rsa.memberForces.checks.partialFixityChecksPassed, true);
const combinedRsaMember = dynamics.rsa.memberForces.byDirection.y.byMember.M1;
assert.equal(combinedRsaMember.partialFixity.enabled, true);
assert.equal(
  combinedRsaMember.partialFixity.combinedClosure,
  'not-applicable-to-unsigned-modal-combination',
);
assert.equal(combinedRsaMember.partialFixity.baseShearScalingApplied, false);
const modalPartialFixity = dynamics.rsa.modal
  .flatMap((row) => row.responses)
  .map((response) => response.memberForceRecovery.byMember.M1.partialFixity)
  .filter((row) => row?.enabled);
assert.ok(modalPartialFixity.length > 0);
assert.ok(modalPartialFixity.every((row) => row.maxClosureResidual <= 1e-10));
assert.ok(modalPartialFixity.some((trace) => (
  trace.rows.some((row) => Math.abs(row.springMoment) > 1e-9)
)), 'RSA closure must be exercised by a nonzero modal spring moment');

const directReleaseLimit = runSecondOrderPDelta(zero, { D: 1 }, { loadSteps: 1 });
assert.equal(directReleaseLimit.ok, false);
assert.equal(directReleaseLimit.reason, 'DIRECT_PDELTA_PARTIAL_FIXITY_RELEASE_LIMIT_UNSUPPORTED');
assert.deepEqual(directReleaseLimit.compatibility.partialFixityReleaseLimitMemberIds, ['M1']);

console.log(JSON.stringify({
  ok: true,
  version: 'p10-m3-domain-route-contract',
  descriptorHash: descriptor.descriptorHash,
  changedDomains: changedAnalysisDomainHashes(absentHashes, finiteHashes),
  nonlinear: nonlinear.blocking.map((item) => item.code),
  buckling: buckling.reason,
  pdelta: pdelta.designEligibility,
  releaseLimit: releaseLimit.reason,
  direct: direct.compatibility.status,
  aggregateDesign: directCombinations.designEligibility,
  productDesign: directProduct.designEligibility,
  timoshenkoDirectLimitations: timoshenkoDirect.designEligibility.limitationCodes,
  rsaPartialFixityQualified: dynamics.rsa.memberForces.checks.partialFixityChecksPassed,
  directReleaseLimit: directReleaseLimit.reason,
}, null, 2));

function routeModel(springs) {
  const releases = { i: 'rigid', j: 'rigid' };
  if (springs !== null) releases.spring = { ...springs };
  return createModel({
    materials: [{
      id: 'MAT', version: 1, name: 'M3 route material', E: E / 1000, G: G / 1000,
      Fy: 300, Fu: 400, density: 0, allow: { fb: 200, ft: 200, fc: 200, fv: 120 },
    }],
    sections: [{
      id: 'SEC', version: 1, name: 'M3 route section', type: 'GENERAL',
      A: 0.18, Ay: 0.15, Az: 0.12, Iy, Iz, J: 0.0037, Zy: 0.009, Zz: 0.018,
    }],
    nodes: [
      { id: 'N1', x: 0, y: 0, z: 0, support: 'fixed' },
      { id: 'N2', x: L, y: 0, z: 0, support: null },
    ],
    members: [{
      id: 'M1', type: 'frame', n1: 'N1', n2: 'N2', matId: 'MAT', secId: 'SEC',
      localAxis: { roll: 0, strongAxis: 'z' }, releases,
    }],
    loads: [{ id: 'P', type: 'nodal', node: 'N2', P: 10, dir: '-y', case: 'D' }],
    loadCases: [{ id: 'D', name: 'M3 route load', type: 'dead' }],
    loadCombinations: [{ id: 'C1', name: '1.0D', type: 'strength', factors: { D: 1 } }],
    analysisSettings: { shearDeformation: false, validateBeforeSolve: true },
  });
}
