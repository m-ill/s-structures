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
  return {
    version: DISPLACEMENT_CONTROL_VERSION,
    controlDof: options.controlDof || null,
    steps: targets.map((target, step) => {
      const row = buildDisplacementControlStep({ ...options, target, current });
      current = target;
      return { step, ...row };
    }),
  };
}

function nonzero(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && Math.abs(n) > 1e-12 ? n : fallback;
}
