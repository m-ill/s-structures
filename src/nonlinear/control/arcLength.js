export const ARC_LENGTH_CONTROL_VERSION = 'p3-m15-arc-length';

export function buildArcLengthStep(options = {}) {
  const du = vector(options.du);
  const dLambda = Number(options.dLambda || 0);
  const alphaInput = Number(options.alpha ?? 1);
  const radiusInput = Number(options.radius ?? 1);
  const alphaValid = Number.isFinite(alphaInput) && alphaInput > 0;
  const radiusValid = Number.isFinite(radiusInput) && radiusInput > 0;
  const alpha = alphaValid ? alphaInput : 1;
  const radius = radiusValid ? radiusInput : 1;
  const norm = Math.sqrt(du.reduce((sum, v) => sum + v * v, 0) + alpha * dLambda * dLambda);
  const satisfied = Math.abs(norm - radius) <= Number(options.tolerance ?? 1e-6);
  return {
    version: ARC_LENGTH_CONTROL_VERSION,
    du,
    dLambda,
    alphaInput,
    radiusInput,
    alpha,
    radius,
    constraint: norm - radius,
    satisfied,
    review: buildArcLengthStepReview({ alphaValid, radiusValid, satisfied }),
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
      review: buildArcLengthTraceReview(steps),
    },
    review: buildArcLengthTraceReview(steps),
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

function buildArcLengthStepReview({ alphaValid, radiusValid, satisfied }) {
  const warnings = [];
  if (!alphaValid) warnings.push('invalid-arc-length-alpha');
  if (!radiusValid) warnings.push('invalid-arc-length-radius');
  if (!satisfied) warnings.push('arc-length-constraint-not-satisfied');
  return {
    status: warnings.length ? 'review-required' : 'available',
    warnings,
    agentDecision: warnings.length ? 'review-arc-length-control-inputs' : 'arc-length-step-ready',
  };
}

function buildArcLengthTraceReview(steps = []) {
  const warnings = [...new Set(steps.flatMap((step) => step.review?.warnings || []))];
  return {
    status: warnings.length ? 'review-required' : 'available',
    stepCount: steps.length,
    warnings,
    agentDecision: warnings.length ? 'review-arc-length-control-inputs' : 'arc-length-control-ready-for-review',
  };
}
