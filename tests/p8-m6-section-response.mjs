import assert from 'node:assert/strict';
import {
  commitSectionResponse,
  evaluateSectionResponse,
  finiteDifferenceSectionTangent,
  rollbackSectionResponse,
  sectionStateSnapshot,
} from '../src/nonlinear/fiber/sectionResponse.js';
import {
  checkElementIntegrationPointConvergence,
  checkFiberMeshConvergence,
  runAdaptiveMomentCurvature,
  solveAtTargetAxialForce,
  solveSectionAxialEquilibrium,
  solveTargetAxial,
  traceBiaxialCurvaturePath,
} from '../src/nonlinear/fiber/momentCurvatureV2.js';
import { createSteelBilinearMaterial } from '../src/nonlinear/fiber/materialModels.js';
import { buildSteelSectionMesh } from '../src/nonlinear/fiber/sectionMesh.js';

const verificationIds = [
  'NL-FIB-07',
  'NL-FIB-08',
  'NL-FIB-09',
  'NL-FIB-10',
  'NL-FIB-11',
  'NL-FIB-12',
  'NL-FIB-13',
  'NL-FIB-14',
];

const E = 200e9;
const elasticSteel = createSteelBilinearMaterial({ id: 'elastic-steel', E, Fy: 1e12, hardeningRatio: 0.01 });
const symmetric = {
  id: 'SYM-4',
  fibers: [
    { id: 'F1', area: 0.01, y: -0.2, z: -0.3, materialId: 'steel' },
    { id: 'F2', area: 0.01, y: 0.2, z: -0.3, materialId: 'steel' },
    { id: 'F3', area: 0.01, y: -0.2, z: 0.3, materialId: 'steel' },
    { id: 'F4', area: 0.01, y: 0.2, z: 0.3, materialId: 'steel' },
  ],
};
const materials = { steel: elasticSteel };

// NL-FIB-07: direct integration and the documented sign convention.
const deformation = { epsilon0: 2e-5, kappaY: 1e-4, kappaZ: -5e-5 };
const response = evaluateSectionResponse(symmetric, deformation, { materials });
const direct = symmetric.fibers.reduce((sum, fiber) => {
  const strain = deformation.epsilon0 - deformation.kappaY * fiber.z + deformation.kappaZ * fiber.y;
  const force = E * strain * fiber.area;
  sum.N += force;
  sum.My -= force * fiber.z;
  sum.Mz += force * fiber.y;
  return sum;
}, { N: 0, My: 0, Mz: 0 });
assertClose(response.N, direct.N, 1e-12, 'NL-FIB-07 N direct sum');
assertClose(response.My, direct.My, 1e-12, 'NL-FIB-07 My direct sum');
assertClose(response.Mz, direct.Mz, 1e-12, 'NL-FIB-07 Mz direct sum');
assert.equal(response.convention.formula, 'epsilon=epsilon0-kappaY*z+kappaZ*y');

// NL-FIB-08: all nine tangent entries against centered finite differences.
const tangentCheck = finiteDifferenceSectionTangent(symmetric, deformation, {
  materials,
  steps: [1e-9, 1e-9, 1e-9],
});
assert.ok(tangentCheck.relativeError < 2e-9, `NL-FIB-08 tangent relative error ${tangentCheck.relativeError}`);
assert.equal(tangentCheck.symmetryError, 0);

// NL-FIB-09: safeguarded axial equilibrium under simultaneous biaxial curvature.
const targetN = 1.6e6;
const axial = solveSectionAxialEquilibrium(symmetric, {
  materials,
  targetN,
  kappaY: 7e-5,
  kappaZ: -4e-5,
  initialBracket: 1e-8,
  forceTolerance: 1e-5,
  relativeTolerance: 1e-12,
});
assert.equal(axial.converged, true, axial.failureCode);
assert.ok(Math.abs(axial.residual) <= axial.residualLimit);
assertClose(axial.epsilon0, targetN / (E * 0.04), 1e-11, 'NL-FIB-09 epsilon0');
assert.ok(axial.history.some((row) => row.method === 'newton' || row.method === 'bisection'));
assert.equal(solveTargetAxial, solveSectionAxialEquilibrium);
assert.equal(solveAtTargetAxialForce, solveSectionAxialEquilibrium);

// NL-FIB-10: elastic steel M-phi slope has the closed-form EI value.
const productionHMesh = buildSteelSectionMesh({
  id: 'H-400x200',
  shape: 'H',
  params: { H: 400, B: 200, tw: 8, tf: 12 },
  paramsUnits: { length: 'mm' },
}, { materialId: 'steel', refinement: { level: 2 } });
const steelTrace = runAdaptiveMomentCurvature(productionHMesh, {
  materials,
  targetN: 0,
  direction: { kappaY: 0, kappaZ: 1 },
  maxCurvature: 2e-4,
  initialIncrement: 5e-5,
  maxIncrement: 1e-4,
  minIncrement: 1e-8,
});
assert.equal(steelTrace.converged, true, steelTrace.termination?.code);
const steelLast = steelTrace.rows.at(-1);
const expectedSteelIz = productionHMesh.fibers.reduce((sum, fiber) => sum + fiber.area * fiber.y ** 2, 0);
assertClose(steelLast.Mz, E * expectedSteelIz * steelLast.kappaZ, 1e-10, 'NL-FIB-10 elastic M-phi');
assert.ok(Math.abs(expectedSteelIz - productionHMesh.summary.Iz) / productionHMesh.summary.Iz < 0.01);
assertClose(productionHMesh.summary.bounds.maxY - productionHMesh.summary.bounds.minY, 0.4, 1e-12, 'Phase 7 H maps to local y depth');
assertClose(productionHMesh.summary.bounds.maxZ - productionHMesh.summary.bounds.minZ, 0.2, 1e-12, 'Phase 7 B maps to local z width');

// NL-FIB-11: composite RC-like section at two axial-force ratios.
const rcLike = {
  id: 'RC-COMPOSITE',
  family: 'reinforced-concrete',
  fibers: [
    { id: 'C1', area: 0.06, y: -0.12, z: 0, materialId: 'concrete' },
    { id: 'C2', area: 0.06, y: 0.12, z: 0, materialId: 'concrete' },
    { id: 'R1', area: 0.001, y: -0.18, z: 0, materialId: 'rebar' },
    { id: 'R2', area: 0.001, y: 0.18, z: 0, materialId: 'rebar' },
  ],
};
const rcMaterials = {
  concrete: { E: 30e9 },
  rebar: { E: 200e9 },
};
const rcEA = 2 * 0.06 * 30e9 + 2 * 0.001 * 200e9;
const rcEI = 2 * 0.06 * 30e9 * 0.12 ** 2 + 2 * 0.001 * 200e9 * 0.18 ** 2;
for (const axialForce of [0, 0.15 * rcEA * 0.001]) {
  const trace = traceBiaxialCurvaturePath(rcLike, {
    materials: rcMaterials,
    targetN: axialForce,
    path: [{ kappaY: 0, kappaZ: 1e-4 }],
  });
  assert.equal(trace.converged, true, trace.termination?.code);
  assertClose(trace.rows[0].epsilon0, axialForce / rcEA, 1e-10, 'NL-FIB-11 axial strain');
  assertClose(trace.rows[0].Mz, rcEI * 1e-4, 1e-10, 'NL-FIB-11 composite M-phi');
}

// NL-FIB-12: isotropic square response rotates with the curvature vector.
const square = {
  id: 'SQUARE',
  fibers: [
    { id: 'Q1', area: 0.01, y: -0.2, z: -0.2, materialId: 'steel' },
    { id: 'Q2', area: 0.01, y: 0.2, z: -0.2, materialId: 'steel' },
    { id: 'Q3', area: 0.01, y: -0.2, z: 0.2, materialId: 'steel' },
    { id: 'Q4', area: 0.01, y: 0.2, z: 0.2, materialId: 'steel' },
  ],
};
const angle = 0.37;
const magnitude = 1.2e-4;
const biaxial = traceBiaxialCurvaturePath(square, {
  materials,
  targetN: 0,
  path: [{ kappaY: magnitude * Math.cos(angle), kappaZ: magnitude * Math.sin(angle) }],
});
assert.equal(biaxial.converged, true);
const biaxialRow = biaxial.rows[0];
assertClose(biaxialRow.My / biaxialRow.Mz, Math.cos(angle) / Math.sin(angle), 1e-10, 'NL-FIB-12 rotation ratio');
assertClose(Math.hypot(biaxialRow.My, biaxialRow.Mz), E * 0.0016 * magnitude, 1e-10, 'NL-FIB-12 resultant');

// NL-FIB-13: production material trial is pure; commit and rollback are exact.
const yieldingSteel = createSteelBilinearMaterial({ id: 'yielding-steel', E, Fy: 250e6, hardeningRatio: 0.01 });
const oneFiber = { id: 'ONE', fibers: [{ id: 'Y1', area: 0.02, y: 0, z: 0, materialId: 'steel' }] };
const yielded = evaluateSectionResponse(oneFiber, { epsilon0: 0.002 }, { materials: { steel: yieldingSteel } });
const initialSnapshot = sectionStateSnapshot(yielded.committedState);
assert.equal(sectionStateSnapshot(yielded.committedState), initialSnapshot);
assert.ok(yielded.energy.work > 0);
assert.ok(yielded.energy.dissipated >= 0);
const committed = commitSectionResponse(yielded);
assert.equal(committed.status, 'committed');
assert.equal(committed.fiberStates.Y1.status, 'committed');
const reverseTrial = evaluateSectionResponse(oneFiber, { epsilon0: 0.001 }, {
  materials: { steel: yieldingSteel },
  committedState: committed,
});
assert.equal(sectionStateSnapshot(rollbackSectionResponse(reverseTrial)), sectionStateSnapshot(committed));
assert.equal(sectionStateSnapshot(committed), sectionStateSnapshot(reverseTrial.committedState));

// NL-FIB-14: midpoint fiber mesh and Gauss integration-point refinement converge.
const meshConvergence = checkFiberMeshConvergence((level) => rectangleMesh(level, 0.4, 0.6), {
  levels: [4, 8, 16, 32],
  tolerance: 0.004,
  materials,
  deformation: { kappaZ: 1e-4 },
});
assert.equal(meshConvergence.converged, true, `mesh error ${meshConvergence.finalRelativeChange}`);
const integrationConvergence = checkElementIntegrationPointConvergence(square, {
  orders: [2, 3, 4],
  length: 3,
  tolerance: 1e-12,
  materials,
  deformationAt: (x, _xi, length) => ({ kappaZ: 1e-4 * (x / length) ** 4 }),
});
assert.equal(integrationConvergence.converged, true, `integration error ${integrationConvergence.finalRelativeChange}`);

console.log(JSON.stringify({
  verificationIds,
  tangentRelativeError: tangentCheck.relativeError,
  axialResidual: axial.residual,
  steelMomentSlope: steelLast.Mz / steelLast.kappaZ,
  meshFinalRelativeChange: meshConvergence.finalRelativeChange,
  integrationFinalRelativeChange: integrationConvergence.finalRelativeChange,
  rollbackExact: sectionStateSnapshot(rollbackSectionResponse(reverseTrial)) === sectionStateSnapshot(committed),
}, null, 2));

function rectangleMesh(level, width, depth) {
  const fibers = [];
  const dy = width / level;
  const dz = depth / level;
  for (let iy = 0; iy < level; iy += 1) {
    for (let iz = 0; iz < level; iz += 1) {
      fibers.push({
        id: `F-${iy}-${iz}`,
        area: dy * dz,
        y: -width / 2 + (iy + 0.5) * dy,
        z: -depth / 2 + (iz + 0.5) * dz,
        materialId: 'steel',
      });
    }
  }
  return { id: `RECT-${level}`, fibers };
}

function assertClose(actual, expected, tolerance, label) {
  const relative = Math.abs(actual - expected) / Math.max(1, Math.abs(actual), Math.abs(expected));
  assert.ok(relative <= tolerance, `${label}: actual=${actual}, expected=${expected}, relative=${relative}`);
}
