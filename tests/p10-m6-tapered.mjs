import assert from 'node:assert/strict';
import { analyzeModel, createCantileverTipLoad, validateModel } from '../src/index.js';
import { packDomainBinary, unpackDomainBinary, validateDomainBinary } from '../src/compute/contracts/domainBinary.js';
import { buildCanonicalAnalysisDomain } from '../src/solver/domain/canonicalDomain.js';
import { executeModelingAction, ensureAgentState, INDEX_AGENT_ACTIONS_VERSION } from '../src/ui/indexAgentActions.js';
import { resolveCriterion } from '../src/core/analysisCriteria.js';
import { stableHash } from '../src/core/stableHash.js';
import { materialOf } from '../src/core/catalogs.js';
import { sectionOf } from '../src/core/catalogs.js';
import { assembleStiffness3D } from '../src/solver/linear3dAssembly.js';
import { buildLumpedMass } from '../src/dynamics/modal.js';
import { assembleGlobalGeometricStiffness } from '../src/solver/geometricStiffness.js';
import { TAPERED_MEMBER_VERSION } from '../src/solver/taperedMember.js';

const prismatic = createCantileverTipLoad().model;
const constantTaper = structuredClone(prismatic);
constantTaper.members[0].taper = { profile: 'linear', sectionIdJ: constantTaper.members[0].secId, gaussPoints: 5 };
const baseResult = analyzeModel(prismatic);
const constantResult = analyzeModel(constantTaper);
assert.equal(baseResult.ok, true);
assert.equal(constantResult.ok, true);
const prismaticRegressionError = maxRelativeError([
  [constantResult.byCombo.D_ONLY.disp.N2, baseResult.byCombo.D_ONLY.disp.N2],
  [constantResult.byCombo.D_ONLY.memberResults.M1.end, baseResult.byCombo.D_ONLY.memberResults.M1.end],
  [Object.values(constantResult.byCombo.D_ONLY.reactions.N1), Object.values(baseResult.byCombo.D_ONLY.reactions.N1)],
]);
assert.ok(prismaticRegressionError < 1e-12, `EL-P01 ${prismaticRegressionError}`);

const taper5 = taperedCantilever(5, 1.5);
const taper10 = taperedCantilever(10, 1.5);
assert.deepEqual(validateModel(taper5).errors, []);
const result5 = analyzeModel(taper5);
const result10 = analyzeModel(taper10);
assert.equal(result5.ok, true, result5.reason);
assert.equal(result10.ok, true, result10.reason);
const actual = Math.abs(result5.byCombo.D_ONLY.disp.N2[2]);
const expected = linearTaperTipDeflection(taper5, 1.5);
const closedFormError = Math.abs(actual - expected) / Math.max(Number.EPSILON, Math.abs(expected));
const integrationConvergence = Math.abs(
  result5.byCombo.D_ONLY.disp.N2[2] - result10.byCombo.D_ONLY.disp.N2[2],
) / Math.max(Number.EPSILON, Math.abs(result10.byCombo.D_ONLY.disp.N2[2]));
assert.ok(closedFormError < 1e-6, `EL-P02 ${closedFormError}`);
assert.ok(integrationConvergence < 1e-8, `EL-P03 ${integrationConvergence}`);
assert.equal(result5.byCombo.D_ONLY.memberResults.M1.taper.stationSections.length, 21);

const assembly = assembleStiffness3D(taper5.nodes, taper5.members, {
  model: taper5,
  mat: (id) => materialOf(taper5, id),
  sec: (id) => sectionOf(taper5, id),
});
assert.equal(assembly.ok, true);
const mass = buildLumpedMass(taper5, assembly);
const density = materialOf(taper5, 'bench-steel').density;
const expectedMass = density * 4 * (0.02 + 0.024) / 2;
assert.ok(Math.abs(mass[0] + mass[6] - expectedMass) / expectedMass < 1e-12);
const kg = assembleGlobalGeometricStiffness(taper5, assembly, {
  mode: 'buckling',
  referenceAxialForces: { M1: 100 },
});
assert.equal(kg.rows[0].taper.profile, 'linear');
assert.ok(kg.KG.flat().every(Number.isFinite));

const loadedTaper = structuredClone(taper5);
loadedTaper.loads.push({ id: 'W1', type: 'udl', member: 'M1', w: 2, dir: '-z', case: 'D' });
const loadedResult = analyzeModel(loadedTaper);
assert.equal(loadedResult.ok, true);
assert.equal(loadedResult.byCombo.D_ONLY.memberResults.M1.fixedEndLoads[0].taper.profile, 'linear');
assert.ok(loadedResult.byCombo.D_ONLY.summary.equilibriumResidual < 1e-10);

const domain = packDomainBinary(taper5);
assert.equal(validateDomainBinary(domain).ok, true);
assert.equal(domain.version, 'p10-domain-binary-v6');
assert.equal(domain.buffers.memberTaperProfiles[0], 1);
assert.equal(domain.buffers.memberTaperGaussPoints[0], 5);
assert.equal(unpackDomainBinary(domain).members[0].taper.sectionIdJ, 'bench-rect-j');
const canonical = buildCanonicalAnalysisDomain(taper5);
assert.equal(canonical.ok, true);
assert.equal(canonical.elements[0].formulation.taper.profile, 'linear');
assert.equal(canonical.elements[0].version, 'p10-m6-element-descriptor-v4');

const agentModel = createCantileverTipLoad().model;
executeModelingAction(agentModel, ensureAgentState({}), 'updateMember', {
  id: 'M1',
  taper: { profile: 'linear', sectionIdJ: 'bench-rect', gaussPoints: 5 },
});
assert.equal(agentModel.members[0].taper.profile, 'linear');
assert.equal(INDEX_AGENT_ACTIONS_VERSION, 'p10-m6-agent-modeling-actions-v5');
assert.equal(resolveCriterion(taper5, 'taper.gaussPoints'), 5);

export const M6_VERIFICATION_SNAPSHOT = Object.freeze({
  ok: true,
  version: 'p10-m6-tapered-v1',
  solverVersion: TAPERED_MEMBER_VERSION,
  metrics: { prismaticRegressionError, closedFormError, integrationConvergence },
  tolerances: {
    prismaticRegression: 1e-12,
    closedForm: 1e-6,
    integrationConvergence: 1e-8,
  },
  modelHashes: {
    prismatic: stableHash(prismatic).slice(0, 16),
    tapered5: stableHash(taper5).slice(0, 16),
    tapered10: stableHash(taper10).slice(0, 16),
  },
  contracts: {
    domainBinary: domain.version,
    elementDescriptor: canonical.elements[0].version,
    agent: INDEX_AGENT_ACTIONS_VERSION,
  },
});

console.log(JSON.stringify(M6_VERIFICATION_SNAPSHOT, null, 2));

function taperedCantilever(gaussPoints, inertiaRatio) {
  const model = createCantileverTipLoad().model;
  const start = model.sections[0];
  model.sections.push({
    ...structuredClone(start),
    id: 'bench-rect-j',
    name: 'Benchmark tapered end section',
    A: start.A * 1.2,
    Iy: start.Iy * inertiaRatio,
    Iz: start.Iz * inertiaRatio,
    J: start.J * 1.2,
  });
  model.materials[0].density = 7850;
  model.members[0].taper = { profile: 'linear', sectionIdJ: 'bench-rect-j', gaussPoints };
  return model;
}

function linearTaperTipDeflection(model, inertiaRatio) {
  const member = model.members[0];
  const aNode = model.nodes.find((node) => node.id === member.n1);
  const bNode = model.nodes.find((node) => node.id === member.n2);
  const L = Math.hypot(bNode.x - aNode.x, bNode.y - aNode.y, bNode.z - aNode.z);
  const E = materialOf(model, member.matId).E;
  const I = model.sections.find((row) => row.id === member.secId).Iz;
  const P = Math.abs(model.loads.find((row) => row.node === member.n2).P);
  const slope = inertiaRatio - 1;
  const integral = -3 / (2 * slope) - 1 / slope ** 2 + ((1 + slope) ** 2 / slope ** 3) * Math.log(1 + slope);
  return P * L ** 3 * integral / (E * I);
}

function maxRelativeError(pairs) {
  let maximum = 0;
  for (const [actual, expected] of pairs) {
    for (let index = 0; index < actual.length; index += 1) {
      maximum = Math.max(maximum, Math.abs((actual[index] || 0) - (expected[index] || 0)) / Math.max(1, Math.abs(expected[index] || 0)));
    }
  }
  return maximum;
}
