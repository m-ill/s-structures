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
  if (!(Number(period) > 0)) throw new Error('period must be positive.');
  if (!(Number(dt) > 0)) throw new Error('dt must be positive.');
  const zeta = Math.max(0, Number(dampingRatio) || 0);
  const w = 2 * Math.PI / Number(period);
  const c = 2 * zeta * w;
  const k = w * w;
  const beta = 0.25;
  const gamma = 0.5;
  let u = 0;
  let v = 0;
  let a = -Number(accelerations[0] || 0) - c * v - k * u;
  const rows = [];
  for (let i = 0; i < accelerations.length; i += 1) {
    const ag = Number(accelerations[i]);
    if (!Number.isFinite(ag)) throw new Error(`acceleration at step ${i} must be finite.`);
    const effective = -ag + (1 / (beta * dt * dt) + gamma * c / (beta * dt)) * u
      + (1 / (beta * dt) + c * (gamma / beta - 1)) * v
      + ((1 / (2 * beta) - 1) + c * dt * (gamma / (2 * beta) - 1)) * a;
    const uNext = effective / (k + 1 / (beta * dt * dt) + gamma * c / (beta * dt));
    const aNext = (uNext - u) / (beta * dt * dt) - v / (beta * dt) - (1 / (2 * beta) - 1) * a;
    const vNext = v + dt * ((1 - gamma) * a + gamma * aNext);
    u = uNext;
    v = vNext;
    a = aNext;
    rows.push({ step: i, time: i * dt, displacement: u, velocity: v, acceleration: a });
  }
  return { version: DYNAMIC_COMPLETENESS_VERSION, method: 'linear-sdof-newmark-average-acceleration', maxDisplacement: Math.max(0, ...rows.map((row) => Math.abs(row.displacement))), rows };
}

function rho(Ti, Tj, zeta) {
  const r = Math.max(Ti, Tj) / Math.max(1e-12, Math.min(Ti, Tj));
  return (8 * zeta ** 2 * (1 + r) * r ** 1.5) / ((1 - r ** 2) ** 2 + 4 * zeta ** 2 * r * (1 + r) ** 2) || 1;
}
