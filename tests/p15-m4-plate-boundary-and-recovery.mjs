import assert from 'node:assert/strict';
import {
  buildPlateBoundaryTemplate,
  createRectangularPlateMesh,
  solveRectangularPlate,
} from '../src/index.js';

const mesh = createRectangularPlateMesh({ id: 'P15-M4-20X4', width: 5, height: 1, nx: 20, ny: 4 });
const soft = buildPlateBoundaryTemplate(mesh, 'simply-supported-soft');
const legacy = buildPlateBoundaryTemplate(mesh, 'simply-supported');
const hard = buildPlateBoundaryTemplate(mesh, 'simply-supported-hard');
const clamped = buildPlateBoundaryTemplate(mesh, 'clamped');

assert.equal(legacy.support, 'simply-supported-soft');
assert.deepEqual(legacy.constrainedDofs, soft.constrainedDofs, 'legacy simply-supported must preserve the Phase 14 soft boundary');
assert.ok(hard.constrainedDofs.length > soft.constrainedDofs.length);
assert.ok(hard.constrainedDofs.length < clamped.constrainedDofs.length);

for (const nodeId of mesh.boundary.u0) assert.ok(hard.preview[nodeId].includes('rx'), `${nodeId} x-edge rx`);
for (const nodeId of mesh.boundary.u1) assert.ok(hard.preview[nodeId].includes('rx'), `${nodeId} x-edge rx`);
for (const nodeId of mesh.boundary.v0) assert.ok(hard.preview[nodeId].includes('ry'), `${nodeId} y-edge ry`);
for (const nodeId of mesh.boundary.v1) assert.ok(hard.preview[nodeId].includes('ry'), `${nodeId} y-edge ry`);

const properties = { E: 30e9, nu: 0.3, t: 0.2, density: 0, shearFactor: 0.61 };
const run = solveRectangularPlate(mesh, properties, { pressure: 100 }, { support: 'simply-supported-hard' });
assert.equal(run.support, 'simply-supported-hard');
assert.equal(run.center.shearFactor, 0.61, 'recovery must use the element shear correction factor');
assert.equal(run.dimensionlessReferenceLength, 1, 'dimensionless coefficient must use the short plate side');
assert.equal(run.energy.passed, true);

console.log(JSON.stringify({
  ok: true,
  milestone: 'P15-M4',
  constrainedDofs: {
    soft: soft.constrainedDofs.length,
    hard: hard.constrainedDofs.length,
    clamped: clamped.constrainedDofs.length,
  },
  shearFactor: run.center.shearFactor,
  referenceLength: run.dimensionlessReferenceLength,
}, null, 2));
