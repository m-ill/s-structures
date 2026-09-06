import assert from 'node:assert/strict';
import { stableHash } from '../src/core/stableHash.js';
import {
  FIBER_SECTION_MESH_VERSION,
  buildRcRectSectionMesh,
  buildSteelSectionMesh,
  validateFiberSectionMesh,
} from '../src/nonlinear/fiber/sectionMesh.js';
import {
  FIBER_MATERIAL_MODEL_VERSION,
  commitFiberMaterialTrial,
  concreteEnvelopeResponse,
  createConcreteMaterial,
  createFiberMaterialState,
  createSteelBilinearMaterial,
  evaluateFiberMaterialTrial,
  rollbackFiberMaterialTrial,
} from '../src/nonlinear/fiber/materialModels.js';

const verificationIds = ['NL-FIB-01', 'NL-FIB-02', 'NL-FIB-03', 'NL-FIB-04', 'NL-FIB-05', 'NL-FIB-06'];

function close(actual, expected, relativeTolerance, label) {
  const scale = Math.max(Math.abs(expected), 1);
  assert.ok(Math.abs(actual - expected) <= relativeTolerance * scale, `${label}: ${actual} != ${expected}`);
}

function hProperties({ H, B, tw, tf }) {
  const clear = H - 2 * tf;
  return {
    A: 2 * B * tf + tw * clear,
    Iy: (2 * tf * B ** 3 + clear * tw ** 3) / 12,
    Iz: (B * H ** 3 - (B - tw) * clear ** 3) / 12,
  };
}

function boxProperties({ H, B, t }) {
  const hi = H - 2 * t;
  const bi = B - 2 * t;
  return {
    A: B * H - bi * hi,
    Iy: (H * B ** 3 - hi * bi ** 3) / 12,
    Iz: (B * H ** 3 - bi * hi ** 3) / 12,
  };
}

function pipeProperties({ D, t }) {
  const di = D - 2 * t;
  return {
    A: Math.PI * (D ** 2 - di ** 2) / 4,
    I: Math.PI * (D ** 4 - di ** 4) / 64,
  };
}

const hDims = { H: 400, B: 200, tw: 8, tf: 12 };
const hExpected = hProperties(Object.fromEntries(Object.entries(hDims).map(([key, value]) => [key, value / 1000])));
const hSnapshot = {
  id: 'H-400x200x8x12',
  version: 1,
  kind: 'parametric',
  shape: 'H',
  params: hDims,
  properties: { ...hExpected, provenance: { inputUnit: 'mm' } },
};
const hCoarse = buildSteelSectionMesh(hSnapshot, { refinement: { level: 1, longitudinal: 4, thickness: 1 } });
const hFine = buildSteelSectionMesh(hSnapshot, { refinement: { level: 4, longitudinal: 32, thickness: 8 } });
const hSized = buildSteelSectionMesh(hSnapshot, { maxCellSize: 0.005 });
assert.equal(hCoarse.version, FIBER_SECTION_MESH_VERSION);
assert.equal(validateFiberSectionMesh(hCoarse).ok, true);
close(hCoarse.summary.A, hExpected.A, 1e-13, 'NL-FIB-01 H area');
close(hCoarse.summary.centroidY, 0, 1e-12, 'NL-FIB-01 H centroid y');
close(hCoarse.summary.centroidZ, 0, 1e-12, 'NL-FIB-01 H centroid z');
close(hCoarse.summary.Iy, hExpected.Iy, 1e-12, 'NL-FIB-02 H Iy');
close(hCoarse.summary.Iz, hExpected.Iz, 1e-12, 'NL-FIB-02 H Iz');
close(hCoarse.summary.Iyz, 0, 1e-12, 'NL-FIB-02 H Iyz');
const coarsePointError = Math.abs(hCoarse.summary.pointIntegration.Iz - hExpected.Iz);
const finePointError = Math.abs(hFine.summary.pointIntegration.Iz - hExpected.Iz);
const coarsePointIyError = Math.abs(hCoarse.summary.pointIntegration.Iy - hExpected.Iy);
const finePointIyError = Math.abs(hFine.summary.pointIntegration.Iy - hExpected.Iy);
assert.ok(finePointError < coarsePointError / 20, 'NL-FIB-02 H point-fiber inertia must converge under refinement');
assert.ok(finePointIyError < coarsePointIyError / 20, 'NL-FIB-02 H point-fiber Iy must converge under refinement');
assert.notEqual(hCoarse.geometryHash, hFine.geometryHash, 'refinement must participate in the geometry hash');
assert.ok(hSized.fibers.length > hCoarse.fibers.length, 'SI maxCellSize must refine steel regions');
assert.equal(hSized.refinement.units.length, 'm');
assert.equal(hCoarse.sourceSnapshotHash, stableHash(hSnapshot));

const boxDims = { H: 300, B: 200, t: 10 };
const boxExpected = boxProperties(Object.fromEntries(Object.entries(boxDims).map(([key, value]) => [key, value / 1000])));
const box = buildSteelSectionMesh({ id: 'BOX', shape: 'BOX', params: boxDims });
close(box.summary.A, boxExpected.A, 1e-13, 'NL-FIB-01 BOX area');
close(box.summary.Iy, boxExpected.Iy, 1e-12, 'NL-FIB-02 BOX Iy');
close(box.summary.Iz, boxExpected.Iz, 1e-12, 'NL-FIB-02 BOX Iz');
assert.deepEqual(box.topology.regions, ['bottom-wall', 'left-wall', 'right-wall', 'top-wall']);
assert.deepEqual(box.topology.cornersIncludedBy, ['top-wall', 'bottom-wall']);

const pipeDims = { D: 200, t: 8 };
const pipeExpected = pipeProperties({ D: pipeDims.D / 1000, t: pipeDims.t / 1000 });
const pipe = buildSteelSectionMesh({ id: 'PIPE', shape: 'PIPE', params: pipeDims }, { refinement: { sectors: 64, radial: 3 } });
close(pipe.summary.A, pipeExpected.A, 1e-13, 'NL-FIB-01 PIPE area');
close(pipe.summary.Iy, pipeExpected.I, 1e-12, 'NL-FIB-02 PIPE Iy');
close(pipe.summary.Iz, pipeExpected.I, 1e-12, 'NL-FIB-02 PIPE Iz');
close(pipe.summary.Iyz, 0, 1e-12, 'NL-FIB-02 PIPE Iyz');

// NL-FIB-03: every analytic steel component is represented exactly once.
assert.deepEqual(hCoarse.topology.regions, ['bottom-flange', 'top-flange', 'web']);
assert.equal(hCoarse.topology.overlapPolicy, 'disjoint-material-zones');
assert.equal(box.topology.overlapPolicy, 'disjoint-material-zones');
assert.deepEqual(pipe.topology.regions, ['wall']);
close(Object.values(hCoarse.summary.regionAreas).reduce((sum, area) => sum + area, 0), hExpected.A, 1e-13, 'H component coverage');
close(Object.values(box.summary.regionAreas).reduce((sum, area) => sum + area, 0), boxExpected.A, 1e-13, 'BOX component coverage');
close(Object.values(pipe.summary.regionAreas).reduce((sum, area) => sum + area, 0), pipeExpected.A, 1e-13, 'PIPE wall coverage');
assert.throws(
  () => buildSteelSectionMesh({ shape: 'BOX', params: { B: 200, H: 300, t: 100 } }),
  (error) => error.code === 'FIBER_GEOMETRY_OVERLAP',
);
assert.throws(
  () => buildSteelSectionMesh({ shape: 'H', params: { B: 200, H: -300, tw: 8, tf: 12 } }),
  (error) => error.code === 'FIBER_GEOMETRY_NONPOSITIVE',
);

const barArea = 491;
const reinforcementSnapshot = {
  id: 'RC-400x600-R1',
  version: 1,
  qualification: 'verified',
  units: { length: 'mm', area: 'mm2' },
  cover: 40,
  bars: [
    { id: 'B1', y: -240, z: -140, area: barArea },
    { id: 'B2', y: 240, z: -140, area: barArea },
    { id: 'B3', y: -240, z: 140, area: barArea },
    { id: 'B4', y: 240, z: 140, area: barArea },
  ],
  confinement: { model: 'project-tie-snapshot', source: { drawing: 'S-101' } },
};
const rc = buildRcRectSectionMesh(
  { id: 'RC-400x600', version: 1, kind: 'parametric', shape: 'RECT', params: { B: 400, H: 600 } },
  { reinforcementSnapshot, refinement: { rcDivisions: 12 } },
);
const grossArea = 0.4 * 0.6;
const steelArea = 4 * barArea * 1e-6;
const coreGrossArea = (0.4 - 0.08) * (0.6 - 0.08);
close(rc.summary.A, grossArea, 1e-12, 'NL-FIB-04 RC gross replacement area');
close(rc.summary.regionAreas.bar, steelArea, 1e-12, 'NL-FIB-04 bar area');
close(rc.summary.regionAreas.core, coreGrossArea - steelArea, 1e-12, 'NL-FIB-04 core area');
close(rc.summary.regionAreas.cover, grossArea - coreGrossArea, 1e-12, 'NL-FIB-04 cover area');
close(rc.summary.centroidY, 0, 1e-12, 'NL-FIB-04 centroid y');
close(rc.summary.centroidZ, 0, 1e-12, 'NL-FIB-04 centroid z');
assert.equal(rc.qualification, 'verified');
assert.equal(rc.topology.designEligible, true);
const bars = rc.fibers.filter((fiber) => fiber.region === 'bar');
assert.deepEqual(bars.map(({ y, z }) => [y, z]), [[-0.24, -0.14], [0.24, -0.14], [-0.24, 0.14], [0.24, 0.14]]);
assert.equal(new Set(rc.fibers.map((fiber) => fiber.id)).size, rc.fibers.length);
assert.throws(
  () => buildRcRectSectionMesh(
    { shape: 'RECT', params: { B: 400, H: 600 } },
    { reinforcementSnapshot: { ...reinforcementSnapshot, bars: [reinforcementSnapshot.bars[0], { ...reinforcementSnapshot.bars[0] }] } },
  ),
  (error) => error.code === 'FIBER_GEOMETRY_DUPLICATE',
);

// NL-FIB-05: independent monotonic stress and tangent checks.
const steel = createSteelBilinearMaterial({ id: 'S', E: 200, Fy: 2, hardeningRatio: 0.1 });
assert.equal(steel.version, FIBER_MATERIAL_MODEL_VERSION);
const steelOrigin = createFiberMaterialState(steel);
const elastic = evaluateFiberMaterialTrial(steel, steelOrigin, 0.005);
close(elastic.response.stress, 1, 1e-13, 'steel elastic stress');
close(elastic.response.tangent, 200, 1e-13, 'steel elastic tangent');
const plastic = evaluateFiberMaterialTrial(steel, steelOrigin, 0.02);
close(plastic.response.stress, 2 + 20 * (0.02 - 0.01), 1e-13, 'steel post-yield stress');
close(plastic.response.tangent, 20, 1e-13, 'steel post-yield tangent');
assert.equal(plastic.response.yielded, true);

const coverConcrete = createConcreteMaterial({ id: 'COVER', E: 30e9, fc: 30e6, ft: 3e6, epsc0: 0.002, epscu: 0.0035 });
const compression = concreteEnvelopeResponse(coverConcrete, -0.001);
close(compression.stress, -22.5e6, 1e-13, 'concrete compression envelope stress');
close(compression.tangent, 15e9, 1e-13, 'concrete compression envelope tangent');
const tension = concreteEnvelopeResponse(coverConcrete, 0.00005);
close(tension.stress, 1.5e6, 1e-13, 'concrete tension stress');
close(tension.tangent, 30e9, 1e-13, 'concrete tension tangent');
const coreConcrete = createConcreteMaterial({
  id: 'CORE', E: 30e9, fc: 30e6, ft: 3e6, epsc0: 0.002, epscu: 0.0035,
  confinement: { enabled: true, strengthFactor: 1.2, strainFactor: 1.5, ultimateStrainFactor: 2 },
});
const confinedPeak = concreteEnvelopeResponse(coreConcrete, -0.003);
close(confinedPeak.stress, -36e6, 1e-13, 'confined concrete peak stress');
close(confinedPeak.tangent, 0, 1e-12, 'confined concrete peak tangent');

// NL-FIB-06: independent linear-kinematic return mapping over a reversal protocol.
function referenceSteelStep(parameters, state, strain) {
  const trialStress = parameters.E * (strain - state.plasticStrain);
  const relative = trialStress - state.backStress;
  const f = Math.abs(relative) - parameters.Fy;
  if (f <= parameters.yieldTolerance) return { stress: trialStress, tangent: parameters.E, plasticStrain: state.plasticStrain, backStress: state.backStress };
  const direction = Math.sign(relative) || 1;
  const gamma = f / (parameters.E + parameters.kinematicModulus);
  return {
    stress: trialStress - parameters.E * gamma * direction,
    tangent: parameters.postYieldTangent,
    plasticStrain: state.plasticStrain + gamma * direction,
    backStress: state.backStress + parameters.kinematicModulus * gamma * direction,
  };
}

let committed = steelOrigin;
let reference = { plasticStrain: 0, backStress: 0 };
const cyclicTrace = [];
for (const strain of [0.02, 0, -0.02, 0.01]) {
  const beforeHash = stableHash(committed);
  const trial = evaluateFiberMaterialTrial(steel, committed, strain);
  assert.equal(stableHash(committed), beforeHash, 'trial evaluation must not mutate committed state');
  reference = referenceSteelStep(steel.parameters, reference, strain);
  close(trial.response.stress, reference.stress, 1e-12, `cyclic stress at ${strain}`);
  close(trial.response.tangent, reference.tangent, 1e-12, `cyclic tangent at ${strain}`);
  assert.deepEqual(rollbackFiberMaterialTrial(trial), committed, 'rollback must recover the exact committed state');
  committed = commitFiberMaterialTrial(trial);
  cyclicTrace.push({ strain, stress: committed.stress, branch: committed.branch });
}
assert.equal(committed.history.reversalCount, 2);
assert.ok(committed.history.accumulatedPlasticStrain > 0);
assert.ok(committed.energy.dissipated > 0);
assert.ok(Number.isFinite(committed.energy.work));
close(committed.energy.balanceResidual, 0, 1e-12, 'steel cyclic energy balance');

const concreteCommitted = commitFiberMaterialTrial(evaluateFiberMaterialTrial(coverConcrete, createFiberMaterialState(coverConcrete), -0.0025));
const concreteUnload = evaluateFiberMaterialTrial(coverConcrete, concreteCommitted, -0.0015);
assert.match(concreteUnload.response.branch, /unloading|ascending/);
assert.ok(Number.isFinite(concreteUnload.response.energy.dissipated));

console.log(JSON.stringify({
  ok: true,
  version: 'p8-m6-fiber-mesh-materials',
  verificationIds,
  meshes: {
    h: { fibers: hFine.fibers.length, pointIyError: finePointIyError, pointIzError: finePointError, geometryHash: hFine.geometryHash },
    box: { fibers: box.fibers.length, area: box.summary.A },
    pipe: { fibers: pipe.fibers.length, area: pipe.summary.A },
    rc: { fibers: rc.fibers.length, materialAreas: rc.summary.materialAreas },
  },
  cyclicTrace,
  materialEnergy: committed.energy,
}, null, 2));
