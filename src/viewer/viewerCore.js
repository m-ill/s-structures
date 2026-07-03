import { vcross, vdot, vnorm, vsub } from '../core/vector.js';

export const VIEWER_CORE_VERSION = 'p3-viewer-core-v1';

/**
 * Pure camera/projection math, kept free of any GL calls so it can be unit
 * tested in node. `createGlContext` (bottom of file) is the only part that
 * touches a real canvas/WebGL2 context.
 */

export function perspective(fovYRadians, aspect, near, far) {
  const f = 1 / Math.tan(fovYRadians / 2);
  const nf = 1 / (near - far);
  return [
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ];
}

export function orbitEye(target, distance, azimuthRadians, elevationRadians) {
  const cosEl = Math.cos(elevationRadians);
  return [
    target[0] + distance * cosEl * Math.sin(azimuthRadians),
    target[1] + distance * Math.sin(elevationRadians),
    target[2] + distance * cosEl * Math.cos(azimuthRadians),
  ];
}

export function lookAt(eye, target, up = [0, 1, 0]) {
  const z = vnorm(vsub(eye, target));
  const x = vnorm(vcross(up, z));
  const y = vcross(z, x);
  return [
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -vdot(x, eye), -vdot(y, eye), -vdot(z, eye), 1,
  ];
}

export function multiplyMat4(a, b) {
  const out = new Array(16).fill(0);
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) sum += a[k * 4 + row] * b[col * 4 + k];
      out[col * 4 + row] = sum;
    }
  }
  return out;
}

export function transformPoint(mat, point) {
  const [x, y, z] = point;
  const w = mat[3] * x + mat[7] * y + mat[11] * z + mat[15];
  const rw = w !== 0 ? 1 / w : 1;
  return [
    (mat[0] * x + mat[4] * y + mat[8] * z + mat[12]) * rw,
    (mat[1] * x + mat[5] * y + mat[9] * z + mat[13]) * rw,
    (mat[2] * x + mat[6] * y + mat[10] * z + mat[14]) * rw,
  ];
}

/** Screen-space (NDC [-1,1]) to a world-space ray for element picking. */
export function screenToRay(ndcX, ndcY, viewProjInverse, eye) {
  const far = transformPoint(viewProjInverse, [ndcX, ndcY, 1]);
  return { origin: eye, direction: vnorm(vsub(far, eye)) };
}

export function createOrbitCamera(options = {}) {
  let target = options.target || [0, 0, 0];
  let distance = options.distance ?? 20;
  let azimuth = options.azimuth ?? Math.PI / 4;
  let elevation = clamp(options.elevation ?? Math.PI / 6, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
  const minDistance = options.minDistance ?? 0.5;
  const maxDistance = options.maxDistance ?? 1e5;

  return {
    get state() { return { target, distance, azimuth, elevation }; },
    orbit(dAzimuth, dElevation) {
      azimuth += dAzimuth;
      elevation = clamp(elevation + dElevation, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
    },
    zoom(factor) {
      distance = clamp(distance * factor, minDistance, maxDistance);
    },
    pan(dx, dy) {
      target = [target[0] + dx, target[1] + dy, target[2]];
    },
    viewMatrix() {
      const eye = orbitEye(target, distance, azimuth, elevation);
      return lookAt(eye, target);
    },
    eye() {
      return orbitEye(target, distance, azimuth, elevation);
    },
  };
}

function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }

/**
 * Real WebGL2 bootstrap — not exercised by node tests, only by a browser.
 * Kept isolated so viewerCore's math stays testable without a GL context.
 */
export function createGlContext(canvas, options = {}) {
  const gl = canvas.getContext('webgl2', { antialias: true, ...options });
  if (!gl) throw new Error('WebGL2 is not available in this browser.');
  gl.enable(gl.DEPTH_TEST);
  gl.clearColor(0.06, 0.07, 0.09, 1);
  return gl;
}
