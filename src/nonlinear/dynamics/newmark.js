export const NLTH_NEWMARK_VERSION = 'p3-m16-nlth-newmark';

export function runNewmarkNlth(options = {}) {
  const rawAccelerations = Array.isArray(options.accelerations) ? options.accelerations : [];
  const ag = rawAccelerations.map(Number);
  const inputReview = buildNlthInputReview(options, ag);
  const dt = positive(options.dt, 0.02);
  const mass = positive(options.mass, 1);
  const k0 = positive(options.stiffness, 100);
  const damping = Number(options.damping || 0);
  const yieldForce = positive(options.yieldForce, Infinity);
  const postYieldRatio = Math.max(0, Number(options.postYieldRatio ?? 0.02));
  const tolerance = positive(options.tolerance, 1e-6);
  const maxIterations = Math.max(1, Math.floor(positive(options.maxIterations, 20)));
  const energyJumpLimit = positive(options.energyJumpLimit, 10);
  const beta = 0.25;
  const gamma = 0.5;
  let u = 0; let v = 0; let plastic = 0;
  let a = ((-mass * Number(ag[0] || 0)) - damping * v - restoring(k0, postYieldRatio, u, plastic)) / mass;
  const rows = [];
  let inputEnergy = 0;
  let dampingEnergy = 0;
  let maxEnergyJumpRatio = 0;
  for (let step = 0; step < ag.length; step += 1) {
    const acceleration = Number.isFinite(ag[step]) ? ag[step] : 0;
    const force = -mass * acceleration;
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
    const energy = stepEnergy({
      mass,
      stiffness: k0,
      postYieldRatio,
      damping,
      dt,
      force,
      previous,
      u,
      v,
      plastic,
    });
    inputEnergy += energy.inputIncrement;
    dampingEnergy += energy.dampingIncrement;
    const residualRatio = Math.abs(iterationLog.at(-1)?.residual || 0) / Math.max(1e-12, Math.abs(force), Math.abs(spring.force));
    const energyJumpRatio = energy.total > 0
      ? Math.abs(energy.total - (rows.at(-1)?.energy?.total ?? energy.total)) / Math.max(1e-12, energy.total)
      : 0;
    maxEnergyJumpRatio = Math.max(maxEnergyJumpRatio, energyJumpRatio);
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
      residualRatio,
      energy: {
        ...energy,
        cumulativeInput: inputEnergy,
        cumulativeDamping: dampingEnergy,
        energyJumpRatio,
      },
      stability: {
        ok: converged && Number.isFinite(energy.total) && residualRatio <= Math.max(1, tolerance * 1000),
        reason: stabilityReason({ converged, energy, residualRatio, tolerance }),
        stepSplitRecommended: !converged || energyJumpRatio > energyJumpLimit,
      },
      iterationLog,
    });
  }
  const unstableRows = rows.filter((row) => !row.stability.ok || row.stability.stepSplitRecommended);
  return {
    version: NLTH_NEWMARK_VERSION,
    contract: {
      milestone: 'P3-M16',
      tickets: ['P3-T85'],
      integrator: 'Newmark-beta average acceleration',
      nonlinearIteration: 'step-level Newton trace with bilinear spring state',
      stabilityTrace: 'energy, residual-ratio, and step-split recommendation per time step',
      benchmarkLinks: ['B7', 'B8'],
    },
    method: 'newmark-beta-average-acceleration-with-bilinear-spring-newton-trace',
    dt,
    inputReview,
    tolerance,
    maxIterations,
    energyJumpLimit,
    converged: rows.every((row) => row.converged),
    rows,
    maxDisplacement: Math.max(0, ...rows.map((row) => Math.abs(row.displacement))),
    energyTrace: {
      inputEnergy,
      dampingEnergy,
      maxTotalEnergy: Math.max(0, ...rows.map((row) => Math.abs(row.energy?.total || 0))),
      maxEnergyJumpRatio,
      unstableStepCount: unstableRows.length,
      stepSplitRecommended: unstableRows.some((row) => row.stability.stepSplitRecommended),
    },
    summary: {
      stepCount: rows.length,
      convergedSteps: rows.filter((row) => row.converged).length,
      yielded: rows.some((row) => row.hingeState === 'yielded'),
      maxIterations: Math.max(0, ...rows.map((row) => row.iterations || 0)),
      maxAbsResidual: Math.max(0, ...rows.map((row) => Math.abs(row.residual || 0))),
      maxResidualRatio: Math.max(0, ...rows.map((row) => Math.abs(row.residualRatio || 0))),
      maxAbsDisplacement: Math.max(0, ...rows.map((row) => Math.abs(row.displacement))),
      unstableStepCount: unstableRows.length,
      stepSplitRecommended: unstableRows.some((row) => row.stability.stepSplitRecommended),
    },
  };
}

function buildNlthInputReview(options, accelerations) {
  const missing = [];
  const dtInput = Number(options.dt ?? 0.02);
  const massInput = Number(options.mass ?? 1);
  const stiffnessInput = Number(options.stiffness ?? 100);
  const toleranceInput = Number(options.tolerance ?? 1e-6);
  const maxIterationsInput = Number(options.maxIterations ?? 20);
  const invalidAccelerationCount = accelerations.filter((value) => !Number.isFinite(value)).length;
  if (!(Number.isFinite(dtInput) && dtInput > 0)) missing.push('nlth-dt');
  if (!(Number.isFinite(massInput) && massInput > 0)) missing.push('nlth-mass');
  if (!(Number.isFinite(stiffnessInput) && stiffnessInput > 0)) missing.push('nlth-stiffness');
  if (!(Number.isFinite(toleranceInput) && toleranceInput > 0)) missing.push('nlth-tolerance');
  if (!(Number.isFinite(maxIterationsInput) && maxIterationsInput >= 1)) missing.push('nlth-max-iterations');
  if (!accelerations.length) missing.push('nlth-acceleration-record');
  if (invalidAccelerationCount > 0) missing.push('nlth-acceleration-values');
  return {
    status: missing.length ? 'review-required' : 'available',
    missing,
    dtInput,
    massInput,
    stiffnessInput,
    toleranceInput,
    maxIterationsInput,
    accelerationCount: accelerations.length,
    invalidAccelerationCount,
    agentDecision: missing.length ? 'review-nlth-inputs' : 'nlth-inputs-ready',
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

function stepEnergy({ mass, stiffness, postYieldRatio, damping, dt, force, previous, u, v, plastic }) {
  const elasticDisp = u - plastic;
  const kinetic = 0.5 * mass * v * v;
  const elasticStrain = 0.5 * stiffness * elasticDisp * elasticDisp;
  const plasticStrain = 0.5 * stiffness * postYieldRatio * plastic * plastic;
  const inputIncrement = force * (u - previous.u);
  const dampingIncrement = Math.max(0, damping * v * v * dt);
  return {
    kinetic,
    elasticStrain,
    plasticStrain,
    strain: elasticStrain + plasticStrain,
    total: kinetic + elasticStrain + plasticStrain,
    inputIncrement,
    dampingIncrement,
  };
}

function stabilityReason({ converged, energy, residualRatio, tolerance }) {
  if (!converged) return 'NONCONVERGED_STEP';
  if (!Number.isFinite(energy.total)) return 'NONFINITE_ENERGY';
  if (residualRatio > Math.max(1, tolerance * 1000)) return 'HIGH_RESIDUAL_RATIO';
  return 'OK';
}

function positive(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
