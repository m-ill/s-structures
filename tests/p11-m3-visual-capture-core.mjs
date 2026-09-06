import assert from 'node:assert/strict';
import {
  P11_CAPTURE_FAILURE_CODES,
  analyzeCanvasContent,
  buildEvidenceManifest,
  captureVisualEvidence,
  createCaptureSpec,
  validateCaptureSpec,
  validatePng,
} from '../src/report/phase11/visualCapture.js';

const HASHES = Object.freeze({
  reportSnapshotHash: 'a'.repeat(64),
  modelDomainHash: 'b'.repeat(64),
  resultHash: 'c'.repeat(64),
});
const snapshot = Object.freeze({
  reportSnapshotHash: HASHES.reportSnapshotHash,
  sourceBinding: Object.freeze({
    modelDomainHash: HASHES.modelDomainHash,
    resultHash: HASHES.resultHash,
  }),
});
const spec = createCaptureSpec({
  kind: 'model-isometric',
  ...HASHES,
  comboId: 'ULS-01',
  layers: ['overlay', 'base', 'overlay'],
});
assert.deepEqual(validateCaptureSpec(spec), { ok: true, errors: [] });
assert.deepEqual(spec.layers, ['base', 'overlay']);
assert.ok(Object.isFrozen(spec));
assert.throws(
  () => createCaptureSpec({ kind: 'small', ...HASHES, viewport: { width: 1599, height: 900 } }),
  hasCode('CAPTURE_SPEC_INVALID'),
);

const initialView = {
  camera: { yaw: 0.1, pitch: 0.2, target: [1, 2, 3], zoom: 1.25 },
  comboId: 'SERVICE-01',
  layers: ['base'],
};
let currentView = structuredClone(initialView);
const adapter = {
  getState: () => currentView,
  applySpec: async (value) => {
    currentView = {
      camera: structuredClone(value.camera),
      comboId: value.comboId,
      layers: [...value.layers],
    };
  },
  render: async () => {},
  restoreState: async (value) => { currentView = value; },
};
const created = [];
const drawOrders = [];
const captures = [];
for (let run = 0; run < 10; run += 1) {
  const result = await captureVisualEvidence({
    snapshot,
    spec,
    baseCanvas: sourceCanvas('base'),
    overlayCanvas: sourceCanvas('overlay'),
    canvasFactory: fakeCanvasFactory({ created, drawOrders }),
    viewAdapter: adapter,
    now: () => 1000,
  });
  captures.push(result);
  assert.deepEqual(currentView, initialView);
}
assert.equal(new Set(captures.map((row) => row.sha256)).size, 1);
assert.equal(new Set(captures.map((row) => `${row.width}x${row.height}`)).size, 1);
assert.equal(captures[0].width, 1600);
assert.equal(captures[0].height, 900);
assert.equal(captures[0].content.blank, false);
assert.ok(captures[0].content.uniqueColorFloor >= 2);
assert.deepEqual(drawOrders, Array.from({ length: 10 }, () => ['base', 'overlay']));
assert.ok(created.every((canvas) => canvas.width === 0 && canvas.height === 0));

const manifest = buildEvidenceManifest({ snapshot, captures: captures.slice(0, 2), sourceRevision: 'test' });
assert.equal(manifest.status, 'complete');
assert.equal(manifest.captures.length, 2);
assert.equal('pngBytes' in manifest.captures[0], false);
assert.match(manifest.evidenceManifestHash, /^[a-f0-9]{64}$/);

const validPng = pngBytes(1600, 900);
assert.deepEqual(validatePng(validPng, spec.viewport), { ok: true, width: 1600, height: 900 });
assert.equal(validatePng(new Uint8Array(), spec.viewport).code, 'CAPTURE_ZERO_BYTE');
assert.equal(validatePng(new Uint8Array(24), spec.viewport).code, 'CAPTURE_PNG_INVALID');
assert.equal(validatePng(pngBytes(1599, 900), spec.viewport).code, 'CAPTURE_DIMENSION_INVALID');

const blankCanvas = fakeOutputCanvas({ blank: true });
assert.equal(analyzeCanvasContent(blankCanvas).blank, true);
await assert.rejects(
  captureVisualEvidence({
    snapshot,
    spec,
    baseCanvas: sourceCanvas('base'),
    overlayCanvas: sourceCanvas('overlay'),
    canvasFactory: () => fakeOutputCanvas({ blank: true }),
  }),
  hasCode('CAPTURE_BLANK'),
);
await assert.rejects(
  captureVisualEvidence({
    snapshot,
    spec,
    baseCanvas: sourceCanvas('base'),
    overlayCanvas: sourceCanvas('overlay'),
    canvasFactory: () => fakeOutputCanvas({ png: new Uint8Array() }),
  }),
  hasCode('CAPTURE_ZERO_BYTE'),
);
await assert.rejects(
  captureVisualEvidence({
    snapshot,
    spec,
    baseCanvas: sourceCanvas('base'),
    overlayCanvas: sourceCanvas('overlay'),
    canvasFactory: () => fakeOutputCanvas({ png: pngBytes(800, 450) }),
  }),
  hasCode('CAPTURE_DIMENSION_INVALID'),
);
await assert.rejects(
  captureVisualEvidence({
    snapshot,
    spec,
    baseCanvas: sourceCanvas('base'),
    overlayCanvas: sourceCanvas('overlay'),
    canvasFactory: () => fakeOutputCanvas({ encoderFailure: true }),
  }),
  hasCode('CAPTURE_ENCODE_FAILED'),
);
await assert.rejects(
  captureVisualEvidence({
    snapshot: { ...snapshot, reportSnapshotHash: 'd'.repeat(64) },
    spec,
    baseCanvas: sourceCanvas('base'),
    overlayCanvas: sourceCanvas('overlay'),
    canvasFactory: () => fakeOutputCanvas(),
  }),
  hasCode('CAPTURE_STALE_SNAPSHOT'),
);

const controller = new AbortController();
controller.abort();
await assert.rejects(
  captureVisualEvidence({
    snapshot,
    spec,
    baseCanvas: sourceCanvas('base'),
    overlayCanvas: sourceCanvas('overlay'),
    canvasFactory: () => fakeOutputCanvas(),
    signal: controller.signal,
  }),
  hasCode('CAPTURE_CANCELLED'),
);

currentView = structuredClone(initialView);
await assert.rejects(
  captureVisualEvidence({
    snapshot,
    spec,
    baseCanvas: sourceCanvas('base'),
    overlayCanvas: sourceCanvas('overlay'),
    canvasFactory: () => fakeOutputCanvas(),
    viewAdapter: {
      getState: adapter.getState,
      applySpec: () => new Promise(() => {}),
      restoreState: adapter.restoreState,
    },
    timeoutMs: 5,
  }),
  hasCode('CAPTURE_TIMEOUT'),
);
assert.deepEqual(currentView, initialView);

assert.deepEqual(P11_CAPTURE_FAILURE_CODES, [
  'CAPTURE_SPEC_INVALID',
  'CAPTURE_STALE_SNAPSHOT',
  'CAPTURE_CANCELLED',
  'CAPTURE_TIMEOUT',
  'CAPTURE_CANVAS_UNAVAILABLE',
  'CAPTURE_CONTEXT_UNAVAILABLE',
  'CAPTURE_FONT_NOT_READY',
  'CAPTURE_IMAGE_NOT_READY',
  'CAPTURE_ENCODE_FAILED',
  'CAPTURE_ZERO_BYTE',
  'CAPTURE_DIMENSION_INVALID',
  'CAPTURE_BLANK',
  'CAPTURE_PNG_INVALID',
  'CAPTURE_VIEW_RESTORE_FAILED',
]);

console.log(JSON.stringify({
  ok: true,
  milestone: 'P11-M3',
  deterministicRuns: captures.length,
  dimensions: `${captures[0].width}x${captures[0].height}`,
  identicalPngHashes: new Set(captures.map((row) => row.sha256)).size === 1,
  viewStateRestored: true,
  orphanCanvasBuffers: created.filter((canvas) => canvas.width || canvas.height).length,
  failureCodes: P11_CAPTURE_FAILURE_CODES.length,
  manifestHash: manifest.evidenceManifestHash,
}, null, 2));

function sourceCanvas(id) {
  return { id, width: 900, height: 560 };
}

function fakeCanvasFactory({ created, drawOrders }) {
  return () => {
    const canvas = fakeOutputCanvas();
    const order = [];
    const context = canvas.getContext('2d');
    context.drawImage = (source) => order.push(source.id);
    created.push(canvas);
    drawOrders.push(order);
    return canvas;
  };
}

function fakeOutputCanvas({ blank = false, png = pngBytes(1600, 900), encoderFailure = false } = {}) {
  const context = {
    save() {},
    restore() {},
    fillRect() {},
    drawImage() {},
    getImageData(_x, _y, width, height) {
      const data = new Uint8ClampedArray(width * height * 4);
      data.fill(255);
      if (!blank) {
        data[0] = 20;
        data[1] = 70;
        data[2] = 140;
      }
      return { data };
    },
  };
  return {
    width: 1600,
    height: 900,
    getContext: () => context,
    convertToBlob: async () => {
      if (encoderFailure) throw new Error('fixture encoder failure');
      return new Blob([png], { type: 'image/png' });
    },
  };
}

function pngBytes(width, height) {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  bytes.set([0, 0, 0, 13, 73, 72, 68, 82], 8);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width, false);
  view.setUint32(20, height, false);
  return bytes;
}

function hasCode(code) {
  return (error) => error?.code === code;
}
