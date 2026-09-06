import assert from 'node:assert/strict';
import { buildCanonicalAnalysisDomain } from '../src/solver/domain/canonicalDomain.js';
import { createHingeProperty } from '../src/nonlinear/properties/hingeRegistry.js';
import { resolveDomainHingeAssignments } from '../src/nonlinear/properties/assignments.js';
import { buildHingedFrame3dEntries } from '../src/nonlinear/elements/hingedFrame3d.js';
import { generatePmmSurface } from '../src/nonlinear/fiber/pmmSurface.js';
import {
  buildMemberFiberInteraction,
  buildModelFiberPmmInteractions,
  clearMemberFiberInteractionCache,
} from '../src/nonlinear/fiber/memberInteraction.js';
import { evaluateInteractionProperty } from '../src/nonlinear/fiber/hingeInteraction.js';

const phase7Model = {
  materials: [{ id: 'P7-MAT', version: 1, kind: 'steel', E: 205000, G: 79000, Fy: 275 }],
  sections: [{
    id: 'P7-PIPE', version: 1, kind: 'parametric', shape: 'PIPE',
    params: { D: 200, t: 10 },
    properties: { A: 0.005969, Iy: 2.701e-5, Iz: 2.701e-5, J: 5.402e-5 },
  }],
};
const sourceInteraction = buildMemberFiberInteraction(
  phase7Model,
  { id: 'P7-M1', matId: 'P7-MAT', secId: 'P7-PIPE' },
  {
    refinement: { level: 1, sectors: 8, radial: 1 },
    angleCount: 8,
    curvatures: [0, 0.01, 0.02],
    directionIterations: 1,
    axialLevels: [-500000, 0, 500000],
  },
);
assert.equal(sourceInteraction.mesh.sourceSnapshot.id, 'P7-PIPE');
assert.equal(sourceInteraction.mesh.fibers.length, 8);
assert.equal(sourceInteraction.surface.validation.ok, true);
assert.equal(sourceInteraction.source.sectionHash, sourceInteraction.mesh.sourceSnapshotHash);
const distributedCatalog = buildModelFiberPmmInteractions({
  ...phase7Model,
  members: [{
    id: 'P7-DP1', matId: 'P7-MAT', secId: 'P7-PIPE',
    nonlinear: { formulation: 'distributed-plasticity', hinges: [] },
  }],
}, {
  refinement: { level: 1, sectors: 8, radial: 1 },
  angleCount: 8,
  curvatures: [0, 0.01, 0.02],
  directionIterations: 1,
  axialLevels: [-500000, 0, 500000],
});
assert.equal(distributedCatalog.summary.distributedMemberCount, 1);
assert.equal(distributedCatalog.byMember['P7-DP1'].mesh.sourceSnapshot.id, 'P7-PIPE');
const inconsistentSource = structuredClone(phase7Model);
inconsistentSource.sections[0].properties.Iz *= 1.2;
assert.throws(
  () => buildMemberFiberInteraction(inconsistentSource, { id: 'BAD', matId: 'P7-MAT', secId: 'P7-PIPE' }),
  (error) => error?.code === 'FIBER_SOURCE_PROPERTY_MISMATCH',
);
const supportedFailure = structuredClone(phase7Model);
delete supportedFailure.materials[0].Fy;
supportedFailure.members = [{
  id: 'P7-FAIL', matId: 'P7-MAT', secId: 'P7-PIPE',
  nonlinear: { formulation: 'concentrated-plasticity', hinges: [{ axis: 'z' }] },
}];
assert.throws(
  () => buildModelFiberPmmInteractions(supportedFailure),
  (error) => error?.code === 'FIBER_SOURCE_VALUE_INVALID',
  'supported fiber source failures must block by default',
);
assert.equal(buildModelFiberPmmInteractions(supportedFailure, { strict: false }).warnings.length, 1);

// RC pure-axial tension/compression bounds must reach an actual material
// limit with the default scan range, including an exact rebar yield strain.
const rcReinforcement = {
  id: 'RC-R1', version: 1, qualification: 'verified',
  units: { length: 'mm', area: 'mm2' }, cover: 40,
  bars: [
    { id: 'B1', y: -240, z: -140, area: 491 },
    { id: 'B2', y: 240, z: -140, area: 491 },
    { id: 'B3', y: -240, z: 140, area: 491 },
    { id: 'B4', y: 240, z: 140, area: 491 },
  ],
  material: { E: 200000, Fy: 400 },
  confinement: { enabled: false },
};
const rcModel = {
  materials: [{ id: 'RC30', version: 1, kind: 'concrete', E: 30000, G: 12500, fck: 30 }],
  sections: [{
    id: 'RC-400x600', version: 1, kind: 'parametric', shape: 'RECT',
    params: { B: 400, H: 600 }, properties: { A: 0.24, Iy: 0.0032, Iz: 0.0072, J: 0.006 },
  }],
};
const rcInteraction = buildMemberFiberInteraction(
  rcModel,
  { id: 'RC-M1', matId: 'RC30', secId: 'RC-400x600' },
  { reinforcementSnapshot: rcReinforcement, refinement: { rcDivisions: 2 }, angleCount: 8 },
);
assert.equal(rcInteraction.surface.intercepts.pureAxial.compression.converged, true);
assert.equal(rcInteraction.surface.intercepts.pureAxial.tension.converged, true);

// Every option that changes a PMM surface participates in the global cache key.
clearMemberFiberInteractionCache();
const cacheModel = {
  ...phase7Model,
  members: [{
    id: 'CACHE-M1', matId: 'P7-MAT', secId: 'P7-PIPE',
    nonlinear: { formulation: 'concentrated-plasticity', hinges: [{ axis: 'z' }] },
  }],
};
const cachedOne = buildModelFiberPmmInteractions(cacheModel, {
  refinement: { level: 1, sectors: 8, radial: 1 }, angleCount: 8,
  curvatures: [0, 0.01, 0.02], axialLevels: [-500000, 0, 500000], directionIterations: 1,
});
const cachedSeven = buildModelFiberPmmInteractions(cacheModel, {
  refinement: { level: 1, sectors: 8, radial: 1 }, angleCount: 8,
  curvatures: [0, 0.01, 0.02], axialLevels: [-500000, 0, 500000], directionIterations: 7,
});
assert.equal(cachedOne.interactions['CACHE-M1:z'].surface.source.directionIterations, 1);
assert.equal(cachedSeven.interactions['CACHE-M1:z'].surface.source.directionIterations, 7);
assert.notEqual(cachedOne.interactions['CACHE-M1:z'].surface.surfaceHash, cachedSeven.interactions['CACHE-M1:z'].surface.surfaceHash);

const surface = generatePmmSurface({ id: 'ANALYTIC-PMM-SECTION' }, {
  axialIntercepts: { compression: -100, tension: 100 },
  axialLevels: [-50, 0, 50],
  angleCount: 8,
  curvatures: [0, 0.5, 1],
  directionIterations: 2,
  solveTargetAxial(_section, input) {
    const N = Number(input.targetN);
    const radialCapacity = 20 * (1 - Math.abs(N) / 100);
    const curvature = Math.hypot(input.kappaY, input.kappaZ);
    const factor = Math.min(1, 2 * curvature);
    const angle = Math.atan2(input.kappaZ, input.kappaY);
    return {
      converged: true,
      limitState: { reached: curvature >= 0.5, type: curvature >= 0.5 ? 'analytic-yield' : null },
      epsilon0: N / 1000,
      axialResidual: 0,
      N,
      My: radialCapacity * factor * Math.cos(angle),
      Mz: radialCapacity * factor * Math.sin(angle),
      directionalTangent: curvature < 0.5 ? 2 * radialCapacity : 0,
    };
  },
});

const property = createHingeProperty({
  id: 'HP:M1:z',
  qualification: 'candidate',
  units: { rotation: 'rad', moment: 'kN-m', length: 'm' },
  parameters: {
    positive: backbone(20),
    negative: backbone(10),
    hingeLength: 0.3,
    rotationDefinition: 'joint-relative-to-member-face-local-axis',
    hysteresis: { rule: 'kinematic-masing' },
    pmm: {
      sourceId: 'LEGACY-PMM-HOOK',
      levels: [
        { axialRatio: 0, momentFactor: 1, rotationFactor: 1 },
        { axialRatio: 1, momentFactor: 0.5, rotationFactor: 1 },
      ],
    },
  },
  source: { reference: 'P8-M6-ANALYTIC-ELEMENT-COUPLING', type: 'verification' },
});

const model = {
  schemaVersion: 5,
  nodes: [{ id: 'N1', x: 0, y: 0, z: 0 }, { id: 'N2', x: 4, y: 0, z: 0 }],
  members: [{
    id: 'M1', type: 'frame', behavior: 'frame', n1: 'N1', n2: 'N2', matId: 'MAT', secId: 'SEC',
    localAxis: { refVector: [0, 0, 1], roll: 0, strongAxis: 'z' },
    nonlinear: {
      formulation: 'concentrated-plasticity',
      hinges: [{ id: 'M1:j:z', memberId: 'M1', propertyId: property.id, end: 'j', axis: 'z', location: 1, axialRatio: 0.5 }],
    },
  }],
  materials: [{ id: 'MAT', version: 1, E: 200000, G: 77000, Fy: 300 }],
  sections: [{ id: 'SEC', version: 1, A: 0.001, Iy: 1e-5, Iz: 1e-5, J: 2e-5 }],
  hingeProperties: [property],
  nonlinearMaterials: [], nonlinearSections: [], linkProperties: [], timeHistoryFunctions: [], analysisStates: [],
  loads: [], loadCases: [], loadCombinations: [],
};
const interaction = {
  version: 'p8-m6-member-fiber-interaction-v1',
  id: 'FIBER-PMM:M1',
  contentHash: surface.surfaceHash,
  units: { analysisForceScale: 1, analysisMomentScale: 1 },
  surface,
};
const domain = buildCanonicalAnalysisDomain(model);
assert.equal(domain.ok, true, domain.reason);
const resolution = resolveDomainHingeAssignments(domain, {
  pmmInteractions: { 'M1:z': interaction },
});
assert.equal(resolution.rows[0].pmmInteraction.surface.surfaceHash, surface.surfaceHash);
assert.equal(resolution.rows[0].requiredMatrixClass, 'general');
assert.equal(resolution.rows[0].property.parameters.backbone.positive[1].moment, 15);
assert.equal(
  evaluateInteractionProperty(resolution.rows[0], { axialForce: 0, momentY: 0, momentZ: 0 }).property.parameters.backbone.positive[1].moment,
  20,
  'fiber PMM must replace rather than multiply the legacy static PMM hook',
);
const negativeBranch = evaluateInteractionProperty(
  resolution.rows[0],
  { axialForce: 0, momentY: 0, momentZ: 0 },
  { rotation: -0.001 },
);
assert.equal(negativeBranch.trace.baseYieldMoment, 10);
assert.equal(negativeBranch.property.parameters.backbone.negative[1].moment, 20);
assert.equal(
  evaluateInteractionProperty(resolution.rows[0], { axialForce: 0, momentY: 0, momentZ: 0 }).trace.baseYieldMoment,
  20,
);
const entry = buildHingedFrame3dEntries(domain, { assignmentResolution: resolution })[0];

const uncompressed = evaluate(entry, { axial: 0, rotationZ: 0.005 });
const compressed = evaluate(entry, { axial: -0.001, rotationZ: 0.005 });
const freeTrace = uncompressed.localResponse.hinges[0].pmmInteraction;
const compressedTrace = compressed.localResponse.hinges[0].pmmInteraction;
assert.equal(freeTrace.iterationCoupled, true);
assert.equal(freeTrace.clamped, false);
assert.ok(compressed.trialState.axialForce < uncompressed.trialState.axialForce);
assert.ok(compressedTrace.momentFactor < freeTrace.momentFactor);
assert.equal(freeTrace.momentFactor, freeTrace.momentCapacity / freeTrace.baseYieldMoment);
assert.ok(compressedTrace.momentCapacity < freeTrace.momentCapacity);
assert.ok(Number.isFinite(compressed.localResponse.hinges[0].moment));
assert.equal(compressed.diagnostics.fiberPmmCoupledHingeCount, 1);
assert.ok(Number.isFinite(compressed.localResponse.hinges[0].tangent));
assert.throws(
  () => evaluate(entry, { axial: -1, rotationZ: 0.005 }),
  (error) => error?.code === 'PMM_AXIAL_FORCE_OUT_OF_RANGE',
);

console.log(JSON.stringify({
  ok: true,
  verificationIds: ['NL-PMM-08'],
  freeAxialForce: uncompressed.trialState.axialForce,
  compressedAxialForce: compressed.trialState.axialForce,
  freeMomentFactor: freeTrace.momentFactor,
  compressedMomentFactor: compressedTrace.momentFactor,
  phase7SectionHash: sourceInteraction.source.sectionHash,
  phase7SurfaceHash: sourceInteraction.surface.surfaceHash,
  outOfRangeBlocked: true,
}, null, 2));

function evaluate(entry, { axial, rotationZ }) {
  const u = new Array(12).fill(0);
  u[6] = axial;
  u[11] = rotationZ;
  return entry.kernel.evaluate({ trialKinematics: { uGlobal: u, lambda: 0 } });
}

function backbone(yieldMoment) {
  return [
    { id: 'A', rotation: 0, moment: 0 },
    { id: 'B', rotation: 0.002, moment: yieldMoment },
    { id: 'C', rotation: 0.01, moment: yieldMoment * 1.1 },
    { id: 'D', rotation: 0.02, moment: yieldMoment * 0.2 },
    { id: 'E', rotation: 0.04, moment: yieldMoment * 0.2 },
  ];
}
