export const NLTH_NEWMARK_VERSION = 'p3-m16-nlth-newmark';

export function runNewmarkNlth(options = {}) {
  const dt = positive(options.dt, 0.02);
  const mass = positive(options.mass, 1);
  const k0 = positive(options.stiffness, 100);
  const damping = Number(options.damping || 0);
  const yieldForce = positive(options.yieldForce, Infinity);
  const postYieldRatio = Math.max(0, Number(options.postYieldRatio ?? 0.02));
  const ag = options.accelerations || [];
  const beta = 0.25;
  const gamma = 0.5;
  let u = 0; let v = 0; let plastic = 0;
  let a = ((-mass * Number(ag[0] || 0)) - damping * v - restoring(k0, postYieldRatio, u, plastic)) / mass;
  const rows = [];
  for (let step = 0; step < ag.length; step += 1) {
    const force = -mass * Number(ag[step] || 0);
    const trialK = tangent(k0, postYieldRatio, plastic);
    const effective = force
      + (mass / (beta * dt * dt) + gamma * damping / (beta * dt)) * u
      + (mass / (beta * dt) + damping * (gamma / beta - 1)) * v
      + (mass * (1 / (2 * beta) - 1) + damping * dt * (gamma / (2 * beta) - 1)) * a;
    const uNext = effective / Math.max(1e-12, trialK + mass / (beta * dt * dt) + gamma * damping / (beta * dt));
    const aNext = (uNext - u) / (beta * dt * dt) - v / (beta * dt) - (1 / (2 * beta) - 1) * a;
    const vNext = v + dt * ((1 - gamma) * a + gamma * aNext);
    u = uNext;
    v = vNext;
    a = aNext;
    const elasticForce = k0 * (u - plastic);
    let hingeState = 'elastic';
    if (Math.abs(elasticForce) > yieldForce) {
      plastic += (Math.abs(elasticForce) - yieldForce) * Math.sign(elasticForce) / k0;
      hingeState = 'yielded';
    }
    rows.push({ step, time: step * dt, displacement: u, velocity: v, acceleration: a, plastic, hingeState, iterations: 1, converged: true });
  }
  return { version: NLTH_NEWMARK_VERSION, method: 'newmark-beta-average-acceleration-with-bilinear-spring-trace', dt, rows, maxDisplacement: Math.max(0, ...rows.map((row) => Math.abs(row.displacement))) };
}

function restoring(k0, ratio, u, plastic) {
  return k0 * (u - plastic) + k0 * ratio * plastic;
}

function tangent(k0, ratio, plastic) {
  return Math.abs(plastic) > 0 ? k0 * ratio : k0;
}

function positive(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
