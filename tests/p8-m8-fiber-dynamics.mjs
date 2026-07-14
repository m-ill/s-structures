import assert from 'node:assert/strict';
import { buildCanonicalAnalysisDomain } from '../src/solver/domain/canonicalDomain.js';
import { createNonlinearStateStore } from '../src/nonlinear/core/stateStore.js';
import { buildHingedFrame3dEntries } from '../src/nonlinear/elements/hingedFrame3d.js';
import { createEquilibriumAssembler } from '../src/nonlinear/equilibrium/assembler.js';
import { createDenseReferenceBackend } from '../src/nonlinear/equilibrium/referenceBackends.js';
import { createSteelBilinearMaterial } from '../src/nonlinear/fiber/materialModels.js';
import { buildMdofDampingMatrix } from '../src/nonlinear/dynamics/mdofDamping.js';
import {
  buildMdofGroundMotionSet,
  createMdofGroundMotionRecord,
} from '../src/nonlinear/dynamics/mdofGroundMotion.js';
import { buildMdofMassDomain } from '../src/nonlinear/dynamics/massDomain.js';
import { runMdofNewmark } from '../src/nonlinear/dynamics/mdofNewmark.js';

const E = 200000;
const A = 0.01;
const I = 0.000025;
const model = {
  schemaVersion: 5,
  nodes: [
    { id: 'N1', x: 0, y: 0, z: 0, support: 'fixed' },
    { id: 'N2', x: 4, y: 0, z: 0, mass: [1, 1, 1, 0, 0, 0] },
  ],
  members: [{
    id: 'M1',
    type: 'frame',
    behavior: 'frame',
    n1: 'N1',
    n2: 'N2',
    matId: 'MAT',
    secId: 'SEC',
    localAxis: { refVector: [0, 0, 1], roll: 0, strongAxis: 'z' },
    nonlinear: { formulation: 'distributed-plasticity', hinges: [] },
  }],
  materials: [{ id: 'MAT', version: 1, E, G: 77000, Fy: 250, density: 0 }],
  sections: [{ id: 'SEC', version: 1, shape: 'CUSTOM', A, Iy: I, Iz: I, J: 2 * I }],
  loads: [],
  loadCases: [],
  loadCombinations: [],
  massSources: [{ id: 'MS', version: 1, includeNodeMass: true, includeMemberMass: false, combos: [] }],
  hingeProperties: [],
  nonlinearMaterials: [],
  nonlinearSections: [],
  linkProperties: [],
  timeHistoryFunctions: [],
  analysisStates: [],
  analysisSettings: { includeSelfWeight: false },
};
const domain = buildCanonicalAnalysisDomain(model);
assert.equal(domain.ok, true, domain.reason);
const material = createSteelBilinearMaterial({
  id: 'steel',
  E: E * 1e6,
  Fy: 250 * 1e6,
  hardeningRatio: 0.01,
});
const fiberSection = {
  id: 'FIBER:M1',
  contentHash: 'p8-m8-fiber-dynamic-section',
  mesh: {
    id: 'SEC-FIBER',
    fibers: [
      { id: 'F1', area: A / 4, y: -0.05, z: -0.05, materialId: 'steel' },
      { id: 'F2', area: A / 4, y: 0.05, z: -0.05, materialId: 'steel' },
      { id: 'F3', area: A / 4, y: -0.05, z: 0.05, materialId: 'steel' },
      { id: 'F4', area: A / 4, y: 0.05, z: 0.05, materialId: 'steel' },
    ],
  },
  materials: { steel: material },
};
const elements = buildHingedFrame3dEntries(domain, {
  fiberSections: { M1: fiberSection },
  integrationPoints: 3,
});
assert.equal(elements[0].usesDistributedFiber, true);
assert.equal(elements[0].requiredMatrixClass, 'general');
const assembler = createEquilibriumAssembler({ domain, elements });
const massDomain = buildMdofMassDomain(model, domain, { massSourceId: 'MS', formulation: 'lumped' });
const damping = buildMdofDampingMatrix({ massDomain, specification: { type: 'none' } });
const groundMotion = buildMdofGroundMotionSet(createMdofGroundMotionRecord({
  id: 'GM-Z-FIBER',
  values: [0, 0.1, 0],
  dt: 0.02,
  unit: 'm/s2',
  direction: 'z',
}), massDomain);
const stateStore = createNonlinearStateStore({
  domainHash: domain.identity.domainHash,
  initialState: {
    q: new Array(domain.constraint.reducedDofCount).fill(0),
    v: new Array(domain.constraint.reducedDofCount).fill(0),
    a: new Array(domain.constraint.reducedDofCount).fill(0),
    elementStates: {},
  },
});
const result = await runMdofNewmark({
  assembler,
  massDomain,
  damping,
  groundMotion,
  stateStore,
  backend: createDenseReferenceBackend({ limit: 100 }),
  production: false,
  options: {
    outputDt: 0.02,
    initialDt: 0.02,
    minDt: 0.0003125,
    maximumSubstepLevel: 8,
    maxIterations: 30,
    convergence: {
      forceAbsolute: 1e-7,
      forceRelative: 1e-7,
      momentAbsolute: 1e-7,
      momentRelative: 1e-7,
      displacementAbsolute: 1e-9,
      displacementRelative: 1e-7,
      rotationAbsolute: 1e-9,
      rotationRelative: 1e-7,
      energyAbsolute: 1e-10,
      energyRelative: 1e-7,
    },
  },
});

assert.equal(result.ok, true, JSON.stringify({ reason: result.reason, details: result.details }, null, 2));
assert.equal(result.matrixClass, 'general');
assert.match(result.matrixClassReason, /^assembler-required-general|^state-dependent-dynamic-tangent:/);
const rows = result.history.retainedChunks.flatMap((chunk) => chunk.rows);
assert.equal(rows.length, 3);
assert.ok(rows.every((row) => row.elements.M1.distributedFiber.points.length === 3));
assert.ok(rows.some((row) => row.elements.M1.distributedFiber.points.some((point) => (
  Math.hypot(...point.generalizedStrain) > 0
))), JSON.stringify(rows.map((row) => ({ q: row.q, points: row.elements.M1.distributedFiber.points }))));
assert.ok(result.history.envelopes['elements.M1.distributedFiber.points[0].force[2]']);
assert.ok(result.stateStore.committed.elementStates.M1.fiberSections);

console.log(JSON.stringify({
  ok: true,
  verificationIds: ['NL-DYN-10'],
  matrixClass: result.matrixClass,
  outputStepCount: result.outputStepCount,
  integrationPointCount: rows.at(-1).elements.M1.distributedFiber.points.length,
  committedFiberSectionCount: Object.keys(result.stateStore.committed.elementStates.M1.fiberSections).length,
}, null, 2));
