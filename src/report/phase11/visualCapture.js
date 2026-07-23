import { sha256Bytes, stableHash } from '../../core/stableHash.js';

export const P11_CAPTURE_SPEC_VERSION = 'p11-capture-spec-v1';
export const P11_EVIDENCE_MANIFEST_VERSION = 'p11-evidence-manifest-v1';
export const P11_CAPTURE_PROFILE = Object.freeze({
  id: 'p11-report-1600x900-v1',
  viewport: Object.freeze({ width: 1600, height: 900 }),
  pixelRatio: 1,
  background: '#ffffff',
  stabilizationFrames: 2,
  timeoutMs: 10000,
});

export const P11_CAPTURE_FAILURE_CODES = Object.freeze([
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

export function createCaptureSpec(input = {}) {
  const spec = {
    version: P11_CAPTURE_SPEC_VERSION,
    profileId: input.profileId || P11_CAPTURE_PROFILE.id,
    kind: string(input.kind),
    required: input.required !== false,
    reportSnapshotHash: string(input.reportSnapshotHash),
    modelDomainHash: string(input.modelDomainHash),
    resultHash: string(input.resultHash),
    comboId: input.comboId == null ? null : string(input.comboId),
    camera: {
      projection: input.camera?.projection || 'orthographic',
      yaw: finite(input.camera?.yaw, -Math.PI / 4),
      pitch: finite(input.camera?.pitch, Math.PI / 6),
      target: vector3(input.camera?.target),
      zoom: finite(input.camera?.zoom, 1),
    },
    viewport: {
      width: integer(input.viewport?.width, P11_CAPTURE_PROFILE.viewport.width),
      height: integer(input.viewport?.height, P11_CAPTURE_PROFILE.viewport.height),
    },
    pixelRatio: finite(input.pixelRatio, P11_CAPTURE_PROFILE.pixelRatio),
    layers: [...new Set((input.layers || ['base']).map(string))].sort(),
    deformScale: finite(input.deformScale, 1),
    background: input.background || P11_CAPTURE_PROFILE.background,
  };
  const validation = validateCaptureSpec(spec);
  if (!validation.ok) throw captureError('CAPTURE_SPEC_INVALID', validation.errors.join(', '));
  return deepFreeze({ ...spec, captureSpecHash: stableHash(spec) });
}

export function validateCaptureSpec(spec) {
  const errors = [];
  if (spec?.version !== P11_CAPTURE_SPEC_VERSION) errors.push('version');
  if (!spec?.kind) errors.push('kind');
  for (const key of ['reportSnapshotHash', 'modelDomainHash', 'resultHash']) {
    if (!/^[a-f0-9]{24,64}$/.test(spec?.[key] || '')) errors.push(key);
  }
  if (spec?.viewport?.width < 1600 || spec?.viewport?.height < 900) errors.push('viewport');
  if (!(spec?.pixelRatio > 0 && spec.pixelRatio <= 4)) errors.push('pixelRatio');
  if (!Array.isArray(spec?.layers) || !spec.layers.length) errors.push('layers');
  if (!(spec?.deformScale > 0)) errors.push('deformScale');
  if (!['orthographic', 'perspective'].includes(spec?.camera?.projection)) errors.push('camera.projection');
  if (!spec?.camera?.target?.every(Number.isFinite)) errors.push('camera.target');
  const { captureSpecHash, ...hashable } = spec || {};
  if (captureSpecHash && stableHash(hashable) !== captureSpecHash) errors.push('captureSpecHash');
  return { ok: errors.length === 0, errors };
}

export async function captureVisualEvidence({
  snapshot,
  spec,
  baseCanvas,
  overlayCanvas,
  canvasFactory,
  viewAdapter = null,
  document = null,
  signal = null,
  timeoutMs = P11_CAPTURE_PROFILE.timeoutMs,
  now = () => Date.now(),
}) {
  assertCurrent(snapshot, spec);
  const priorState = viewAdapter?.getState ? structuredClone(viewAdapter.getState()) : null;
  let outputCanvas = null;
  let timer = null;
  let timedOut = false;
  const started = now();
  try {
    if (signal?.aborted) throw captureError('CAPTURE_CANCELLED', 'Capture was cancelled.');
    const timeout = new Promise((_resolve, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        reject(captureError('CAPTURE_TIMEOUT', 'Capture timed out.'));
      }, timeoutMs);
    });
    return await Promise.race([runCapture(), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
    let restoreError = null;
    try {
      if (priorState != null && viewAdapter?.restoreState) await viewAdapter.restoreState(structuredClone(priorState));
    } catch (error) {
      restoreError = error;
    }
    if (outputCanvas) {
      outputCanvas.width = 0;
      outputCanvas.height = 0;
    }
    if (restoreError && !timedOut) throw captureError('CAPTURE_VIEW_RESTORE_FAILED', restoreError.message);
  }

  async function runCapture() {
    if (viewAdapter?.applySpec) await viewAdapter.applySpec(spec);
    await waitForReadiness({ document, baseCanvas, overlayCanvas, signal });
    if (viewAdapter?.render) await viewAdapter.render(spec);
    await nextFrames(document?.defaultView, P11_CAPTURE_PROFILE.stabilizationFrames, signal);
    outputCanvas = composeCanvasFrame({ baseCanvas, overlayCanvas, spec, canvasFactory });
    const content = analyzeCanvasContent(outputCanvas);
    if (content.blank) throw captureError('CAPTURE_BLANK', 'Capture is blank or single-color.');
    const bytes = await encodePng(outputCanvas);
    const png = validatePng(bytes, spec.viewport);
    if (!png.ok) throw captureError(png.code, png.message);
    const result = {
      kind: spec.kind,
      captureSpecHash: spec.captureSpecHash,
      reportSnapshotHash: spec.reportSnapshotHash,
      modelDomainHash: spec.modelDomainHash,
      resultHash: spec.resultHash,
      comboId: spec.comboId,
      width: png.width,
      height: png.height,
      bytes: bytes.byteLength,
      sha256: sha256Bytes(bytes),
      content,
      durationMs: Math.max(0, now() - started),
      pngBytes: bytes,
    };
    return Object.freeze(result);
  }
}

export function composeCanvasFrame({ baseCanvas, overlayCanvas, spec, canvasFactory }) {
  if (!baseCanvas || !overlayCanvas || typeof canvasFactory !== 'function') {
    throw captureError('CAPTURE_CANVAS_UNAVAILABLE', 'Base, overlay and canvas factory are required.');
  }
  const width = Math.round(spec.viewport.width * spec.pixelRatio);
  const height = Math.round(spec.viewport.height * spec.pixelRatio);
  const canvas = canvasFactory(width, height);
  if (!canvas) throw captureError('CAPTURE_CANVAS_UNAVAILABLE', 'Canvas factory returned no canvas.');
  try {
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext?.('2d', { alpha: false, willReadFrequently: true });
    if (!context) throw captureError('CAPTURE_CONTEXT_UNAVAILABLE', '2D canvas context is unavailable.');
    context.save?.();
    context.fillStyle = spec.background;
    context.fillRect(0, 0, width, height);
    context.drawImage(baseCanvas, 0, 0, width, height);
    context.drawImage(overlayCanvas, 0, 0, width, height);
    context.restore?.();
    return canvas;
  } catch (error) {
    canvas.width = 0;
    canvas.height = 0;
    throw error;
  }
}

export function analyzeCanvasContent(canvas) {
  const context = canvas?.getContext?.('2d', { willReadFrequently: true });
  if (!context?.getImageData) throw captureError('CAPTURE_CONTEXT_UNAVAILABLE', 'Canvas pixels are unavailable.');
  const width = canvas.width;
  const height = canvas.height;
  const stepX = Math.max(1, Math.floor(width / 64));
  const stepY = Math.max(1, Math.floor(height / 36));
  const data = context.getImageData(0, 0, width, height).data;
  const colors = new Set();
  let opaque = 0;
  let samples = 0;
  for (let y = 0; y < height; y += stepY) {
    for (let x = 0; x < width; x += stepX) {
      const offset = (y * width + x) * 4;
      colors.add(`${data[offset]},${data[offset + 1]},${data[offset + 2]},${data[offset + 3]}`);
      if (data[offset + 3] > 0) opaque += 1;
      samples += 1;
      if (colors.size > 16) break;
    }
    if (colors.size > 16) break;
  }
  return {
    sampleCount: samples,
    uniqueColorFloor: colors.size,
    opaqueRatio: samples ? opaque / samples : 0,
    blank: colors.size <= 1 || opaque === 0,
  };
}

export function validatePng(bytes, viewport) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
    return invalid('CAPTURE_ZERO_BYTE', 'PNG has zero bytes.');
  }
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.byteLength < 24 || signature.some((value, index) => bytes[index] !== value)) {
    return invalid('CAPTURE_PNG_INVALID', 'PNG signature or IHDR is invalid.');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16, false);
  const height = view.getUint32(20, false);
  if (width < viewport.width || height < viewport.height) {
    return invalid('CAPTURE_DIMENSION_INVALID', `PNG ${width}x${height} is below ${viewport.width}x${viewport.height}.`);
  }
  return { ok: true, width, height };
}

export function buildEvidenceManifest({ snapshot, captures, sourceRevision = null }) {
  const rows = captures.map(({ pngBytes: _bytes, ...capture }) => capture).sort((a, b) => a.kind.localeCompare(b.kind));
  const core = {
    version: P11_EVIDENCE_MANIFEST_VERSION,
    status: rows.length && rows.every((row) => row.sha256 && row.reportSnapshotHash === snapshot.reportSnapshotHash)
      ? 'complete'
      : 'blocked',
    reportSnapshotHash: snapshot.reportSnapshotHash,
    modelDomainHash: snapshot.sourceBinding.modelDomainHash,
    resultHash: snapshot.sourceBinding.resultHash,
    sourceRevision,
    captures: rows,
  };
  return deepFreeze({ ...core, evidenceManifestHash: stableHash(core) });
}

function assertCurrent(snapshot, spec) {
  if (snapshot?.reportSnapshotHash !== spec?.reportSnapshotHash
    || snapshot?.sourceBinding?.modelDomainHash !== spec?.modelDomainHash
    || snapshot?.sourceBinding?.resultHash !== spec?.resultHash) {
    throw captureError('CAPTURE_STALE_SNAPSHOT', 'Capture spec does not match the report snapshot.');
  }
}

async function waitForReadiness({ document, baseCanvas, overlayCanvas, signal }) {
  if (signal?.aborted) throw captureError('CAPTURE_CANCELLED', 'Capture was cancelled.');
  if (document?.fonts?.ready) {
    try { await document.fonts.ready; } catch { throw captureError('CAPTURE_FONT_NOT_READY', 'Fonts are not ready.'); }
  }
  for (const canvas of [baseCanvas, overlayCanvas]) {
    if (!(canvas.width > 0 && canvas.height > 0)) throw captureError('CAPTURE_IMAGE_NOT_READY', 'Source canvas is not ready.');
  }
}

async function nextFrames(view, count, signal) {
  for (let index = 0; index < count; index += 1) {
    if (signal?.aborted) throw captureError('CAPTURE_CANCELLED', 'Capture was cancelled.');
    await new Promise((resolve) => {
      if (typeof view?.requestAnimationFrame === 'function') view.requestAnimationFrame(() => resolve());
      else queueMicrotask(resolve);
    });
  }
}

async function encodePng(canvas) {
  try {
    if (typeof canvas.convertToBlob === 'function') {
      const blob = await canvas.convertToBlob({ type: 'image/png' });
      if (!blob) throw captureError('CAPTURE_ENCODE_FAILED', 'PNG encoder returned null.');
      return new Uint8Array(await blob.arrayBuffer());
    }
    if (typeof canvas.toBlob === 'function') {
      const blob = await new Promise((resolve, reject) => canvas.toBlob(
        (value) => value ? resolve(value) : reject(captureError('CAPTURE_ENCODE_FAILED', 'PNG encoder returned null.')),
        'image/png',
      ));
      return new Uint8Array(await blob.arrayBuffer());
    }
    throw captureError('CAPTURE_ENCODE_FAILED', 'No PNG encoder is available.');
  } catch (error) {
    if (error?.code === 'CAPTURE_ENCODE_FAILED') throw error;
    throw captureError('CAPTURE_ENCODE_FAILED', 'PNG encoding failed.');
  }
}

function invalid(code, message) {
  return { ok: false, code, message };
}

function vector3(value) {
  return Array.from({ length: 3 }, (_item, index) => finite(value?.[index], 0));
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function integer(value, fallback) {
  return Math.max(1, Math.trunc(finite(value, fallback)));
}

function string(value) {
  return value == null ? '' : String(value);
}

function captureError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
