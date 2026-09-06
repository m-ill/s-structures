import assert from 'node:assert/strict';
import { buildCanonicalAnalysisDomain } from '../src/solver/domain/canonicalDomain.js';
import { analyzeAll } from '../src/solver/linear3d.js';
import { createNonlinearStateStore } from '../src/nonlinear/core/stateStore.js';
import { createEquilibriumAssembler } from '../src/nonlinear/equilibrium/assembler.js';
import { buildLinearElasticElementEntries } from '../src/nonlinear/equilibrium/linearElasticElement.js';
import { solveMdofNewtonStep } from '../src/nonlinear/equilibrium/newton.js';
import { createDenseReferenceBackend, solveDensePivoted } from '../src/nonlinear/equilibrium/referenceBackends.js';

const model = {
  schemaVersion: 5,
  nodes: [
    { id: 'N1', x: 0, y: 0, z: 0, support: 'fixed' },
    { id: 'N2', x: 4, y: 0, z: 0, support: null },
  ],
  members: [{
    id: 'M1', type: 'frame', n1: 'N1', n2: 'N2', matId: 'MAT', secId: 'SEC',
    localAxis: { roll: 0.2, strongAxis: 'z' }, releases: { i: 'rigid', j: 'rigid' },
    endOffset: { i: 0.15, j: 0.1, rigidFactor: 1 },
  }],
  materials: [{ id: 'MAT', E: 200_000, G: 76_923.076923, density: 0 }],
  sections: [{ id: 'SEC', type: 'direct', A: 0.025, Iy: 9e-5, Iz: 1.6e-4, J: 3e-5 }],
  loads: [
    { id: 'PZ', type: 'nodal', node: 'N2', P: 7, direction: [0, 0, -1], case: 'D' },
    { id: 'WZ', type: 'udl', member: 'M1', w: 2, dir: '-z', case: 'D' },
  ],
  loadCases: [{ id: 'D', name: 'Dead', type: 'dead' }],
  loadCombinations: [{ id: 'D1', name: 'Dead', type: 'service', factors: { D: 1 } }],
  analysisSettings: { includeSelfWeight: false, validateBeforeSolve: true, useSparseSolver: false },
};

const domain = buildCanonicalAnalysisDomain(model, { factors: { D: 1 } });
assert.equal(domain.ok, true, domain.reason);
const entries = buildLinearElasticElementEntries(domain);
const assembler = createEquilibriumAssembler({ domain, elements: entries });
const state = createNonlinearStateStore({
  domainHash: domain.identity.domainHash,
  initialState: { q: new Array(domain.constraint.reducedDofCount).fill(0), elementStates: {} },
});
const mdof = await solveMdofNewtonStep({
  assembler,
  stateStore: state,
  targetLambda: 1,
  backend: createDenseReferenceBackend(),
  options: {
    maxIterations: 5,
    convergence: {
      forceAbsolute: 1e-9, forceRelative: 1e-9,
      momentAbsolute: 1e-9, momentRelative: 1e-9,
      displacementAbsolute: 1e-12, displacementRelative: 1e-9,
      rotationAbsolute: 1e-12, rotationRelative: 1e-9,
      energyAbsolute: 1e-12, energyRelative: 1e-10,
    },
  },
});
assert.equal(mdof.ok, true, mdof.reason);
const elastic = analyzeAll(model, { D: 1 });
assert.equal(elastic.ok, true, elastic.reason);
const nodeIndex = new Map(domain.nodes.map((node, index) => [node.id, index]));
for (const node of domain.nodes) {
  const base = nodeIndex.get(node.id) * 6;
  const expected = elastic.disp[node.id];
  for (let dof = 0; dof < 6; dof += 1) close(mdof.u[base + dof], expected[dof], 2e-8, `${node.id}:${dof}`);
}
const base = nodeIndex.get('N1') * 6;
const elasticReaction = elastic.reactions.N1;
const expectedReaction = [
  elasticReaction.rx, elasticReaction.ry, elasticReaction.rz,
  elasticReaction.rmx, elasticReaction.rmy, elasticReaction.rmz,
];
expectedReaction.forEach((value, dof) => close(mdof.evaluation.reactionsFull[base + dof], value, 2e-8, `reaction:${dof}`));
const mdofEndForces = mdof.evaluation.elementResponses.M1.localResponse.resistingForce;
const elasticEndForces = elastic.memberResults.M1.end;
elasticEndForces.forEach((value, dof) => close(mdofEndForces[dof], value, 2e-8, `member-end:${dof}`));
assert.equal(mdof.evaluation.audit.ok, true, JSON.stringify(mdof.evaluation.audit));
assert.ok(mdof.evaluation.audit.forceResidual < 1e-9);
assert.ok(mdof.evaluation.audit.momentResidual < 1e-9);

const indefinite = solveDensePivoted([[0, 2], [2, -1]], [4, 1], {
  backendId: 'dense-pivoted-reference', matrixClass: 'symmetric-indefinite',
});
assert.equal(indefinite.ok, true, indefinite.reason);
close(indefinite.x[0], 1.5, 1e-12, 'indefinite-x0');
close(indefinite.x[1], 2, 1e-12, 'indefinite-x1');
assert.ok(indefinite.diagnostics.pivotMin > 0);

console.log(JSON.stringify({
  ok: true,
  verificationIds: ['NL-EQ-02', 'NL-EQ-07', 'NL-EQ-08', 'NL-EQ-09', 'NL-EQ-11'],
  reducedDofs: domain.constraint.reducedDofCount,
  displacementError: maxError(mdof.u, domain.nodes.flatMap((node) => elastic.disp[node.id])),
  memberEndForceError: maxError(mdofEndForces, elasticEndForces),
  forceResidual: mdof.evaluation.audit.forceResidual,
  momentResidual: mdof.evaluation.audit.momentResidual,
  indefiniteResidual: indefinite.diagnostics.residualNorm,
}, null, 2));

function close(actual, expected, tolerance, label) {
  assert.ok(Math.abs(Number(actual) - Number(expected)) <= tolerance * Math.max(1, Math.abs(Number(expected))), `${label}: ${actual} != ${expected}`);
}

function maxError(actual, expected) {
  return expected.reduce((max, value, index) => Math.max(max, Math.abs(Number(actual[index]) - Number(value))), 0);
}
