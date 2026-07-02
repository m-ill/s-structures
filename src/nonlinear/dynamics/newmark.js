export const NLTH_NEWMARK_VERSION = 'p3-m16-nlth-newmark';

export function runNewmarkNlth(options = {}) {
  const dt = positive(options.dt, 0.02);
  const mass = positive(options.mass, 1);
  const k0 = positive(options.stiffness, 100);
  const damping = Number(options.damping || 0);
  const yieldForce = positive(options.yieldForce, Infinity);
  const postYieldRatio = Math.max(0, Number(options.postYieldRatio ?? 0.02));
  const tolerance = positive(options.tolerance, 1e-6);
  const maxIterations = Math.max(1, Math.floor(positive(options.maxIterations, 20)));
  const ag = options.accelerations || [];
  const beta = 0.25;
  const gamma = 0.5;
  let u = 0; let v = 0; let plastic = 0;
  let a = ((-mass * Number(ag[0] || 0)) - damping * v - restoring(k0, postYieldRatio, u, plastic)) / mass;
  const rows = [];
  for (let step = 0; step < ag.length; step += 1) {
    const force = -mass * Number(ag[step] || 0);
    const previous = { u, v, a, plastic };
    let uNext = u;
    let aNext = a;
    let vNext = v;
    let spring = springResponse(k0, postYieldRatio, yieldForce, uNext, plastic);
    const iterationLog = [];
    let converged = false;
    for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
      aNext = (uNext - previous.u) / (beta * dt * dt) - previous.v / (beta * dt) - (1 / (2 * beta) - 1) * previous.a;
      vNext = previous.v + dt * ((1 - gamma) * previous.a + gamma * aNext);
      spring = springResponse(k0, postYieldRatio, yieldForce, uNext, previous.plastic);
      const residual = mass * aNext + damping * vNext + spring.force - force;
      const effectiveTangent = spring.tangent + mass / (beta * dt * dt) + gamma * damping / (beta * dt);
      const correction = -residual / Math.max(1e-12, effectiveTangent);
      iterationLog.push({ iteration, residual, correction, tangent: effectiveTangent });
      uNext += correction;
      if (Math.abs(residual) <= tolerance) {
        converged = true;
        break;
      }
    }
    aNext = (uNext - previous.u) / (beta * dt * dt) - previous.v / (beta * dt) - (1 / (2 * beta) - 1) * previous.a;
    vNext = previous.v + dt * ((1 - gamma) * previous.a + gamma * aNext);
    spring = springResponse(k0, postYieldRatio, yieldForce, uNext, previous.plastic);
    u = uNext;
    v = vNext;
    a = aNext;
    plastic = spring.plastic;
    rows.push({
      step,
      time: step * dt,
      displacement: u,
      velocity: v,
      acceleration: a,
      plastic,
      restoringForce: spring.force,
      hingeState: spring.hingeState,
      iterations: iterationLog.length,
      converged,
      residual: iterationLog.at(-1)?.residual ?? null,
      iterationLog,
    });
  }
  return {
    version: NLTH_NEWMARK_VERSION,
    method: 'newmark-beta-average-acceleration-with-bilinear-spring-newton-trace',
    dt,
    tolerance,
    maxIterations,
    converged: rows.every((row) => row.converged),
    rows,
    maxDisplacement: Math.max(0, ...rows.map((row) => Math.abs(row.displacement))),
  };
}

function restoring(k0, ratio, u, plastic) {
  return k0 * (u - plastic) + k0 * ratio * plastic;
}

function tangent(k0, ratio, plastic) {
  return Math.abs(plastic) > 0 ? k0 * ratio : k0;
}

function springResponse(k0, ratio, yieldForce, u, previousPlastic) {
  if (!Number.isFinite(yieldForce)) {
    return { force: restoring(k0, ratio, u, previousPlastic), tangent: tangent(k0, ratio, previousPlastic), plastic: previousPlastic, hingeState: 'elastic' };
  }
  const uy = yieldForce / k0;
  const trial = u - previousPlastic;
  if (Math.abs(trial) <= uy) {
    return { force: restoring(k0, ratio, u, previousPlastic), tangent: tangent(k0, ratio, previousPlastic), plastic: previousPlastic, hingeState: Math.abs(previousPlastic) > 0 ? 'yielded' : 'elastic' };
  }
  const sign = Math.sign(trial) || 1;
  const plastic = u - sign * uy;
  return { force: sign * yieldForce + k0 * ratio * plastic, tangent: k0 * ratio, plastic, hingeState: 'yielded' };
}

function positive(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
