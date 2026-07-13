import {
  SECTION_STRAIN_CONVENTION,
  commitSectionResponse,
  evaluateSectionResponse,
} from './sectionResponse.js';

export const MOMENT_CURVATURE_V2_VERSION = 'p8-m6-moment-curvature-v2';

export function solveSectionAxialEquilibrium(section, input = {}) {
  const targetN = finite(input.targetN ?? input.axialForce ?? 0, 'targetN');
  const kappaY = finite(input.kappaY ?? 0, 'kappaY');
  const kappaZ = finite(input.kappaZ ?? input.curvature ?? 0, 'kappaZ');
  const maxIterations = integer(input.maxIterations ?? 50, 1, 500, 'maxIterations');
  const forceTolerance = nonnegative(input.forceTolerance ?? 1e-8, 'forceTolerance');
  const relativeTolerance = nonnegative(input.relativeTolerance ?? 1e-9, 'relativeTolerance');
  const strainTolerance = positive(input.strainTolerance ?? 1e-13, 'strainTolerance');
  const responseOptions = sectionResponseOptions(input);
  const evaluate = (epsilon0) => {
    const response = evaluateSectionResponse(section, { epsilon0, kappaY, kappaZ }, responseOptions);
    return { epsilon0, response, residual: response.N - targetN };
  };
  const forceScale = Math.max(1, Math.abs(targetN), Math.abs(Number(input.forceScale ?? 0)));
  const residualLimit = forceTolerance + relativeTolerance * forceScale;
  const initial = finite(input.initialEpsilon0 ?? input.epsilon0 ?? 0, 'initialEpsilon0');
  let current = evaluate(initial);
  const history = [iterationRow(0, current, 'initial', null)];
  if (Math.abs(current.residual) <= residualLimit) return axialResult(true, current, history, targetN, residualLimit, null);

  const bracket = establishBracket(evaluate, current, input, history);
  if (!bracket.ok) {
    return axialResult(false, bracket.best, history, targetN, residualLimit, 'AXIAL_EQUILIBRIUM_NOT_BRACKETED', {
      bracket: bracket.interval,
    });
  }
  let lower = bracket.lower;
  let upper = bracket.upper;
  current = bracket.best;
  let previousEpsilon = current.epsilon0;

  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    if (Math.abs(current.residual) <= residualLimit) return axialResult(true, current, history, targetN, residualLimit, null);
    const axialTangent = Number(current.response.tangent?.[0]?.[0]);
    const candidateNewton = Number.isFinite(axialTangent) && Math.abs(axialTangent) > Number.EPSILON
      ? current.epsilon0 - current.residual / axialTangent
      : NaN;
    const lowerBound = Math.min(lower.epsilon0, upper.epsilon0);
    const upperBound = Math.max(lower.epsilon0, upper.epsilon0);
    const useNewton = Number.isFinite(candidateNewton)
      && candidateNewton > lowerBound + strainTolerance
      && candidateNewton < upperBound - strainTolerance;
    const candidateEpsilon = useNewton ? candidateNewton : 0.5 * (lower.epsilon0 + upper.epsilon0);
    const candidate = evaluate(candidateEpsilon);
    history.push(iterationRow(iteration, candidate, useNewton ? 'newton' : 'bisection', axialTangent));

    if (oppositeOrZero(lower.residual, candidate.residual)) upper = candidate;
    else lower = candidate;
    current = betterCandidate(current, candidate);
    if (Math.abs(candidate.residual) <= residualLimit) return axialResult(true, candidate, history, targetN, residualLimit, null);
    if (Math.abs(candidateEpsilon - previousEpsilon) <= strainTolerance) {
      return axialResult(false, current, history, targetN, residualLimit, 'AXIAL_EQUILIBRIUM_STAGNATED', {
        bracket: [lower.epsilon0, upper.epsilon0],
      });
    }
    previousEpsilon = candidateEpsilon;
    current = candidate;
  }
  return axialResult(false, current, history, targetN, residualLimit, 'AXIAL_EQUILIBRIUM_MAX_ITERATIONS', {
    bracket: [lower.epsilon0, upper.epsilon0],
  });
}

export const solveNeutralAxisForAxialForce = solveSectionAxialEquilibrium;
export const solveTargetAxial = solveSectionAxialEquilibrium;
export const solveAtTargetAxialForce = solveSectionAxialEquilibrium;

export function traceBiaxialCurvaturePath(section, input = {}) {
  const path = normalizeCurvaturePath(input);
  const targetN = finite(input.targetN ?? input.axialForce ?? 0, 'targetN');
  let committedState = input.committedState ?? null;
  let epsilon0 = finite(input.initialEpsilon0 ?? 0, 'initialEpsilon0');
  const rows = [];
  let terminated = null;

  for (let index = 0; index < path.length; index += 1) {
    const point = path[index];
    const solved = solveSectionAxialEquilibrium(section, {
      ...input,
      targetN,
      kappaY: point.kappaY,
      kappaZ: point.kappaZ,
      initialEpsilon0: epsilon0,
      committedState,
    });
    rows.push(curvatureRow(index, point, solved));
    if (!solved.converged) {
      terminated = { code: solved.failureCode, index, point };
      if (input.failFast !== false) break;
      continue;
    }
    epsilon0 = solved.epsilon0;
    if (input.commitEachStep !== false) committedState = commitSectionResponse(solved.response);
  }
  return {
    version: MOMENT_CURVATURE_V2_VERSION,
    convention: SECTION_STRAIN_CONVENTION,
    targetN,
    converged: !terminated && rows.length === path.length && rows.every((row) => row.converged),
    rows,
    committedState,
    termination: terminated,
    summary: pathSummary(rows),
  };
}

export function runAdaptiveMomentCurvature(section, input = {}) {
  const targetN = finite(input.targetN ?? input.axialForce ?? 0, 'targetN');
  const maxCurvature = positive(input.maxCurvature ?? 0.02, 'maxCurvature');
  const minIncrement = positive(input.minIncrement ?? maxCurvature / 10000, 'minIncrement');
  const maxIncrement = positive(input.maxIncrement ?? maxCurvature / 5, 'maxIncrement');
  let increment = clamp(positive(input.initialIncrement ?? maxCurvature / 40, 'initialIncrement'), minIncrement, maxIncrement);
  const growthFactor = positive(input.growthFactor ?? 1.5, 'growthFactor');
  const cutbackFactor = bounded(input.cutbackFactor ?? 0.5, 0, 1, 'cutbackFactor');
  const fastIterations = integer(input.fastIterations ?? 4, 1, 100, 'fastIterations');
  const slowIterations = integer(input.slowIterations ?? 12, fastIterations, 500, 'slowIterations');
  const maxSteps = integer(input.maxSteps ?? 1000, 1, 100000, 'maxSteps');
  const maxCutbacks = integer(input.maxCutbacks ?? 20, 0, 1000, 'maxCutbacks');
  if (minIncrement > maxIncrement) {
    throw curveError('CURVATURE_INCREMENT_RANGE_INVALID', 'minIncrement must not exceed maxIncrement.');
  }
  if (growthFactor < 1) throw curveError('CURVATURE_GROWTH_INVALID', 'growthFactor must be at least one.');
  const direction = normalizeDirection(input);
  let curvature = 0;
  let epsilon0 = finite(input.initialEpsilon0 ?? 0, 'initialEpsilon0');
  let committedState = input.committedState ?? null;
  const rows = [];
  const rejected = [];
  let cutbackCount = 0;
  let termination = null;

  const initial = solveSectionAxialEquilibrium(section, {
    ...input,
    targetN,
    kappaY: 0,
    kappaZ: 0,
    initialEpsilon0: epsilon0,
    committedState,
  });
  rows.push(curvatureRow(0, { curvature: 0, kappaY: 0, kappaZ: 0 }, initial));
  if (!initial.converged) {
    return adaptiveResult(rows, rejected, committedState, targetN, direction, {
      code: initial.failureCode,
      stage: 'initial-equilibrium',
    });
  }
  epsilon0 = initial.epsilon0;
  committedState = commitSectionResponse(initial.response);

  while (curvature < maxCurvature && rows.length < maxSteps + 1) {
    const candidateCurvature = Math.min(maxCurvature, curvature + increment);
    const point = {
      curvature: candidateCurvature,
      kappaY: candidateCurvature * direction.kappaY,
      kappaZ: candidateCurvature * direction.kappaZ,
    };
    const solved = solveSectionAxialEquilibrium(section, {
      ...input,
      targetN,
      ...point,
      initialEpsilon0: epsilon0,
      committedState,
    });
    if (!solved.converged) {
      rejected.push({ curvature: candidateCurvature, increment, failureCode: solved.failureCode, residual: solved.residual });
      cutbackCount += 1;
      increment *= cutbackFactor;
      if (increment < minIncrement || cutbackCount > maxCutbacks) {
        termination = { code: 'ADAPTIVE_CURVATURE_MIN_INCREMENT', curvature, increment, cause: solved.failureCode };
        break;
      }
      continue;
    }

    const row = curvatureRow(rows.length, point, solved);
    const eventCount = countMaterialEvents(solved.response);
    row.increment = candidateCurvature - curvature;
    row.eventCount = eventCount;
    rows.push(row);
    curvature = candidateCurvature;
    epsilon0 = solved.epsilon0;
    committedState = commitSectionResponse(solved.response);
    if (eventCount > 0 || solved.iterations >= slowIterations) increment = Math.max(minIncrement, increment * cutbackFactor);
    else if (solved.iterations <= fastIterations) increment = Math.min(maxIncrement, increment * growthFactor);
    if (curvature < maxCurvature) increment = Math.min(increment, maxCurvature - curvature);
  }
  if (!termination && curvature < maxCurvature) termination = { code: 'ADAPTIVE_CURVATURE_MAX_STEPS', curvature };
  return adaptiveResult(rows, rejected, committedState, targetN, direction, termination);
}

export function checkFiberMeshConvergence(meshFactory, input = {}) {
  if (typeof meshFactory !== 'function') throw curveError('MESH_FACTORY_REQUIRED', 'meshFactory(level) is required.');
  const levels = normalizePositiveIntegers(input.levels ?? [4, 8, 16, 32], 'levels');
  const tolerance = nonnegative(input.tolerance ?? 0.01, 'tolerance');
  const rows = [];
  let previous = null;
  for (const level of levels) {
    const section = meshFactory(level);
    const response = typeof input.evaluate === 'function'
      ? input.evaluate(section, level)
      : evaluateSectionResponse(section, input.deformation ?? {}, sectionResponseOptions(input));
    const metric = responseMetric(response, input.metric);
    const change = previous == null ? null : relativeVectorDifference(metric, previous);
    rows.push({ level, metric, relativeChange: change, response });
    previous = metric;
  }
  const finalChange = rows.at(-1)?.relativeChange ?? Infinity;
  return {
    version: MOMENT_CURVATURE_V2_VERSION,
    kind: 'fiber-mesh-refinement',
    tolerance,
    converged: Number.isFinite(finalChange) && finalChange <= tolerance,
    rows,
    finalRelativeChange: finalChange,
  };
}

export function checkElementIntegrationPointConvergence(section, input = {}) {
  const orders = normalizePositiveIntegers(input.orders ?? [2, 3, 4, 5], 'orders');
  const length = positive(input.length ?? 1, 'length');
  const tolerance = nonnegative(input.tolerance ?? 1e-4, 'tolerance');
  const deformationAt = typeof input.deformationAt === 'function'
    ? input.deformationAt
    : () => input.deformation ?? {};
  const rows = [];
  let previous = null;
  for (const order of orders) {
    const rule = gaussLegendre(order);
    const integrated = [0, 0, 0];
    const points = [];
    for (let index = 0; index < rule.points.length; index += 1) {
      const xi = rule.points[index];
      const x = 0.5 * length * (xi + 1);
      const weight = rule.weights[index] * length / 2;
      const deformation = deformationAt(x, xi, length);
      const response = typeof input.evaluate === 'function'
        ? input.evaluate(section, deformation, { order, index, x, xi, weight })
        : evaluateSectionResponse(section, deformation, sectionResponseOptions(input));
      const metric = responseMetric(response, input.metric);
      for (let component = 0; component < 3; component += 1) integrated[component] += metric[component] * weight;
      points.push({ x, xi, weight, metric });
    }
    const change = previous == null ? null : relativeVectorDifference(integrated, previous);
    rows.push({ order, integrated, relativeChange: change, points });
    previous = integrated;
  }
  const finalChange = rows.at(-1)?.relativeChange ?? Infinity;
  return {
    version: MOMENT_CURVATURE_V2_VERSION,
    kind: 'element-integration-point-refinement',
    length,
    tolerance,
    converged: Number.isFinite(finalChange) && finalChange <= tolerance,
    rows,
    finalRelativeChange: finalChange,
  };
}

function establishBracket(evaluate, current, input, history) {
  const explicit = input.epsilonBracket;
  if (Array.isArray(explicit) && explicit.length === 2) {
    const lower = evaluate(finite(explicit[0], 'epsilonBracket[0]'));
    const upper = evaluate(finite(explicit[1], 'epsilonBracket[1]'));
    history.push(iterationRow(-1, lower, 'bracket-lower', null), iterationRow(-1, upper, 'bracket-upper', null));
    const direct = bracketResult(lower, upper, current);
    if (direct.ok) return direct;
    const sampleCount = integer(input.bracketSamples ?? 64, 4, 1000, 'bracketSamples');
    let previous = lower;
    let best = betterCandidate(current, betterCandidate(lower, upper));
    const brackets = [];
    for (let index = 1; index < sampleCount; index += 1) {
      const epsilon0 = lower.epsilon0 + (upper.epsilon0 - lower.epsilon0) * index / sampleCount;
      const candidate = evaluate(epsilon0);
      history.push(iterationRow(-(index + 1), candidate, 'bracket-scan', null));
      best = betterCandidate(best, candidate);
      if (oppositeOrZero(previous.residual, candidate.residual)) brackets.push({ lower: previous, upper: candidate });
      previous = candidate;
    }
    if (oppositeOrZero(previous.residual, upper.residual)) brackets.push({ lower: previous, upper });
    if (brackets.length) {
      const selected = brackets.sort((a, b) => (
        Math.abs(0.5 * (a.lower.epsilon0 + a.upper.epsilon0) - current.epsilon0)
        - Math.abs(0.5 * (b.lower.epsilon0 + b.upper.epsilon0) - current.epsilon0)
      ))[0];
      return { ok: true, ...selected, best };
    }
    return { ok: false, best, interval: [lower.epsilon0, upper.epsilon0] };
  }
  let halfWidth = positive(input.initialBracket ?? Math.max(1e-6, Math.abs(current.epsilon0) * 0.25), 'initialBracket');
  const expansion = positive(input.bracketExpansion ?? 2, 'bracketExpansion');
  if (expansion <= 1) throw curveError('AXIAL_BRACKET_EXPANSION_INVALID', 'bracketExpansion must exceed one.');
  const maxExpansions = integer(input.maxBracketExpansions ?? 40, 1, 200, 'maxBracketExpansions');
  let best = current;
  let lower;
  let upper;
  for (let index = 0; index < maxExpansions; index += 1) {
    lower = evaluate(current.epsilon0 - halfWidth);
    upper = evaluate(current.epsilon0 + halfWidth);
    best = betterCandidate(best, betterCandidate(lower, upper));
    history.push(iterationRow(-(index + 1), lower, 'bracket-lower', null));
    history.push(iterationRow(-(index + 1), upper, 'bracket-upper', null));
    if (oppositeOrZero(lower.residual, upper.residual)) return { ok: true, lower, upper, best };
    halfWidth *= expansion;
  }
  return { ok: false, best, interval: [lower?.epsilon0, upper?.epsilon0] };
}

function bracketResult(left, right, best) {
  const lower = left.epsilon0 <= right.epsilon0 ? left : right;
  const upper = left.epsilon0 <= right.epsilon0 ? right : left;
  return oppositeOrZero(lower.residual, upper.residual)
    ? { ok: true, lower, upper, best: betterCandidate(best, betterCandidate(lower, upper)) }
    : { ok: false, best: betterCandidate(best, betterCandidate(lower, upper)), interval: [lower.epsilon0, upper.epsilon0] };
}

function axialResult(converged, candidate, history, targetN, residualLimit, failureCode, extra = {}) {
  return {
    version: MOMENT_CURVATURE_V2_VERSION,
    convention: SECTION_STRAIN_CONVENTION,
    converged,
    targetN,
    epsilon0: candidate.epsilon0,
    residual: candidate.residual,
    residualLimit,
    response: candidate.response,
    iterations: Math.max(0, history.filter((row) => row.iteration > 0).length),
    history,
    failureCode,
    ...extra,
  };
}

function curvatureRow(index, point, solved) {
  const response = solved.response;
  const curvature = finite(point.curvature ?? Math.hypot(point.kappaY, point.kappaZ), 'curvature');
  const norm = Math.hypot(point.kappaY, point.kappaZ);
  const projectedMoment = norm > 0 ? (response.My * point.kappaY + response.Mz * point.kappaZ) / norm : 0;
  return {
    index,
    curvature,
    kappaY: point.kappaY,
    kappaZ: point.kappaZ,
    epsilon0: solved.epsilon0,
    N: response.N,
    My: response.My,
    Mz: response.Mz,
    projectedMoment,
    residual: solved.residual,
    residualLimit: solved.residualLimit,
    converged: solved.converged,
    iterations: solved.iterations,
    extremeStrain: Math.max(0, ...response.fibers.map((fiber) => Math.abs(fiber.strain))),
    energy: response.energy,
    failureCode: solved.failureCode,
  };
}

function adaptiveResult(rows, rejected, committedState, targetN, direction, termination) {
  return {
    version: MOMENT_CURVATURE_V2_VERSION,
    convention: SECTION_STRAIN_CONVENTION,
    targetN,
    direction,
    converged: !termination,
    rows,
    rejected,
    committedState,
    termination,
    summary: { ...pathSummary(rows), rejectedCount: rejected.length },
  };
}

function normalizeCurvaturePath(input) {
  if (Array.isArray(input.path) && input.path.length > 0) {
    return input.path.map((point, index) => ({
      curvature: finite(point.curvature ?? Math.hypot(point.kappaY ?? 0, point.kappaZ ?? 0), `path[${index}].curvature`),
      kappaY: finite(point.kappaY ?? 0, `path[${index}].kappaY`),
      kappaZ: finite(point.kappaZ ?? point.curvature ?? 0, `path[${index}].kappaZ`),
    }));
  }
  const direction = normalizeDirection(input);
  const values = input.curvatures ?? [0, 0.0005, 0.001, 0.002];
  if (!Array.isArray(values) || values.length === 0) throw curveError('CURVATURE_PATH_EMPTY', 'A non-empty curvature path is required.');
  return values.map((value, index) => {
    const curvature = finite(value, `curvatures[${index}]`);
    return { curvature, kappaY: curvature * direction.kappaY, kappaZ: curvature * direction.kappaZ };
  });
}

function normalizeDirection(input) {
  const angle = input.angle == null ? null : finite(input.angle, 'angle');
  let kappaY = angle == null ? finite(input.direction?.kappaY ?? input.directionY ?? 0, 'direction.kappaY') : Math.cos(angle);
  let kappaZ = angle == null ? finite(input.direction?.kappaZ ?? input.directionZ ?? 1, 'direction.kappaZ') : Math.sin(angle);
  const norm = Math.hypot(kappaY, kappaZ);
  if (!(norm > 0)) throw curveError('CURVATURE_DIRECTION_ZERO', 'Curvature direction must be nonzero.');
  kappaY /= norm;
  kappaZ /= norm;
  return { kappaY, kappaZ, angle: Math.atan2(kappaZ, kappaY) };
}

function sectionResponseOptions(input) {
  return {
    materials: input.materials,
    committedState: input.committedState,
    context: input.context,
    meshOptions: input.meshOptions,
  };
}

function responseMetric(response, selector) {
  if (typeof selector === 'function') {
    const selected = selector(response);
    if (!Array.isArray(selected) || selected.length !== 3) throw curveError('CONVERGENCE_METRIC_INVALID', 'Metric selector must return three values.');
    return selected.map((value, index) => finite(value, `metric[${index}]`));
  }
  const force = response?.force?.vector ?? [response?.N, response?.My, response?.Mz];
  if (!Array.isArray(force) || force.length < 3) throw curveError('CONVERGENCE_RESPONSE_INVALID', 'Response must expose N, My, and Mz.');
  return force.slice(0, 3).map((value, index) => finite(value, `response force[${index}]`));
}

function pathSummary(rows) {
  return {
    rowCount: rows.length,
    maxAbsN: Math.max(0, ...rows.map((row) => Math.abs(row.N))),
    maxAbsMy: Math.max(0, ...rows.map((row) => Math.abs(row.My))),
    maxAbsMz: Math.max(0, ...rows.map((row) => Math.abs(row.Mz))),
    maxProjectedMoment: Math.max(0, ...rows.map((row) => Math.abs(row.projectedMoment))),
    maxExtremeStrain: Math.max(0, ...rows.map((row) => Math.abs(row.extremeStrain))),
  };
}

function countMaterialEvents(response) {
  return response.fibers.reduce((count, fiber) => count + (Array.isArray(fiber.events) ? fiber.events.length : 0), 0);
}

function relativeVectorDifference(current, previous) {
  let numerator = 0;
  let denominator = 1;
  for (let index = 0; index < current.length; index += 1) {
    numerator = Math.max(numerator, Math.abs(current[index] - previous[index]));
    denominator = Math.max(denominator, Math.abs(current[index]), Math.abs(previous[index]));
  }
  return numerator / denominator;
}

function gaussLegendre(order) {
  const rules = {
    1: { points: [0], weights: [2] },
    2: { points: [-0.5773502691896257, 0.5773502691896257], weights: [1, 1] },
    3: { points: [-0.7745966692414834, 0, 0.7745966692414834], weights: [0.5555555555555556, 0.8888888888888888, 0.5555555555555556] },
    4: { points: [-0.8611363115940526, -0.3399810435848563, 0.3399810435848563, 0.8611363115940526], weights: [0.3478548451374538, 0.6521451548625461, 0.6521451548625461, 0.3478548451374538] },
    5: { points: [-0.906179845938664, -0.5384693101056831, 0, 0.5384693101056831, 0.906179845938664], weights: [0.2369268850561891, 0.4786286704993665, 0.5688888888888889, 0.4786286704993665, 0.2369268850561891] },
  };
  const rule = rules[order];
  if (!rule) throw curveError('GAUSS_ORDER_UNSUPPORTED', `Gauss-Legendre order ${order} is not supported; use 1 through 5.`);
  return rule;
}

function iterationRow(iteration, value, method, tangent) {
  return { iteration, epsilon0: value.epsilon0, residual: value.residual, N: value.response.N, tangent, method };
}

function betterCandidate(left, right) {
  return Math.abs(right.residual) < Math.abs(left.residual) ? right : left;
}

function oppositeOrZero(left, right) {
  return left === 0 || right === 0 || Math.sign(left) !== Math.sign(right);
}

function normalizePositiveIntegers(values, label) {
  if (!Array.isArray(values) || values.length < 2) throw curveError('REFINEMENT_LEVELS_INVALID', `${label} must contain at least two values.`);
  const normalized = values.map((value, index) => integer(value, 1, 100000, `${label}[${index}]`));
  for (let index = 1; index < normalized.length; index += 1) {
    if (normalized[index] <= normalized[index - 1]) throw curveError('REFINEMENT_LEVELS_UNSORTED', `${label} must be strictly increasing.`);
  }
  return normalized;
}

function clamp(value, lower, upper) {
  return Math.max(lower, Math.min(upper, value));
}

function finite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw curveError('CURVE_VALUE_NONFINITE', `${label} must be finite.`);
  return number;
}

function positive(value, label) {
  const number = finite(value, label);
  if (!(number > 0)) throw curveError('CURVE_VALUE_NONPOSITIVE', `${label} must be greater than zero.`);
  return number;
}

function nonnegative(value, label) {
  const number = finite(value, label);
  if (number < 0) throw curveError('CURVE_VALUE_NEGATIVE', `${label} must not be negative.`);
  return number;
}

function bounded(value, lower, upper, label) {
  const number = finite(value, label);
  if (!(number > lower && number < upper)) throw curveError('CURVE_VALUE_OUT_OF_RANGE', `${label} must be between ${lower} and ${upper}.`);
  return number;
}

function integer(value, lower, upper, label) {
  const number = finite(value, label);
  if (!Number.isInteger(number) || number < lower || number > upper) throw curveError('CURVE_INTEGER_INVALID', `${label} must be an integer from ${lower} to ${upper}.`);
  return number;
}

function curveError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
