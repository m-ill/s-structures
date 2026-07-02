export const DYNAMIC_COMPLETENESS_VERSION = 'p3-m13-dynamic-completeness';

export function combineModalCqc(responses, dampingRatio = 0.05) {
  let sum = 0;
  for (const a of responses) for (const b of responses) sum += rho(a.period, b.period, dampingRatio) * a.displacement * b.displacement;
  return Math.sqrt(Math.max(0, sum));
}

export function estimateMemberEulerBuckling(member, result) {
  const L = result?.L || 0; const E = result?.material?.E || result?.check?.inputs?.Fa || 0; const I = Math.min(result?.section?.Iy || 0, result?.section?.Iz || 0);
  return { version: DYNAMIC_COMPLETENESS_VERSION, memberId: member.id, pcr: L > 0 ? Math.PI ** 2 * E * I / L ** 2 : 0, method: 'Euler pinned-pinned preliminary' };
}

export function runLinearSdofTha({ period = 1, dampingRatio = 0.05, dt = 0.02, accelerations = [] } = {}) {
  const w = 2 * Math.PI / period; let u = 0; let v = 0; const rows = [];
  for (let i = 0; i < accelerations.length; i += 1) {
    const a = -accelerations[i] - 2 * dampingRatio * w * v - w * w * u;
    v += a * dt; u += v * dt; rows.push({ step: i, time: i * dt, displacement: u, velocity: v, acceleration: a });
  }
  return { version: DYNAMIC_COMPLETENESS_VERSION, method: 'linear-sdof-explicit-trace', maxDisplacement: Math.max(0, ...rows.map((row) => Math.abs(row.displacement))), rows };
}

function rho(Ti, Tj, zeta) {
  const r = Math.max(Ti, Tj) / Math.max(1e-12, Math.min(Ti, Tj));
  return (8 * zeta ** 2 * (1 + r) * r ** 1.5) / ((1 - r ** 2) ** 2 + 4 * zeta ** 2 * r * (1 + r) ** 2) || 1;
}
