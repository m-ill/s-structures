import assert from 'node:assert/strict';
import {
  createOrbitCamera, lookAt, multiplyMat4, orbitEye, perspective, transformPoint,
} from '../src/viewer/viewerCore.js';
import { createViewerState, getViewerState, setViewerSlice, VIEWER_STATE_VERSION } from '../src/viewer/viewerState.js';
import { buildModelLayerData, MODEL_LAYER_VERSION } from '../src/viewer/modelLayer.js';
import { filterBySlice, isPointInSlice, normalizeSliceBox, SLICE_CONTROL_VERSION } from '../src/viewer/sliceControl.js';
import { buildPickingTable, decodePickColor, encodePickId, PICKING_VERSION, resolvePick } from '../src/viewer/picking.js';

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

const host = {};
const initialViewer = getViewerState(host);
assert.equal(initialViewer.version, VIEWER_STATE_VERSION);
assert.equal(initialViewer.slice.enabled, false);
assert.equal(initialViewer.slice.zMin, null);
const sliced = setViewerSlice(host, { enabled: true, zMin: 6, zMax: 2 });
assert.equal(sliced.slice.enabled, true);
assert.deepEqual([sliced.slice.zMin, sliced.slice.zMax], [2, 6]);
assert.equal(getViewerState(host).slice.zMax, 6);
assert.equal(createViewerState({ slice: { active: true, minZ: 1, maxZ: 4 } }).slice.enabled, true);

const slice = normalizeSliceBox({ enabled: true, zMin: 4, zMax: 1 });
assert.equal(slice.version, SLICE_CONTROL_VERSION);
assert.deepEqual([slice.zMin, slice.zMax], [1, 4]);
assert.equal(isPointInSlice({ z: 3 }, slice), true);
assert.equal(isPointInSlice({ z: 5 }, slice), false);
assert.deepEqual(filterBySlice([{ z: 0 }, { z: 2 }, { z: 6 }], slice).rows, [{ z: 2 }]);

const layer = buildModelLayerData({
  nodes: [
    { id: 'N1', x: 0, y: 0, z: 0 },
    { id: 'N2', x: 0, y: 0, z: 3 },
    { id: 'N3', x: 0, y: 0, z: 6 },
  ],
  members: [
    { id: 'M1', n1: 'N1', n2: 'N2', design: { role: 'column' }, confidence: 0.95 },
    { id: 'M2', n1: 'N2', n2: 'N3', design: { role: 'beam' }, confidence: 0.4 },
  ],
}, { slice: { enabled: true, zMin: 0, zMax: 3 }, colorBy: 'confidence' });
assert.equal(layer.version, MODEL_LAYER_VERSION);
assert.equal(layer.metadata.nodeCount, 2);
assert.equal(layer.metadata.memberCount, 2);
assert.deepEqual(layer.members[0].color, [30, 160, 90]);
assert.deepEqual(layer.members[1].color, [210, 70, 70]);

const pickTable = buildPickingTable([{ type: 'node', id: 'N1' }, { type: 'member', id: 'M1' }]);
assert.equal(pickTable.version, PICKING_VERSION);
assert.deepEqual(encodePickId(2), [0, 0, 2]);
assert.equal(decodePickColor([0, 0, 2]), 2);
assert.equal(resolvePick(pickTable, [0, 0, 2]).id, 'M1');

console.log(JSON.stringify({ ok: true, version: 'p3-viewer-core' }, null, 2));
