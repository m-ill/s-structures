export const BEAM_INTERPOLATION_VERSION = 'p14-m1-beam-interpolation-v1';

export const GAUSS5 = Object.freeze([
  Object.freeze([-0.906179845938664, 0.236926885056189]),
  Object.freeze([-0.538469310105683, 0.478628670499366]),
  Object.freeze([0, 0.568888888888889]),
  Object.freeze([0.538469310105683, 0.478628670499366]),
  Object.freeze([0.906179845938664, 0.236926885056189]),
]);

export function beamShapes(r, L, phi = 0) {
  const r2 = r * r;
  const r3 = r2 * r;
  const normalizedPhi = positivePhi(phi);
  if (normalizedPhi > 0) {
    const denominator = 1 + normalizedPhi;
    const shearTerm = (normalizedPhi / 2) * r * (1 - r);
    return [
      (1 - 3 * r2 + 2 * r3 + normalizedPhi * (1 - r)) / denominator,
      (L * (r - 2 * r2 + r3 + shearTerm)) / denominator,
      (3 * r2 - 2 * r3 + normalizedPhi * r) / denominator,
      (L * (r3 - r2 - shearTerm)) / denominator,
    ];
  }
  return [
    1 - 3 * r2 + 2 * r3,
    L * (r - 2 * r2 + r3),
    3 * r2 - 2 * r3,
    L * (r3 - r2),
  ];
}

export function beamRotationShapes(r, L, phi = 0) {
  if (!(L > 0)) return [0, 0, 0, 0];
  const normalizedPhi = positivePhi(phi);
  if (!(normalizedPhi > 0)) {
    return [
      (-6 * r + 6 * r * r) / L,
      1 - 4 * r + 3 * r * r,
      (6 * r - 6 * r * r) / L,
      3 * r * r - 2 * r,
    ];
  }
  const denominator = 1 + normalizedPhi;
  const parabolic = (3 * r * (1 - r)) / denominator;
  return [
    (-6 * r * (1 - r)) / (denominator * L),
    (1 - r) - parabolic,
    (6 * r * (1 - r)) / (denominator * L),
    r - parabolic,
  ];
}

export function bendingPhi(timoshenko = {}, plane = 'z') {
  if (timoshenko?.enabled !== true) return 0;
  return positivePhi(plane === 'y' ? timoshenko.phiY : timoshenko.phiZ);
}

export function integrateGauss(a, b, fn) {
  const mid = (a + b) / 2;
  const half = (b - a) / 2;
  for (const [point, weight] of GAUSS5) fn(mid + half * point, half * weight);
}

export function integrateGaussPhysical(a, b, fn) {
  integrateGauss(a, b, (ratio, weight) => fn(ratio, weight));
}

function positivePhi(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}
