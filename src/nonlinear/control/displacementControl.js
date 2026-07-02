export const DISPLACEMENT_CONTROL_VERSION = 'p3-m15-displacement-control';

export function buildDisplacementControlStep(options = {}) {
  const target = Number(options.target ?? 0);
  const current = Number(options.current ?? 0);
  const influence = nonzero(options.influence, 1);
  const dLambda = (target - current) / influence;
  return {
    version: DISPLACEMENT_CONTROL_VERSION,
    controlDof: options.controlDof || null,
    target,
    current,
    dLambda,
    residualDisplacement: target - current,
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
    },
  };
}

function nonzero(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && Math.abs(n) > 1e-12 ? n : fallback;
}
