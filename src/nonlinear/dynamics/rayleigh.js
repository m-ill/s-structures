export const RAYLEIGH_DAMPING_VERSION = 'p3-m16-rayleigh-damping';

export function solveRayleighDamping({ w1 = 1, w2 = 2, zeta1 = 0.05, zeta2 = 0.05 } = {}) {
  const a = [[1 / (2 * w1), w1 / 2], [1 / (2 * w2), w2 / 2]];
  const det = a[0][0] * a[1][1] - a[0][1] * a[1][0];
  const alpha = det ? (zeta1 * a[1][1] - a[0][1] * zeta2) / det : 0;
  const beta = det ? (a[0][0] * zeta2 - zeta1 * a[1][0]) / det : 0;
  return { version: RAYLEIGH_DAMPING_VERSION, alpha, beta, targets: { w1, w2, zeta1, zeta2 } };
}

export function dampingRatioAtFrequency(rayleigh, omega) {
  const w = Math.max(1e-12, Number(omega) || 0);
  return (Number(rayleigh.alpha || 0) / w + Number(rayleigh.beta || 0) * w) / 2;
}
