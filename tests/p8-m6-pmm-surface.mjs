import assert from 'node:assert/strict';
import { stableHash } from '../src/core/stableHash.js';
import {
  PMM_SIGN_CONVENTION,
  PMM_SURFACE_VERSION,
  createPmmSurfaceEvaluator,
  generatePmmSurface,
  interpolatePmmSurface,
  validatePmmSurface,
} from '../src/nonlinear/fiber/pmmSurface.js';
import { solveSectionAxialEquilibrium } from '../src/nonlinear/fiber/momentCurvatureV2.js';
import { createSteelBilinearMaterial } from '../src/nonlinear/fiber/materialModels.js';

const axialBounds = Object.freeze({ compression: -100, tension: 100 });
const axialLevels = Object.freeze([-80, -40, 0, 40, 80]);
const angles = Object.freeze(Array.from({ length: 16 }, (_, index) => 2 * Math.PI * index / 16));
const curvatures = Object.freeze([0, 0.25, 0.5, 0.75, 1, 1.25]);
let solveCount = 0;

function independentRadialCapacity(axialForce, angle) {
  const axisCapacity = 1 / Math.sqrt((Math.cos(angle) / 40) ** 2 + (Math.sin(angle) / 20) ** 2);
  return axisCapacity * Math.max(0, 1 - (axialForce / 100) ** 2);
}

function solveAtTargetAxialForce(_section, input) {
  solveCount += 1;
  assert.equal(input.targetN, input.targetAxialForce);
  assert.equal(input.kappaY, input.curvatureY);
  assert.equal(input.kappaZ, input.curvatureZ);
  const target = Number(input.targetN);
  const ky = Number(input.kappaY);
  const kz = Number(input.kappaZ);
  const curvature = Math.hypot(ky, kz);
  const angle = curvature > 0 ? Math.atan2(kz, ky) : 0;
  const capacity = independentRadialCapacity(target, angle);
  const curveFactor = Math.max(0, 2 * curvature - curvature ** 2);
  const radialMoment = capacity * curveFactor;
  return {
    ok: target >= axialBounds.compression && target <= axialBounds.tension,
    converged: true,
    axialResidual: 0,
    axialStrain: target / 1000,
    response: {
      forces: {
        N: target,
        My: radialMoment * Math.cos(angle),
        Mz: radialMoment * Math.sin(angle),
      },
      directionalTangent: capacity * (2 - 2 * curvature),
    },
  };
}
solveAtTargetAxialForce.solverId = 'independent-analytic-target-axial';
solveAtTargetAxialForce.version = 'test-v1';

const section = Object.freeze({
  id: 'ELLIPSE-01',
  type: 'independent-analytic-fiber-section',
  fibers: Object.freeze([
    Object.freeze({ id: 'F1', y: -1, z: -1, area: 1, materialId: 'MAT' }),
    Object.freeze({ id: 'F2', y: 1, z: 1, area: 1, materialId: 'MAT' }),
  ]),
});

const surface = generatePmmSurface(section, {
  solveTargetAxial: solveAtTargetAxialForce,
  axialIntercepts: axialBounds,
  axialLevels,
  angles,
  curvatures,
  axialTolerance: 1e-12,
});

assert.equal(surface.version, PMM_SURFACE_VERSION);
assert.deepEqual(surface.signConvention, PMM_SIGN_CONVENTION);
assert.equal(surface.validation.ok, true);
assert.equal(surface.sourceHash, stableHash(surface.source));
assert.ok(Object.isFrozen(surface));
assert.ok(Object.isFrozen(surface.source));
assert.ok(Object.isFrozen(surface.levels[0].points[0]));
assert.ok(surface.summary.sectionSolveCount > 2 + axialLevels.length * angles.length * curvatures.length);
assert.equal(solveCount, surface.summary.sectionSolveCount);

// NL-PMM-01: both uniaxial interaction cuts reproduce section-solve capacities.
for (const row of surface.intercepts.uniaxial.pMy) {
  close(row.positive, independentRadialCapacity(row.axialForce, 0), 1e-12, 'P-My positive intercept');
  close(row.negative, -independentRadialCapacity(row.axialForce, Math.PI), 1e-12, 'P-My negative intercept');
}
for (const row of surface.intercepts.uniaxial.pMz) {
  close(row.positive, independentRadialCapacity(row.axialForce, Math.PI / 2), 1e-12, 'P-Mz positive intercept');
  close(row.negative, -independentRadialCapacity(row.axialForce, 3 * Math.PI / 2), 1e-12, 'P-Mz negative intercept');
}

// NL-PMM-02: pure-axial tension/compression intercepts retain force signs and solves.
assert.equal(surface.intercepts.pureAxial.compression.axialForce, -100);
assert.equal(surface.intercepts.pureAxial.compression.solvedAxialForce, -100);
assert.equal(surface.intercepts.pureAxial.tension.axialForce, 100);
assert.equal(surface.intercepts.pureAxial.tension.solvedAxialForce, 100);
assert.equal(surface.intercepts.pureAxial.compression.converged, true);
assert.equal(surface.intercepts.pureAxial.tension.converged, true);

// NL-PMM-03: zero-P pure-bending capacities match independent axis solves.
close(surface.intercepts.pureBending.myPositive, 40, 1e-12, 'pure +My');
close(surface.intercepts.pureBending.myNegative, -40, 1e-12, 'pure -My');
close(surface.intercepts.pureBending.mzPositive, 20, 1e-12, 'pure +Mz');
close(surface.intercepts.pureBending.mzNegative, -20, 1e-12, 'pure -Mz');

// NL-PMM-04: selected biaxial grid nodes equal independent section solves.
for (const [axialForce, angle] of [[-40, Math.PI / 4], [0, 3 * Math.PI / 4], [40, 5 * Math.PI / 4]]) {
  const result = interpolatePmmSurface(surface, { axialForce, angle });
  assert.equal(result.ok, true);
  assert.equal(result.interpolation.exactNode, true);
  close(result.momentCapacity, independentRadialCapacity(axialForce, angle), 1e-12, 'biaxial node capacity');
}
assert.match(surface.sourceHash, /^[a-f0-9]{64}$/);

// NL-PMM-05: interpolation is exact at nodes, continuous, and remains bounded.
const node = interpolatePmmSurface(surface, { axialForce: 40, angle: Math.PI / 4 });
const angleLeft = interpolatePmmSurface(surface, { axialForce: 40, angle: Math.PI / 4 - 1e-7 });
const angleRight = interpolatePmmSurface(surface, { axialForce: 40, angle: Math.PI / 4 + 1e-7 });
const axialLeft = interpolatePmmSurface(surface, { axialForce: 40 - 1e-7, angle: Math.PI / 4 });
const axialRight = interpolatePmmSurface(surface, { axialForce: 40 + 1e-7, angle: Math.PI / 4 });
close(node.momentCapacity, independentRadialCapacity(40, Math.PI / 4), 1e-12, 'exact interpolation node');
assert.ok(Math.abs(angleLeft.momentCapacity - angleRight.momentCapacity) < 1e-4);
assert.ok(Math.abs(axialLeft.momentCapacity - axialRight.momentCapacity) < 1e-4);
assert.ok(node.momentCapacity >= 20 * (1 - 0.4 ** 2));
assert.ok(node.momentCapacity <= 40 * (1 - 0.4 ** 2));

// NL-PMM-06: sign and convexity violations fail closed in validation.
const invalidSign = clone(surface);
invalidSign.axialBounds.compression = 100;
let validation = validatePmmSurface(invalidSign);
assert.equal(validation.ok, false);
assert.ok(validation.errors.some((issue) => issue.code === 'PMM_COMPRESSION_SIGN_INVALID'));

const nonconvex = clone(surface);
const dent = nonconvex.levels.find((level) => level.axialForce === 0).points[2];
dent.radialCapacity *= 0.05;
dent.My = dent.radialCapacity * Math.cos(dent.angle);
dent.Mz = dent.radialCapacity * Math.sin(dent.angle);
validation = validatePmmSurface(nonconvex);
assert.equal(validation.ok, false);
assert.ok(validation.errors.some((issue) => issue.code === 'PMM_SURFACE_NONCONVEX'));

const axialNonconvex = clone(surface);
const depressed = axialNonconvex.levels.find((level) => level.axialForce === 0);
for (const point of depressed.points) {
  point.radialCapacity *= 0.05;
  point.My = point.radialCapacity * Math.cos(point.angle);
  point.Mz = point.radialCapacity * Math.sin(point.angle);
}
validation = validatePmmSurface(axialNonconvex);
assert.equal(validation.ok, false);
assert.ok(validation.errors.some((issue) => issue.code === 'PMM_SURFACE_AXIAL_NONCONVEX'));

// NL-PMM-07: requests beyond pure-axial bounds are blocked without clamping.
for (const axialForce of [-100.001, 100.001]) {
  const blocked = interpolatePmmSurface(surface, { axialForce, angle: 0 });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.blocked, true);
  assert.equal(blocked.reason, 'PMM_AXIAL_FORCE_OUT_OF_RANGE');
  assert.equal(blocked.clamped, false);
  assert.equal(blocked.requestedAxialForce, axialForce);
}
assert.throws(
  () => generatePmmSurface(section, { axialIntercepts: axialBounds }),
  (error) => error?.code === 'PMM_TARGET_AXIAL_SOLVER_REQUIRED',
);
assert.throws(
  () => generatePmmSurface(section, {
    axialIntercepts: axialBounds,
    axialLevels: [-50, 0, 50],
    angleCount: 8,
    curvatures: [0, 1, 2],
    solveTargetAxial(_candidate, input) {
      const curvature = Math.hypot(input.kappaY, input.kappaZ);
      const angle = curvature ? Math.atan2(input.kappaZ, input.kappaY) : 0;
      return {
        converged: true,
        axialResidual: 0,
        N: input.targetN,
        My: curvature * Math.cos(angle),
        Mz: curvature * Math.sin(angle),
      };
    },
  }),
  (error) => error?.code === 'PMM_LIMIT_STATE_NOT_REACHED',
);
assert.throws(
  () => generatePmmSurface(section, {
    axialIntercepts: axialBounds,
    solveTargetAxial() {
      const error = new Error('inner target solve failed');
      error.code = 'INNER_SOLVE_FAILURE';
      throw error;
    },
  }),
  (error) => error?.code === 'PMM_SECTION_SOLVER_FAILED'
    && error?.details?.causeCode === 'INNER_SOLVE_FAILURE',
);

// NL-PMM-08: changed axial force in one Newton iteration updates capacity/tangent immediately.
const evaluator = createPmmSurfaceEvaluator(surface, { referenceAxialForce: 0, referenceTangent: 1000 });
const first = evaluator.evaluate({ iterationId: 'NR-7', axialForce: 0, angle: 0 });
const changed = evaluator.evaluate({ iterationId: 'NR-7', axialForce: 60, angle: 0 });
assert.equal(first.ok, true);
assert.equal(changed.ok, true);
assert.equal(first.iterationId, changed.iterationId);
assert.notEqual(first.momentCapacity, changed.momentCapacity);
assert.notEqual(first.tangent, changed.tangent);
close(first.tangent, 1000, 1e-12, 'zero-P tangent scale');
close(changed.tangent, 1000 * changed.momentCapacity / first.momentCapacity, 1e-12, 'updated PMM tangent');
assert.equal(changed.updatedFromAxialForce, 60);

// Production-contract smoke: PMM generation invokes the real sectionResponse
// target-axial solve using targetN/kappaY/kappaZ without an adapter shim.
const E = 200e9;
const productionSteel = createSteelBilinearMaterial({ id: 'steel', E, Fy: 250e6, hardeningRatio: 0.01 });
const productionSection = {
  id: 'PRODUCTION-SQUARE-4',
  fibers: [
    { id: 'Q1', area: 0.01, y: -0.2, z: -0.2, materialId: 'steel' },
    { id: 'Q2', area: 0.01, y: 0.2, z: -0.2, materialId: 'steel' },
    { id: 'Q3', area: 0.01, y: -0.2, z: 0.2, materialId: 'steel' },
    { id: 'Q4', area: 0.01, y: 0.2, z: 0.2, materialId: 'steel' },
  ],
};
const productionSurface = generatePmmSurface(productionSection, {
  solveTargetAxial: solveSectionAxialEquilibrium,
  solverId: 'solveSectionAxialEquilibrium',
  solverVersion: 'p8-m6-moment-curvature-v2',
  solverOptions: {
    materials: { steel: productionSteel },
    forceTolerance: 1e-5,
    relativeTolerance: 1e-12,
  },
  axialIntercepts: { compression: -1e7, tension: 1e7 },
  axialLevels: [-5e6, 0, 5e6],
  angleCount: 8,
  curvatures: [0, 0.005, 0.01],
  axialTolerance: 1e-8,
});
assert.equal(productionSurface.validation.ok, true);
assert.equal(productionSurface.intercepts.pureAxial.compression.converged, true);
assert.equal(productionSurface.intercepts.pureAxial.tension.converged, true);
assert.ok(productionSurface.levels.every((level) => level.points.every((point) => Math.abs(point.axialResidual) <= 1e-5)));

console.log(JSON.stringify({
  milestone: 'P8-M6-worker-C',
  verificationIds: Array.from({ length: 8 }, (_, index) => `NL-PMM-${String(index + 1).padStart(2, '0')}`),
  sourceHash: surface.sourceHash,
  surfaceHash: surface.surfaceHash,
  levels: surface.summary.axialLevelCount,
  angles: surface.summary.angleCount,
  sectionSolves: surface.summary.sectionSolveCount,
  nodeCapacity: node.momentCapacity,
  updatedCapacity: changed.momentCapacity,
  updatedTangent: changed.tangent,
  productionSectionSolves: productionSurface.summary.sectionSolveCount,
}, null, 2));

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function close(actual, expected, tolerance, label) {
  const error = Math.abs(actual - expected);
  assert.ok(error <= tolerance * Math.max(1, Math.abs(expected)), `${label}: ${actual} != ${expected}`);
}
