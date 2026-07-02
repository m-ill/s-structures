import assert from 'node:assert/strict';
import {
  createOrbitCamera, lookAt, multiplyMat4, orbitEye, perspective, transformPoint,
} from '../src/viewer/viewerCore.js';

function approxEqual(a, b, tol = 1e-6) {
  assert.ok(Math.abs(a - b) < tol, `expected ${a} ~= ${b}`);
}

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
assert.deepEqual(multiplyMat4(IDENTITY, IDENTITY), IDENTITY);

// orbitEye at azimuth=0, elevation=0 sits on +z axis at the given distance
const eye0 = orbitEye([0, 0, 0], 10, 0, 0);
approxEqual(eye0[0], 0);
approxEqual(eye0[1], 0);
approxEqual(eye0[2], 10);

// lookAt maps the target to (0, 0, -distance) in view space
const view = lookAt([0, 0, 5], [0, 0, 0], [0, 1, 0]);
const targetInView = transformPoint(view, [0, 0, 0]);
approxEqual(targetInView[0], 0);
approxEqual(targetInView[1], 0);
approxEqual(targetInView[2], -5);

// the eye itself maps to the view-space origin
const eyeInView = transformPoint(view, [0, 0, 5]);
approxEqual(eyeInView[0], 0);
approxEqual(eyeInView[1], 0);
approxEqual(eyeInView[2], 0);

// perspective: 90-degree vertical FOV gives f = 1
const proj = perspective(Math.PI / 2, 1, 0.1, 1000);
approxEqual(proj[0], 1, 1e-4);
approxEqual(proj[5], 1, 1e-4);
assert.equal(proj[11], -1);

// orbit camera state and clamping
const camera = createOrbitCamera({ target: [1, 2, 3], distance: 20, azimuth: 0, elevation: 0, minDistance: 5, maxDistance: 50 });
assert.deepEqual(camera.state.target, [1, 2, 3]);
camera.zoom(10); // would exceed maxDistance without clamping
assert.equal(camera.state.distance, 50);
camera.zoom(0.001);
assert.equal(camera.state.distance, 5);
camera.orbit(0, Math.PI); // large elevation delta must clamp near +/- 90 degrees
assert.ok(camera.state.elevation < Math.PI / 2);
camera.pan(1, 1);
assert.deepEqual(camera.state.target, [2, 3, 3]);

const viewFromCamera = camera.viewMatrix();
assert.equal(viewFromCamera.length, 16);

console.log(JSON.stringify({ ok: true, version: 'p3-viewer-core' }, null, 2));
