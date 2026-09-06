export const MDOF_CONVERGENCE_VERSION = 'p8-m2-mdof-convergence-v1';

export function evaluateMdofConvergence(input = {}, criteria = {}) {
  const residual = finiteVector(input.residual, 'residual');
  const correction = finiteVector(input.correction || new Array(residual.length).fill(0), 'correction');
  const q = finiteVector(input.q || new Array(correction.length).fill(0), 'q');
  const external = finiteVector(input.external || new Array(residual.length).fill(0), 'external');
  const kinds = normalizeKinds(input.dofKinds, residual.length);
  const forceNorm = normForKind(residual, kinds, 'translation');
  const momentNorm = normForKind(residual, kinds, 'rotation');
  const displacementNorm = normForKind(correction, kinds, 'translation');
  const rotationNorm = normForKind(correction, kinds, 'rotation');
  const energyNorm = Math.abs(dot(correction, residual));
  const forceScale = Math.max(
    positive(input.forceScale, 0),
    normForKind(external, kinds, 'translation'),
    positive(input.initialForceResidualNorm, positive(input.initialResidualNorm, 0)),
    positive(criteria.forceScaleFloor, 1),
  );
  const momentScale = Math.max(
    positive(input.momentScale, 0),
    normForKind(external, kinds, 'rotation'),
    positive(input.initialMomentResidualNorm, positive(input.initialResidualNorm, 0)),
    positive(criteria.momentScaleFloor, criteria.forceScaleFloor ?? 1),
  );
  const displacementScale = Math.max(
    positive(input.displacementScale, 0),
    normForKind(q, kinds, 'translation'),
    positive(criteria.displacementScaleFloor, 1),
  );
  const rotationScale = Math.max(
    positive(input.rotationScale, 0),
    normForKind(q, kinds, 'rotation'),
    positive(criteria.rotationScaleFloor, 1),
  );
  const energyScale = Math.max(
    positive(input.energyScale, 0),
    Math.abs(dot(q, external)),
    forceScale * displacementScale,
    positive(criteria.energyScaleFloor, 1),
  );
  const limits = {
    force: nonnegative(criteria.forceAbsolute, 1e-8) + nonnegative(criteria.forceRelative, 1e-7) * forceScale,
    moment: nonnegative(criteria.momentAbsolute, criteria.forceAbsolute ?? 1e-8)
      + nonnegative(criteria.momentRelative, criteria.forceRelative ?? 1e-7) * momentScale,
    displacement: nonnegative(criteria.displacementAbsolute, 1e-10)
      + nonnegative(criteria.displacementRelative, 1e-7) * displacementScale,
    rotation: nonnegative(criteria.rotationAbsolute, criteria.displacementAbsolute ?? 1e-10)
      + nonnegative(criteria.rotationRelative, criteria.displacementRelative ?? 1e-7) * rotationScale,
    energy: nonnegative(criteria.energyAbsolute, 1e-12) + nonnegative(criteria.energyRelative, 1e-8) * energyScale,
  };
  const pass = {
    force: forceNorm <= limits.force && momentNorm <= limits.moment,
    displacement: displacementNorm <= limits.displacement && rotationNorm <= limits.rotation,
    energy: energyNorm <= limits.energy,
  };
  return {
    version: MDOF_CONVERGENCE_VERSION,
    converged: pass.force && (pass.displacement || pass.energy),
    norms: { force: forceNorm, moment: momentNorm, displacement: displacementNorm, rotation: rotationNorm, energy: energyNorm },
    scales: { force: forceScale, moment: momentScale, displacement: displacementScale, rotation: rotationScale, energy: energyScale },
    ratios: {
      force: Math.max(
        forceNorm / Math.max(limits.force, Number.EPSILON),
        momentNorm / Math.max(limits.moment, Number.EPSILON),
      ),
      displacement: Math.max(
        displacementNorm / Math.max(limits.displacement, Number.EPSILON),
        rotationNorm / Math.max(limits.rotation, Number.EPSILON),
      ),
      energy: energyNorm / Math.max(limits.energy, Number.EPSILON),
    },
    limits,
    pass,
  };
}

export function normalizedResidualNorm(residual, scale = 1) {
  return norm2(finiteVector(residual, 'residual')) / Math.max(positive(scale, 1), Number.EPSILON);
}

function finiteVector(values, name) {
  if (values == null || typeof values.length !== 'number') throw convergenceError(`${name} must be a vector.`);
  return Array.from(values, (value, index) => {
    const number = Number(value);
    if (!Number.isFinite(number)) throw convergenceError(`${name}[${index}] must be finite.`);
    return number;
  });
}

function convergenceError(message) {
  const error = new TypeError(message);
  error.code = 'MDOF_CONVERGENCE_VALUE_INVALID';
  return error;
}

function normInf(values) {
  return values.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
}

function normForKind(values, kinds, target) {
  return values.reduce((max, value, index) => kinds[index] === target ? Math.max(max, Math.abs(value)) : max, 0);
}

function normalizeKinds(values, length) {
  if (values == null) return new Array(length).fill('translation');
  if (values.length !== length) throw convergenceError(`dofKinds must contain ${length} values.`);
  return Array.from(values, (value) => value === 'rotation' ? 'rotation' : 'translation');
}

function norm2(values) {
  return Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
}

function dot(a, b) {
  return a.reduce((sum, value, index) => sum + value * Number(b[index] || 0), 0);
}

function positive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function nonnegative(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}
