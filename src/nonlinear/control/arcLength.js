export const ARC_LENGTH_CONTROL_VERSION = 'p3-m15-arc-length';

export function buildArcLengthStep(options = {}) {
  const du = vector(options.du);
  const dLambda = Number(options.dLambda || 0);
  const alpha = Number(options.alpha ?? 1);
  const radius = Number(options.radius ?? 1);
  const norm = Math.sqrt(du.reduce((sum, v) => sum + v * v, 0) + alpha * dLambda * dLambda);
  return {
    version: ARC_LENGTH_CONTROL_VERSION,
    du,
    dLambda,
    alpha,
    radius,
    constraint: norm - radius,
    satisfied: Math.abs(norm - radius) <= Number(options.tolerance ?? 1e-6),
    formula: 'du.du + alpha*dLambda^2 = radius^2',
  };
}

export function buildArcLengthTrace(path = [], options = {}) {
  const steps = path.map((point, step) => ({ step, ...buildArcLengthStep({ ...options, ...point }) }));
  return {
    version: ARC_LENGTH_CONTROL_VERSION,
    contract: {
      milestone: 'P3-M15',
      tickets: ['P3-T55'],
      control: 'arc-length',
      rule: 'Crisfield spherical constraint tracks load-displacement paths through post-peak segments.',
    },
    method: 'crisfield-spherical-arc-length-trace',
    steps,
    summary: {
      stepCount: steps.length,
      postPeakTracked: steps.some((step) => step.dLambda < 0),
      satisfiedSteps: steps.filter((step) => step.satisfied).length,
      maxConstraintError: Math.max(0, ...steps.map((step) => Math.abs(step.constraint))),
    },
  };
}

export function createSnapThroughBenchmarkPath(options = {}) {
  const radius = Number(options.radius ?? 1);
  return [1, 0.6, 0.2, -0.2, -0.5].map((dLambda, i) => {
    const dx = Math.sqrt(Math.max(0, radius * radius - dLambda * dLambda));
    return { du: [i < 2 ? dx : -dx], dLambda, radius };
  });
}

function vector(value = []) {
  return [...value].map((item) => Number(item) || 0);
}
