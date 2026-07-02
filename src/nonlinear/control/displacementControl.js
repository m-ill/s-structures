export const DISPLACEMENT_CONTROL_VERSION = 'p3-m15-displacement-control';

export function buildDisplacementControlStep(options = {}) {
  const target = Number(options.target ?? 0);
  const current = Number(options.current ?? 0);
  const influenceInput = Number(options.influence ?? 1);
  const influenceValid = Number.isFinite(influenceInput) && Math.abs(influenceInput) > 1e-12;
  const influence = influenceValid ? influenceInput : 1;
  const dLambda = (target - current) / influence;
  return {
    version: DISPLACEMENT_CONTROL_VERSION,
    controlDof: options.controlDof || null,
    target,
    current,
    influenceInput,
    dLambda,
    residualDisplacement: target - current,
    review: {
      status: influenceValid ? 'available' : 'review-required',
      warning: influenceValid ? null : 'invalid-displacement-control-influence',
      agentDecision: influenceValid ? 'displacement-control-step-ready' : 'provide-nonzero-control-influence',
    },
    formula: 'dLambda=(target-current)/influence',
  };
}

export function buildDisplacementControlTrace(targets = [], options = {}) {
  let current = Number(options.initial || 0);
  const steps = targets.map((target, step) => {
    const row = buildDisplacementControlStep({ ...options, target, current });
    current = target;
    return { step, ...row };
  });
  return {
    version: DISPLACEMENT_CONTROL_VERSION,
    contract: {
      milestone: 'P3-M15',
      tickets: ['P3-T55'],
      control: 'displacement',
      rule: 'Convert each target displacement increment into a load-factor increment using the supplied influence term.',
    },
    controlDof: options.controlDof || null,
    steps,
    summary: {
      stepCount: steps.length,
      finalTarget: steps.at(-1)?.target ?? null,
      maxAbsTarget: Math.max(0, ...steps.map((step) => Math.abs(step.target))),
      maxAbsDeltaLambda: Math.max(0, ...steps.map((step) => Math.abs(step.dLambda))),
      review: buildDisplacementControlReview(steps),
    },
    review: buildDisplacementControlReview(steps),
  };
}

function buildDisplacementControlReview(steps = []) {
  const warnings = [...new Set(steps.map((step) => step.review?.warning).filter(Boolean))];
  return {
    status: warnings.length ? 'review-required' : 'available',
    stepCount: steps.length,
    warnings,
    agentDecision: warnings.length ? 'review-displacement-control-inputs' : 'displacement-control-ready-for-review',
  };
}
