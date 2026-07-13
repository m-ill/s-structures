import { stableHash } from '../../core/stableHash.js';

export const PMM_SURFACE_VERSION = 'p8-m6-pmm-surface-v2';
export const PMM_SIGN_CONVENTION = Object.freeze({
  axialForce: 'tension-positive',
  My: 'positive-about-local-y',
  Mz: 'positive-about-local-z',
  curvature: '[kappaY,kappaZ]',
});

const TWO_PI = 2 * Math.PI;
const CARDINAL_ANGLES = Object.freeze([0, Math.PI / 2, Math.PI, 3 * Math.PI / 2]);

/**
 * Generates a section-derived P-My-Mz surface. The supplied solver must perform
 * the section axial-equilibrium solve for every requested curvature state.
 */
export function generatePmmSurface(section = {}, options = {}) {
  const solveTargetAxial = resolveTargetAxialSolver(options);
  const axialIntercepts = normalizeAxialIntercepts(
    options.axialIntercepts || options.axialBounds || section.axialIntercepts,
  );
  const axialLevels = normalizeAxialLevels(options.axialLevels, axialIntercepts);
  const angles = normalizeAngles(options.angles, options.angleCount);
  const curvatures = normalizeCurvatures(options.curvatures, options);
  const axialTolerance = positive(options.axialTolerance, 1e-7);
  const axialAbsoluteTolerance = positive(options.axialAbsoluteTolerance, axialTolerance);
  const directionTolerance = positive(options.directionTolerance, 1e-8);
  const directionIterations = Math.max(1, Math.trunc(positive(options.directionIterations, 12)));
  const capacityIterations = Math.max(4, Math.trunc(positive(options.capacityIterations, 18)));
  const capacityCurvatureTolerance = positive(options.capacityCurvatureTolerance, 1e-6);
  const solverOptions = sanitize(options.solverOptions || {});
  const source = deepFreeze({
    sectionId: clean(section.id) || null,
    sectionType: clean(section.type || section.shape) || 'fiber-section',
    sectionHash: clean(section.contentHash) || stableHash(sanitize(section)),
    solverId: clean(options.solverId || solveTargetAxial.solverId || solveTargetAxial.name) || 'target-axial-section-solver',
    solverVersion: clean(options.solverVersion || solveTargetAxial.version) || null,
    axialIntercepts,
    axialLevels,
    angles,
    curvatures,
    axialTolerance,
    axialAbsoluteTolerance,
    directionTolerance,
    directionIterations,
    capacityCriterion: 'first-material-limit-state-or-resolved-local-peak',
    capacityIterations,
    capacityCurvatureTolerance,
    solverOptions,
  });
  const sourceHash = stableHash(source);
  let solveCount = 0;
  let solveRequestCount = 0;
  let solveCacheHitCount = 0;
  const memoizeSectionStates = options.memoizeSectionStates === true;
  const solveCache = new Map();

  const solve = (targetAxialForce, curvature, angle, purpose) => {
    throwIfPmmCancelled(options);
    solveRequestCount += 1;
    const curvatureY = curvature * Math.cos(angle);
    const curvatureZ = curvature * Math.sin(angle);
    const cacheKey = sectionStateKey(targetAxialForce, curvatureY, curvatureZ);
    const cachedRaw = memoizeSectionStates ? solveCache.get(cacheKey) : null;
    if (cachedRaw) {
      solveCacheHitCount += 1;
      return normalizeSectionSolve(cachedRaw, targetAxialForce, curvature, angle, axialTolerance, axialAbsoluteTolerance);
    }
    solveCount += 1;
    let raw;
    try {
      raw = solveTargetAxial(section, {
        ...solverOptions,
        targetN: targetAxialForce,
        targetAxialForce,
        axialForce: targetAxialForce,
        kappaY: curvatureY,
        kappaZ: curvatureZ,
        curvatureY,
        curvatureZ,
        curvature: Object.freeze([curvatureY, curvatureZ]),
        commit: false,
        purpose,
      });
    } catch (cause) {
      throw pmmError('PMM_SECTION_SOLVER_FAILED', 'The target-axial section solver threw while generating the PMM surface.', {
        targetAxialForce,
        curvatureY,
        curvatureZ,
        purpose,
        causeCode: clean(cause?.code) || null,
        causeMessage: clean(cause?.message) || String(cause),
      });
    }
    if (raw && typeof raw.then === 'function') {
      throw pmmError('PMM_ASYNC_SECTION_SOLVER_UNSUPPORTED', 'PMM surface generation requires a synchronous target-axial section solver.');
    }
    const normalized = normalizeSectionSolve(raw, targetAxialForce, curvature, angle, axialTolerance, axialAbsoluteTolerance);
    if (memoizeSectionStates && normalized.ok) solveCache.set(cacheKey, raw);
    return normalized;
  };

  const pureAxial = deepFreeze({
    compression: buildPureAxialIntercept('compression', axialIntercepts.compression, solve),
    tension: buildPureAxialIntercept('tension', axialIntercepts.tension, solve),
  });

  const sampledLevels = [];
  const totalCapacityPoints = axialLevels.length * angles.length;
  let completedCapacityPoints = 0;
  for (let levelIndex = 0; levelIndex < axialLevels.length; levelIndex += 1) {
    const axialForce = axialLevels[levelIndex];
    const points = [];
    for (let angleIndex = 0; angleIndex < angles.length; angleIndex += 1) {
      throwIfPmmCancelled(options);
      const angle = angles[angleIndex];
      points.push(buildCapacityPoint({
        axialForce,
        angle,
        curvatures,
        solve,
        capacityTolerance: positive(options.capacityTolerance, 1e-12),
        directionTolerance,
        directionIterations,
        capacityIterations,
        capacityCurvatureTolerance,
      }));
      completedCapacityPoints += 1;
      options.onProgress?.(Object.freeze({
        stage: 'pmm-capacity-surface',
        completed: completedCapacityPoints,
        total: totalCapacityPoints,
        ratio: completedCapacityPoints / totalCapacityPoints,
        levelIndex,
        angleIndex,
        axialForce,
        angle,
        sectionSolveCount: solveCount,
      }));
    }
    sampledLevels.push({
      axialForce,
      points,
      maxRadialCapacity: Math.max(...points.map((point) => point.radialCapacity)),
      minRadialCapacity: Math.min(...points.map((point) => point.radialCapacity)),
    });
  }
  const axialConvexity = enforceConservativeAxialConvexity(sampledLevels, axialIntercepts);
  const levels = deepFreeze(axialConvexity.levels);

  const zeroLevel = levels.find((level) => nearlyEqual(level.axialForce, 0));
  if (!zeroLevel) throw pmmError('PMM_ZERO_AXIAL_LEVEL_REQUIRED', 'The PMM surface requires a zero-axial-force level.');
  const intercepts = deepFreeze({
    pureAxial,
    pureBending: buildPureBendingIntercepts(zeroLevel),
    uniaxial: buildUniaxialIntercepts(levels),
  });
  const core = {
    version: PMM_SURFACE_VERSION,
    qualification: 'candidate',
    signConvention: PMM_SIGN_CONVENTION,
    units: Object.freeze({ axialForce: 'force', moment: 'force-length', curvature: '1/length' }),
    source,
    sourceHash,
    axialBounds: axialIntercepts,
    levels: deepFreeze(levels),
    intercepts,
    summary: Object.freeze({
      axialLevelCount: levels.length,
      angleCount: angles.length,
      curvatureSampleCount: curvatures.length,
      sectionSolveCount: solveCount,
      sectionSolveRequestCount: solveRequestCount,
      sectionSolveCacheHitCount: solveCacheHitCount,
      axialConvexityAdjustedLevelCount: axialConvexity.adjustedLevelCount,
    }),
    execution: Object.freeze({
      memoizeSectionStates,
      sectionSolveCount: solveCount,
      sectionSolveRequestCount: solveRequestCount,
      sectionSolveCacheHitCount: solveCacheHitCount,
    }),
  };
  const surfaceHash = stableHash(surfaceHashPayload(core));
  const candidate = { ...core, surfaceHash };
  const validation = validatePmmSurface(candidate);
  if (!validation.ok) {
    throw pmmError('PMM_GENERATED_SURFACE_INVALID', 'Generated PMM surface failed validation.', { validation });
  }
  return deepFreeze({ ...candidate, validation });
}

function enforceConservativeAxialConvexity(levels, bounds) {
  const factors = new Array(levels.length).fill(1);
  const rows = [
    { axialForce: bounds.compression, endpoint: true },
    ...levels,
    { axialForce: bounds.tension, endpoint: true },
  ];
  const capacity = (rowIndex, angleIndex) => {
    if (rows[rowIndex].endpoint) return 0;
    return rows[rowIndex].points[angleIndex].radialCapacity * factors[rowIndex - 1];
  };
  for (let pass = 0; pass < 100; pass += 1) {
    let changed = false;
    for (let angleIndex = 0; angleIndex < levels[0].points.length; angleIndex += 1) {
      for (let index = 1; index < rows.length - 1; index += 1) {
        const left = rows[index - 1];
        const middle = rows[index];
        const right = rows[index + 1];
        const span = right.axialForce - left.axialForce;
        const fraction = (middle.axialForce - left.axialForce) / span;
        const leftCapacity = capacity(index - 1, angleIndex);
        const middleCapacity = capacity(index, angleIndex);
        const rightCapacity = capacity(index + 1, angleIndex);
        const chord = leftCapacity + fraction * (rightCapacity - leftCapacity);
        if (!(middleCapacity < chord - 1e-10 * Math.max(1, chord))) continue;
        if (!left.endpoint && !right.endpoint) {
          const ratio = Math.max(0, Math.min(1, middleCapacity / chord));
          factors[index - 2] *= ratio;
          factors[index] *= ratio;
        } else if (!left.endpoint && 1 - fraction > 1e-14) {
          const limit = middleCapacity / ((1 - fraction) * Math.max(leftCapacity, 1e-30));
          factors[index - 2] *= Math.max(0, Math.min(1, limit));
        } else if (!right.endpoint && fraction > 1e-14) {
          const limit = middleCapacity / (fraction * Math.max(rightCapacity, 1e-30));
          factors[index] *= Math.max(0, Math.min(1, limit));
        }
        changed = true;
      }
    }
    if (!changed) break;
    if (pass === 99) throw pmmError('PMM_AXIAL_CONVEXIFICATION_FAILED', 'Conservative axial PMM convexification did not converge.');
  }
  const adjusted = levels.map((level, index) => {
    const scale = factors[index];
    const points = level.points.map((point) => {
      const radialCapacity = point.radialCapacity * scale;
      return {
        ...point,
        rawRadialCapacity: point.radialCapacity,
        axialConvexityScale: scale,
        radialCapacity,
        My: radialCapacity * Math.cos(point.angle),
        Mz: radialCapacity * Math.sin(point.angle),
      };
    });
    return {
      ...level,
      points,
      maxRadialCapacity: Math.max(...points.map((point) => point.radialCapacity)),
      minRadialCapacity: Math.min(...points.map((point) => point.radialCapacity)),
      axialConvexityScale: scale,
    };
  });
  return {
    levels: adjusted,
    adjustedLevelCount: factors.filter((factor) => factor < 1 - 1e-12).length,
  };
}

export const buildPmmSurface = generatePmmSurface;

export function validatePmmSurface(surface = {}, options = {}) {
  const tolerance = positive(options.tolerance, 1e-9);
  const convexityTolerance = positive(options.convexityTolerance, Math.max(tolerance, 1e-6));
  const errors = [];
  const add = (code, message, path = null) => errors.push(Object.freeze({ code, message, path }));
  const bounds = surface.axialBounds || {};
  const compression = Number(bounds.compression);
  const tension = Number(bounds.tension);

  if (!(Number.isFinite(compression) && compression < 0)) {
    add('PMM_COMPRESSION_SIGN_INVALID', 'Compression capacity must be finite and negative.', 'axialBounds.compression');
  }
  if (!(Number.isFinite(tension) && tension > 0)) {
    add('PMM_TENSION_SIGN_INVALID', 'Tension capacity must be finite and positive.', 'axialBounds.tension');
  }
  if (surface.signConvention?.axialForce !== 'tension-positive') {
    add('PMM_SIGN_CONVENTION_INVALID', 'PMM surface must declare tension-positive axial force.', 'signConvention.axialForce');
  }

  const levels = Array.isArray(surface.levels) ? surface.levels : [];
  if (levels.length < 2) add('PMM_AXIAL_LEVELS_INSUFFICIENT', 'At least two internal axial levels are required.', 'levels');
  let previousAxial = -Infinity;
  for (let levelIndex = 0; levelIndex < levels.length; levelIndex += 1) {
    const level = levels[levelIndex] || {};
    const axialForce = Number(level.axialForce);
    if (!Number.isFinite(axialForce) || axialForce <= previousAxial + tolerance) {
      add('PMM_AXIAL_LEVELS_NOT_MONOTONIC', 'Axial levels must be finite and strictly increasing.', `levels[${levelIndex}].axialForce`);
    }
    if (Number.isFinite(compression) && Number.isFinite(tension)
      && !(axialForce > compression + tolerance && axialForce < tension - tolerance)) {
      add('PMM_AXIAL_LEVEL_OUT_OF_BOUNDS', 'Internal axial levels must lie strictly inside pure-axial bounds.', `levels[${levelIndex}].axialForce`);
    }
    previousAxial = axialForce;
    validateLevel(level, levelIndex, tolerance, convexityTolerance, add);
  }
  if (!levels.some((level) => nearlyEqual(Number(level.axialForce), 0, tolerance))) {
    add('PMM_ZERO_AXIAL_LEVEL_MISSING', 'A pure-bending level at zero axial force is required.', 'levels');
  }

  const pureBending = surface.intercepts?.pureBending || {};
  validateSignedIntercept(pureBending.myPositive, 1, 'myPositive', add);
  validateSignedIntercept(pureBending.myNegative, -1, 'myNegative', add);
  validateSignedIntercept(pureBending.mzPositive, 1, 'mzPositive', add);
  validateSignedIntercept(pureBending.mzNegative, -1, 'mzNegative', add);
  validatePureAxialIntercept(surface.intercepts?.pureAxial?.compression, compression, 'compression', tolerance, add);
  validatePureAxialIntercept(surface.intercepts?.pureAxial?.tension, tension, 'tension', tolerance, add);
  validateAxialConvexity(levels, compression, tension, convexityTolerance, add);

  if (!clean(surface.sourceHash) || stableHash(surface.source || {}) !== surface.sourceHash) {
    add('PMM_SOURCE_HASH_MISMATCH', 'Immutable PMM source hash does not match its source snapshot.', 'sourceHash');
  }
  if (!clean(surface.surfaceHash) || stableHash(surfaceHashPayload(surface)) !== surface.surfaceHash) {
    add('PMM_SURFACE_HASH_MISMATCH', 'PMM surface content hash does not match its data.', 'surfaceHash');
  }

  const uniqueErrors = uniqueIssues(errors);
  return deepFreeze({
    version: PMM_SURFACE_VERSION,
    ok: uniqueErrors.length === 0,
    blocked: uniqueErrors.length > 0,
    errors: uniqueErrors,
    checks: {
      sign: !uniqueErrors.some((issue) => issue.code.includes('SIGN')),
      monotonicAxialLevels: !uniqueErrors.some((issue) => issue.code.includes('MONOTONIC')),
      positiveRadialCapacity: !uniqueErrors.some((issue) => issue.code === 'PMM_RADIAL_CAPACITY_NONPOSITIVE'),
      convexity: !uniqueErrors.some((issue) => (
        issue.code === 'PMM_SURFACE_NONCONVEX' || issue.code === 'PMM_SURFACE_AXIAL_NONCONVEX'
      )),
      integrity: !uniqueErrors.some((issue) => issue.code.includes('HASH')),
    },
  });
}

export function interpolatePmmSurface(surface = {}, input = {}) {
  const validation = validatePmmSurface(surface);
  if (!validation.ok) return blockedInterpolation('PMM_SURFACE_INVALID', input, surface, { validation });
  return interpolateValidatedSurface(surface, input);
}

export const evaluatePmmCapacity = interpolatePmmSurface;

/**
 * Pure iteration evaluator: it intentionally does not retain an axial-force
 * cache, so a changed axial force updates capacity and hinge tangent immediately.
 */
export function createPmmSurfaceEvaluator(surface = {}, options = {}) {
  const validation = validatePmmSurface(surface);
  const referenceAxialForce = finite(options.referenceAxialForce, 0);
  const configuredReferenceTangent = finiteOrNull(options.referenceTangent);
  return Object.freeze({
    version: PMM_SURFACE_VERSION,
    surfaceHash: surface.surfaceHash || null,
    sourceHash: surface.sourceHash || null,
    validation,
    evaluate(input = {}) {
      if (!validation.ok) return blockedInterpolation('PMM_SURFACE_INVALID', input, surface, { validation });
      const evaluated = interpolateValidatedSurface(surface, input);
      if (!evaluated.ok) return evaluated;
      const reference = interpolateValidatedSurface(surface, {
        axialForce: referenceAxialForce,
        angle: evaluated.angle,
      });
      if (!reference.ok || !(reference.momentCapacity > 0)) {
        return blockedInterpolation('PMM_REFERENCE_CAPACITY_INVALID', input, surface, { reference });
      }
      const tangentScale = evaluated.momentCapacity / reference.momentCapacity;
      const referenceTangent = finiteOrNull(input.referenceTangent ?? input.baseTangent)
        ?? configuredReferenceTangent
        ?? evaluated.initialSectionTangent;
      const tangent = Number.isFinite(referenceTangent) ? referenceTangent * tangentScale : null;
      return deepFreeze({
        ...evaluated,
        iterationId: clean(input.iterationId) || null,
        referenceAxialForce,
        referenceMomentCapacity: reference.momentCapacity,
        tangentScale,
        referenceTangent,
        tangent,
        updatedFromAxialForce: evaluated.axialForce,
      });
    },
  });
}

function buildPureAxialIntercept(kind, targetAxialForce, solve) {
  const response = solve(targetAxialForce, 0, 0, `pure-axial-${kind}`);
  if (!response.ok) {
    throw pmmError('PMM_PURE_AXIAL_SOLVE_FAILED', `Pure axial ${kind} intercept did not converge.`, { response });
  }
  return deepFreeze({
    axialForce: targetAxialForce,
    solvedAxialForce: response.axialForce,
    axialResidual: response.axialResidual,
    axialStrain: response.axialStrain,
    converged: true,
    sign: kind,
  });
}

function buildCapacityPoint({
  axialForce,
  angle,
  curvatures,
  solve,
  capacityTolerance,
  directionTolerance,
  directionIterations,
  capacityIterations,
  capacityCurvatureTolerance,
}) {
  const responses = [];
  let curvatureAngle = angle;
  for (const curvature of curvatures) {
    const response = solveMomentRay({
      axialForce,
      targetAngle: angle,
      curvature,
      initialCurvatureAngle: curvatureAngle,
      solve,
      directionTolerance,
      directionIterations,
      capacityTolerance,
    });
    responses.push(response);
    if (response.curvature <= capacityTolerance && response.sectionTangent) {
      curvatureAngle = initialCurvatureAngleForMomentRay(response.sectionTangent, angle);
    } else if (Number.isFinite(response.curvatureAngle) && response.curvature > capacityTolerance) {
      curvatureAngle = response.curvatureAngle;
    }
    if (response.ok && response.limitState?.reached && response.radialMoment > capacityTolerance) break;
  }
  const candidates = responses.filter((row) => row.ok && row.radialMoment > capacityTolerance);
  if (candidates.length === 0) {
    throw pmmError('PMM_RADIAL_CAPACITY_SOLVE_FAILED', `No positive radial capacity was found at P=${axialForce}, angle=${angle}.`, {
      axialForce,
      angle,
      responses,
    });
  }
  const firstLimitIndex = responses.findIndex((row) => row.ok && row.limitState?.reached && row.radialMoment > capacityTolerance);
  let peak;
  let capacityCriterion;
  if (firstLimitIndex > 0) {
    peak = refineLimitStateCapacity({
      lower: responses[firstLimitIndex - 1],
      upper: responses[firstLimitIndex],
      axialForce,
      angle,
      solve,
      directionTolerance,
      directionIterations,
      capacityTolerance,
      capacityIterations,
      capacityCurvatureTolerance,
    });
    capacityCriterion = 'first-material-limit-state';
  } else {
    const localPeakIndex = responses.findIndex((row, index) => (
      index > 0
      && index < responses.length - 1
      && row.ok
      && row.radialMoment >= responses[index - 1].radialMoment
      && row.radialMoment >= responses[index + 1].radialMoment
      && row.radialMoment > responses[index + 1].radialMoment + capacityTolerance
    ));
    if (localPeakIndex < 1) {
      throw pmmError('PMM_LIMIT_STATE_NOT_REACHED', `No material limit state or resolved local peak was found at P=${axialForce}, angle=${angle}.`, {
        axialForce,
        angle,
        responses,
      });
    }
    peak = refinePeakCapacity({
      lower: responses[localPeakIndex - 1],
      center: responses[localPeakIndex],
      upper: responses[localPeakIndex + 1],
      axialForce,
      angle,
      solve,
      directionTolerance,
      directionIterations,
      capacityTolerance,
      capacityIterations,
      capacityCurvatureTolerance,
    });
    capacityCriterion = 'resolved-local-peak';
  }
  const firstPositive = candidates[0];
  const radialCapacity = peak.radialMoment;
  return deepFreeze({
    angle,
    radialCapacity,
    My: radialCapacity * Math.cos(angle),
    Mz: radialCapacity * Math.sin(angle),
    selectedCurvature: peak.curvature,
    curvatureY: peak.curvatureY,
    curvatureZ: peak.curvatureZ,
    curvatureAngle: peak.curvatureAngle,
    directionError: peak.directionError,
    solvedMoments: Object.freeze({ My: peak.My, Mz: peak.Mz }),
    axialResidual: peak.axialResidual,
    axialStrain: peak.axialStrain,
    sectionTangent: peak.directionalTangent,
    initialSectionTangent: firstPositive.directionalTangent,
    capacityCriterion,
    limitState: peak.limitState,
    sampleCount: responses.length,
  });
}

function initialCurvatureAngleForMomentRay(K, targetAngle) {
  if (!K || !(Math.abs(K[0][0]) > 1e-14)) return targetAngle;
  const condensed = [
    [K[1][1] - K[1][0] * K[0][1] / K[0][0], K[1][2] - K[1][0] * K[0][2] / K[0][0]],
    [K[2][1] - K[2][0] * K[0][1] / K[0][0], K[2][2] - K[2][0] * K[0][2] / K[0][0]],
  ];
  const determinant = condensed[0][0] * condensed[1][1] - condensed[0][1] * condensed[1][0];
  if (!Number.isFinite(determinant) || Math.abs(determinant) <= 1e-20) return targetAngle;
  const my = Math.cos(targetAngle);
  const mz = Math.sin(targetAngle);
  const kappaY = (condensed[1][1] * my - condensed[0][1] * mz) / determinant;
  const kappaZ = (-condensed[1][0] * my + condensed[0][0] * mz) / determinant;
  return Math.atan2(kappaZ, kappaY);
}

function refineLimitStateCapacity(input) {
  let lower = input.lower;
  let upper = input.upper;
  for (let iteration = 0; iteration < input.capacityIterations; iteration += 1) {
    if (Math.abs(upper.curvature - lower.curvature) <= input.capacityCurvatureTolerance * Math.max(1, upper.curvature)) break;
    const curvature = 0.5 * (lower.curvature + upper.curvature);
    const candidate = solveMomentRay({
      axialForce: input.axialForce,
      targetAngle: input.angle,
      curvature,
      solve: input.solve,
      directionTolerance: input.directionTolerance,
      directionIterations: input.directionIterations,
      capacityTolerance: input.capacityTolerance,
    });
    if (!candidate.ok) throw pmmError('PMM_LIMIT_STATE_REFINEMENT_FAILED', 'Limit-state refinement section solve failed.', { candidate });
    if (candidate.limitState?.reached) upper = candidate;
    else lower = candidate;
  }
  return upper;
}

function refinePeakCapacity(input) {
  let left = input.lower.curvature;
  let right = input.upper.curvature;
  let best = input.center;
  const ratio = (Math.sqrt(5) - 1) / 2;
  let x1 = right - ratio * (right - left);
  let x2 = left + ratio * (right - left);
  let r1 = samplePeak(input, x1);
  let r2 = samplePeak(input, x2);
  for (let iteration = 0; iteration < input.capacityIterations; iteration += 1) {
    best = [best, r1, r2].reduce((row, candidate) => candidate.radialMoment > row.radialMoment ? candidate : row);
    if (Math.abs(right - left) <= input.capacityCurvatureTolerance * Math.max(1, best.curvature)) break;
    if (r1.radialMoment < r2.radialMoment) {
      left = x1;
      x1 = x2;
      r1 = r2;
      x2 = left + ratio * (right - left);
      r2 = samplePeak(input, x2);
    } else {
      right = x2;
      x2 = x1;
      r2 = r1;
      x1 = right - ratio * (right - left);
      r1 = samplePeak(input, x1);
    }
  }
  return best;
}

function samplePeak(input, curvature) {
  const candidate = solveMomentRay({
    axialForce: input.axialForce,
    targetAngle: input.angle,
    curvature,
    solve: input.solve,
    directionTolerance: input.directionTolerance,
    directionIterations: input.directionIterations,
    capacityTolerance: input.capacityTolerance,
  });
  if (!candidate.ok) throw pmmError('PMM_PEAK_REFINEMENT_FAILED', 'Peak refinement section solve failed.', { candidate });
  return candidate;
}

function solveMomentRay({
  axialForce,
  targetAngle,
  curvature,
  initialCurvatureAngle,
  solve,
  directionTolerance,
  directionIterations,
  capacityTolerance,
}) {
  let curvatureAngle = Number.isFinite(Number(initialCurvatureAngle)) ? Number(initialCurvatureAngle) : targetAngle;
  let response = solve(axialForce, curvature, curvatureAngle, 'pmm-radial-capacity');
  if (!response.ok || curvature <= capacityTolerance || Math.hypot(response.My, response.Mz) <= capacityTolerance) {
    return withMomentRay(response, targetAngle, curvatureAngle, 0);
  }
  let directionError = signedAngleDifference(Math.atan2(response.Mz, response.My), targetAngle);
  for (let iteration = 0; iteration < directionIterations && Math.abs(directionError) > directionTolerance; iteration += 1) {
    let derivative = constantAxialMomentAngleDerivative(response, curvature, curvatureAngle);
    if (!Number.isFinite(derivative) || Math.abs(derivative) <= 1e-10) {
      const h = 1e-5;
      const probeAngle = curvatureAngle + h;
      const probe = solve(axialForce, curvature, probeAngle, 'pmm-moment-ray-correction');
      if (!probe.ok || Math.hypot(probe.My, probe.Mz) <= capacityTolerance) break;
      const probeError = signedAngleDifference(Math.atan2(probe.Mz, probe.My), targetAngle);
      derivative = signedAngleDifference(probeError, directionError) / h;
    }
    if (!Number.isFinite(derivative) || Math.abs(derivative) <= 1e-10) break;
    const correction = Math.max(-Math.PI / 4, Math.min(Math.PI / 4, directionError / derivative));
    let accepted = null;
    for (const alpha of [1, 0.5, 0.25, 0.125, 0.0625]) {
      const candidateAngle = curvatureAngle - alpha * correction;
      const candidate = solve(axialForce, curvature, candidateAngle, 'pmm-moment-ray-correction');
      if (!candidate.ok || Math.hypot(candidate.My, candidate.Mz) <= capacityTolerance) continue;
      const candidateError = signedAngleDifference(Math.atan2(candidate.Mz, candidate.My), targetAngle);
      if (Math.abs(candidateError) < Math.abs(directionError)) {
        accepted = { response: candidate, angle: candidateAngle, error: candidateError };
        break;
      }
    }
    if (!accepted) break;
    response = accepted.response;
    curvatureAngle = accepted.angle;
    directionError = accepted.error;
  }
  const corrected = withMomentRay(response, targetAngle, curvatureAngle, directionError);
  if (Math.abs(directionError) <= directionTolerance || corrected.radialMoment <= capacityTolerance) return corrected;
  return deepFreeze({ ...corrected, ok: false, reason: 'PMM_MOMENT_RAY_NOT_CONVERGED' });
}

function withMomentRay(response, targetAngle, curvatureAngle, directionError) {
  return deepFreeze({
    ...response,
    targetAngle,
    curvatureAngle: normalizeAngle(curvatureAngle),
    directionError,
    radialMoment: response.My * Math.cos(targetAngle) + response.Mz * Math.sin(targetAngle),
  });
}

function buildPureBendingIntercepts(zeroLevel) {
  const at = (angle) => pointAtExactAngle(zeroLevel, angle);
  const positiveY = at(0);
  const positiveZ = at(Math.PI / 2);
  const negativeY = at(Math.PI);
  const negativeZ = at(3 * Math.PI / 2);
  return deepFreeze({
    myPositive: positiveY.radialCapacity,
    myNegative: -negativeY.radialCapacity,
    mzPositive: positiveZ.radialCapacity,
    mzNegative: -negativeZ.radialCapacity,
  });
}

function buildUniaxialIntercepts(levels) {
  return deepFreeze({
    pMy: levels.map((level) => deepFreeze({
      axialForce: level.axialForce,
      positive: pointAtExactAngle(level, 0).radialCapacity,
      negative: -pointAtExactAngle(level, Math.PI).radialCapacity,
    })),
    pMz: levels.map((level) => deepFreeze({
      axialForce: level.axialForce,
      positive: pointAtExactAngle(level, Math.PI / 2).radialCapacity,
      negative: -pointAtExactAngle(level, 3 * Math.PI / 2).radialCapacity,
    })),
  });
}

function normalizeSectionSolve(raw, targetAxialForce, curvature, angle, axialTolerance, axialAbsoluteTolerance) {
  const source = raw?.response || raw || {};
  const forceSource = source.forces || source.sectionForces || source.force || source;
  const vector = Array.isArray(forceSource) || ArrayBuffer.isView(forceSource) ? forceSource : null;
  const axialForce = finite(vector?.[0] ?? forceSource.N ?? forceSource.axialForce ?? source.N, NaN);
  const My = finite(vector?.[1] ?? forceSource.My ?? source.My, NaN);
  const Mz = finite(vector?.[2] ?? forceSource.Mz ?? source.Mz, NaN);
  const axialResidual = finite(
    raw?.axialResidual ?? source.axialResidual ?? raw?.residual?.axial ?? source.residual?.axial,
    axialForce - targetAxialForce,
  );
  const converged = raw?.ok !== false && raw?.converged !== false && source.converged !== false;
  const curvatureY = curvature * Math.cos(angle);
  const curvatureZ = curvature * Math.sin(angle);
  const sectionTangent = extractSectionTangent(raw, source);
  const directionalTangent = extractDirectionalTangent(raw, source, angle, sectionTangent);
  const limitState = extractLimitState(raw, source);
  const ok = converged
    && Number.isFinite(axialForce)
    && Number.isFinite(My)
    && Number.isFinite(Mz)
    && Math.abs(axialResidual) <= axialAbsoluteTolerance + axialTolerance * Math.abs(targetAxialForce);
  return deepFreeze({
    ok,
    converged,
    targetAxialForce,
    axialForce,
    axialResidual,
    axialStrain: finiteOrNull(raw?.epsilon0 ?? source.epsilon0 ?? raw?.axialStrain ?? source.axialStrain ?? raw?.strain?.axial ?? source.strain?.axial),
    My,
    Mz,
    radialMoment: My * Math.cos(angle) + Mz * Math.sin(angle),
    curvature,
    curvatureY,
    curvatureZ,
    directionalTangent,
    sectionTangent,
    limitState,
    reason: clean(raw?.reason || raw?.failureCode || source.reason) || (ok ? null : 'target-axial-section-solve-invalid'),
  });
}

function sectionStateKey(axialForce, curvatureY, curvatureZ) {
  return `${numberKey(axialForce)}|${numberKey(curvatureY)}|${numberKey(curvatureZ)}`;
}

function numberKey(value) {
  const number = Object.is(Number(value), -0) ? 0 : Number(value);
  return Number.isFinite(number) ? number.toPrecision(17) : String(number);
}

function throwIfPmmCancelled(options) {
  const cancelled = options.signal?.aborted === true
    || options.cancellation?.requested === true
    || options.cancellation?.aborted === true
    || options.isCancelled?.() === true
    || options.shouldCancel?.() === true;
  if (!cancelled) return;
  throw pmmError('PMM_GENERATION_CANCELLED', 'PMM surface generation was cancelled before the next section solve.');
}

function extractLimitState(raw, source) {
  const explicit = raw?.limitState || source?.limitState;
  if (explicit != null) {
    const reached = explicit === true || explicit.reached === true;
    return deepFreeze({
      reached,
      type: clean(explicit.type) || (reached ? 'solver-declared' : null),
      fiberId: clean(explicit.fiberId) || null,
      materialId: clean(explicit.materialId) || null,
      strain: finiteOrNull(explicit.strain),
    });
  }
  const fibers = source?.fibers || raw?.response?.fibers || raw?.fibers || [];
  const reachedFiber = fibers.find((fiber) => {
    const branch = clean(fiber?.trialState?.branch || fiber?.branch);
    return branch.startsWith('plastic-') || branch.includes('compression-descending') || branch.includes('compression-residual');
  });
  return deepFreeze({
    reached: Boolean(reachedFiber),
    type: reachedFiber ? clean(reachedFiber.trialState?.branch || reachedFiber.branch) || 'fiber-material-limit' : null,
    fiberId: reachedFiber?.id || null,
    materialId: reachedFiber?.materialId || null,
    strain: finiteOrNull(reachedFiber?.strain),
  });
}

function extractDirectionalTangent(raw, source, angle, sectionTangent = extractSectionTangent(raw, source)) {
  const direct = finiteOrNull(raw?.directionalTangent ?? source.directionalTangent);
  if (direct !== null) return direct;
  const rows = sectionTangent;
  if (!Array.isArray(rows) || rows.length < 3) return null;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const kyy = finite(rows[1]?.[1], NaN);
  const kyz = finite(rows[1]?.[2], NaN);
  const kzy = finite(rows[2]?.[1], NaN);
  const kzz = finite(rows[2]?.[2], NaN);
  if (![kyy, kyz, kzy, kzz].every(Number.isFinite)) return null;
  return c * (kyy * c + kyz * s) + s * (kzy * c + kzz * s);
}

function extractSectionTangent(raw, source) {
  const matrix = raw?.tangent || source.tangent || source.sectionTangent;
  const rows = matrix?.values && matrix?.size === 3 ? [
    matrix.values.slice(0, 3),
    matrix.values.slice(3, 6),
    matrix.values.slice(6, 9),
  ] : matrix;
  if (!Array.isArray(rows) || rows.length < 3 || rows.slice(0, 3).some((row) => !Array.isArray(row) || row.length < 3)) return null;
  const normalized = rows.slice(0, 3).map((row) => row.slice(0, 3).map(Number));
  return normalized.flat().every(Number.isFinite) ? normalized : null;
}

function constantAxialMomentAngleDerivative(response, curvature, curvatureAngle) {
  const K = response.sectionTangent;
  const My = Number(response.My);
  const Mz = Number(response.Mz);
  const denominator = My ** 2 + Mz ** 2;
  if (!K || !(Math.abs(K[0][0]) > 1e-14) || !(denominator > 1e-20)) return NaN;
  const dKappaY = -curvature * Math.sin(curvatureAngle);
  const dKappaZ = curvature * Math.cos(curvatureAngle);
  const dEpsilon = -(K[0][1] * dKappaY + K[0][2] * dKappaZ) / K[0][0];
  const dMy = K[1][0] * dEpsilon + K[1][1] * dKappaY + K[1][2] * dKappaZ;
  const dMz = K[2][0] * dEpsilon + K[2][1] * dKappaY + K[2][2] * dKappaZ;
  return (My * dMz - Mz * dMy) / denominator;
}

function validateLevel(level, levelIndex, tolerance, convexityTolerance, add) {
  const points = Array.isArray(level.points) ? level.points : [];
  if (points.length < 4) {
    add('PMM_ANGLE_POINTS_INSUFFICIENT', 'At least four angle points are required at every axial level.', `levels[${levelIndex}].points`);
    return;
  }
  let previousAngle = -Infinity;
  for (let pointIndex = 0; pointIndex < points.length; pointIndex += 1) {
    const point = points[pointIndex] || {};
    const angle = Number(point.angle);
    const radius = Number(point.radialCapacity);
    if (!Number.isFinite(angle) || angle < -tolerance || angle >= TWO_PI + tolerance || angle <= previousAngle + tolerance) {
      add('PMM_ANGLES_NOT_MONOTONIC', 'Angles must be finite, normalized, and strictly increasing.', `levels[${levelIndex}].points[${pointIndex}].angle`);
    }
    if (!(Number.isFinite(radius) && radius > tolerance)) {
      add('PMM_RADIAL_CAPACITY_NONPOSITIVE', 'Every internal surface node requires positive radial capacity.', `levels[${levelIndex}].points[${pointIndex}].radialCapacity`);
    }
    if (Number.isFinite(radius) && Number.isFinite(angle)) {
      const expectedMy = radius * Math.cos(angle);
      const expectedMz = radius * Math.sin(angle);
      const scale = Math.max(1, Math.abs(radius));
      const pointMy = Number(point.My);
      const pointMz = Number(point.Mz);
      if (!Number.isFinite(pointMy) || !Number.isFinite(pointMz)
        || Math.abs(pointMy - expectedMy) > tolerance * scale
        || Math.abs(pointMz - expectedMz) > tolerance * scale) {
        add('PMM_NODE_SIGN_OR_COORDINATE_INVALID', 'PMM node moments must follow the declared radial angle and sign.', `levels[${levelIndex}].points[${pointIndex}]`);
      }
    }
    previousAngle = angle;
  }
  if (!isConvexCounterClockwise(points, convexityTolerance)) {
    add('PMM_SURFACE_NONCONVEX', 'Each axial slice must form a convex counter-clockwise moment polygon.', `levels[${levelIndex}].points`);
  }
}

function validateAxialConvexity(levels, compression, tension, tolerance, add) {
  if (!(Number.isFinite(compression) && Number.isFinite(tension)) || levels.length < 2) return;
  const angles = levels[0]?.points?.map((point) => Number(point.angle)).filter(Number.isFinite) || [];
  for (let angleIndex = 0; angleIndex < angles.length; angleIndex += 1) {
    const angle = angles[angleIndex];
    const rows = [
      { axialForce: compression, capacity: 0 },
      ...levels.map((level) => ({
        axialForce: Number(level.axialForce),
        capacity: radialAtLevel(level, angle).capacity,
      })),
      { axialForce: tension, capacity: 0 },
    ];
    for (let index = 1; index < rows.length - 1; index += 1) {
      const left = rows[index - 1];
      const middle = rows[index];
      const right = rows[index + 1];
      const span = right.axialForce - left.axialForce;
      if (!(span > 0)) continue;
      const fraction = (middle.axialForce - left.axialForce) / span;
      const chordCapacity = left.capacity + fraction * (right.capacity - left.capacity);
      const scale = Math.max(1, Math.abs(left.capacity), Math.abs(middle.capacity), Math.abs(right.capacity));
      if (middle.capacity < chordCapacity - tolerance * scale) {
        add(
          'PMM_SURFACE_AXIAL_NONCONVEX',
          'Moment capacity must be concave between the pure-axial intercepts for every moment angle.',
          `levels[${index - 1}].points[${angleIndex}]`,
        );
        return;
      }
    }
  }
}

function validateSignedIntercept(value, sign, name, add) {
  const n = Number(value);
  if (!Number.isFinite(n) || n * sign <= 0) {
    add('PMM_PURE_BENDING_SIGN_INVALID', `${name} has an invalid sign or zero capacity.`, `intercepts.pureBending.${name}`);
  }
}

function validatePureAxialIntercept(intercept, expected, name, tolerance, add) {
  const axialForce = Number(intercept?.axialForce);
  const solvedAxialForce = Number(intercept?.solvedAxialForce);
  const scale = Math.max(1, Math.abs(expected));
  if (!intercept || intercept.converged !== true
    || !Number.isFinite(axialForce)
    || !Number.isFinite(solvedAxialForce)
    || Math.abs(axialForce - expected) > tolerance * scale
    || Math.abs(solvedAxialForce - expected) > tolerance * scale) {
    add('PMM_PURE_AXIAL_INTERCEPT_INVALID', `Pure axial ${name} intercept must be converged and match its declared bound.`, `intercepts.pureAxial.${name}`);
  }
}

function interpolateValidatedSurface(surface, input) {
  const axialForce = finite(input.axialForce ?? input.N, NaN);
  if (!Number.isFinite(axialForce)) return blockedInterpolation('PMM_AXIAL_FORCE_NONFINITE', input, surface);
  const bounds = surface.axialBounds;
  const tolerance = positive(input.tolerance, 1e-10);
  if (axialForce < bounds.compression - tolerance || axialForce > bounds.tension + tolerance) {
    return blockedInterpolation('PMM_AXIAL_FORCE_OUT_OF_RANGE', input, surface, {
      requestedAxialForce: axialForce,
      bounds,
    });
  }

  const demandMy = finiteOrNull(input.My);
  const demandMz = finiteOrNull(input.Mz);
  let angle = finiteOrNull(input.angle);
  if (angle === null && demandMy !== null && demandMz !== null) angle = Math.atan2(demandMz, demandMy);
  if (angle === null) angle = 0;
  angle = normalizeAngle(angle);

  const slices = [
    virtualAxialLevel(bounds.compression),
    ...surface.levels,
    virtualAxialLevel(bounds.tension),
  ];
  const bracket = axialBracket(slices, axialForce, tolerance);
  const lo = radialAtLevel(bracket.lo, angle);
  const hi = radialAtLevel(bracket.hi, angle);
  const span = bracket.hi.axialForce - bracket.lo.axialForce;
  const ratio = Math.abs(span) <= tolerance ? 0 : (axialForce - bracket.lo.axialForce) / span;
  const momentCapacity = lo.capacity + ratio * (hi.capacity - lo.capacity);
  const axialDerivative = Math.abs(span) <= tolerance ? 0 : (hi.capacity - lo.capacity) / span;
  const sectionTangent = interpolateNullable(lo.sectionTangent, hi.sectionTangent, ratio);
  const initialSectionTangent = interpolateNullable(lo.initialSectionTangent, hi.initialSectionTangent, ratio);
  const angularDerivative = angularCapacityDerivative(bracket, angle, ratio);
  const radialDemand = demandMy !== null && demandMz !== null ? Math.hypot(demandMy, demandMz) : null;
  const utilization = radialDemand === null
    ? null
    : momentCapacity > tolerance ? radialDemand / momentCapacity : (radialDemand <= tolerance ? 0 : Infinity);
  return deepFreeze({
    version: PMM_SURFACE_VERSION,
    ok: true,
    blocked: false,
    reason: null,
    clamped: false,
    axialForce,
    angle,
    momentCapacity,
    capacityPoint: {
      My: momentCapacity * Math.cos(angle),
      Mz: momentCapacity * Math.sin(angle),
    },
    radialDemand,
    utilization,
    insideSurface: utilization === null ? null : utilization <= 1 + tolerance,
    tangentDerivatives: { axialForce: axialDerivative, angle: angularDerivative },
    sectionTangent,
    initialSectionTangent,
    interpolation: {
      axialLower: bracket.lo.axialForce,
      axialUpper: bracket.hi.axialForce,
      axialRatio: ratio,
      lowerAngleBracket: lo.angleBracket,
      upperAngleBracket: hi.angleBracket,
      exactNode: bracket.exact && lo.exactNode && hi.exactNode,
    },
    sourceHash: surface.sourceHash,
    surfaceHash: surface.surfaceHash,
  });
}

function radialAtLevel(level, angle) {
  if (level.virtual) return {
    capacity: 0,
    sectionTangent: null,
    initialSectionTangent: null,
    exactNode: true,
    angleBracket: Object.freeze([angle, angle]),
  };
  const points = level.points;
  const exact = points.find((point) => angularDistance(point.angle, angle) <= 1e-12);
  if (exact) return {
    capacity: exact.radialCapacity,
    sectionTangent: finiteOrNull(exact.sectionTangent),
    initialSectionTangent: finiteOrNull(exact.initialSectionTangent),
    exactNode: true,
    angleBracket: Object.freeze([exact.angle, exact.angle]),
  };
  const extended = [...points, { ...points[0], angle: points[0].angle + TWO_PI }];
  let query = angle;
  if (query < points[0].angle) query += TWO_PI;
  let lo = extended[0];
  let hi = extended[1];
  for (let index = 0; index < extended.length - 1; index += 1) {
    if (query >= extended[index].angle && query <= extended[index + 1].angle) {
      lo = extended[index];
      hi = extended[index + 1];
      break;
    }
  }
  const left = query - lo.angle;
  const right = hi.angle - query;
  const delta = hi.angle - lo.angle;
  const denominator = hi.radialCapacity * Math.sin(right) + lo.radialCapacity * Math.sin(left);
  const capacity = Math.abs(denominator) <= 1e-15
    ? 0
    : lo.radialCapacity * hi.radialCapacity * Math.sin(delta) / denominator;
  const ratio = delta > 0 ? left / delta : 0;
  return {
    capacity,
    sectionTangent: interpolateNullable(lo.sectionTangent, hi.sectionTangent, ratio),
    initialSectionTangent: interpolateNullable(lo.initialSectionTangent, hi.initialSectionTangent, ratio),
    exactNode: false,
    angleBracket: Object.freeze([normalizeAngle(lo.angle), normalizeAngle(hi.angle)]),
  };
}

function angularCapacityDerivative(bracket, angle, axialRatio) {
  const h = 1e-6;
  const sample = (sampleAngle) => {
    const lo = radialAtLevel(bracket.lo, normalizeAngle(sampleAngle)).capacity;
    const hi = radialAtLevel(bracket.hi, normalizeAngle(sampleAngle)).capacity;
    return lo + axialRatio * (hi - lo);
  };
  return (sample(angle + h) - sample(angle - h)) / (2 * h);
}

function axialBracket(levels, axialForce, tolerance) {
  const exact = levels.find((level) => Math.abs(level.axialForce - axialForce) <= tolerance);
  if (exact) return { lo: exact, hi: exact, exact: true };
  for (let index = 0; index < levels.length - 1; index += 1) {
    if (axialForce > levels[index].axialForce && axialForce < levels[index + 1].axialForce) {
      return { lo: levels[index], hi: levels[index + 1], exact: false };
    }
  }
  return { lo: levels[0], hi: levels[0], exact: true };
}

function virtualAxialLevel(axialForce) {
  return Object.freeze({ axialForce, virtual: true, points: Object.freeze([]) });
}

function pointAtExactAngle(level, targetAngle) {
  const point = level.points.find((row) => angularDistance(row.angle, targetAngle) <= 1e-10);
  if (!point) throw pmmError('PMM_CARDINAL_ANGLE_MISSING', `Required cardinal angle ${targetAngle} is missing.`);
  return point;
}

function isConvexCounterClockwise(points, tolerance) {
  if (points.length < 3) return false;
  const scale = Math.max(1, ...points.map((point) => Math.abs(Number(point.radialCapacity) || 0)));
  const crossTolerance = tolerance * scale * scale;
  let positiveCross = false;
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    const c = points[(index + 2) % points.length];
    const cross = (b.My - a.My) * (c.Mz - b.Mz) - (b.Mz - a.Mz) * (c.My - b.My);
    if (cross < -crossTolerance) return false;
    if (cross > crossTolerance) positiveCross = true;
  }
  return positiveCross;
}

function normalizeAxialIntercepts(input = {}) {
  const compression = finite(input.compression ?? input.compressive ?? input.min, NaN);
  const tension = finite(input.tension ?? input.tensile ?? input.max, NaN);
  if (!(compression < 0 && tension > 0)) {
    throw pmmError('PMM_AXIAL_INTERCEPTS_INVALID', 'Axial intercepts require negative compression and positive tension capacities.');
  }
  return deepFreeze({ compression, tension });
}

function normalizeAxialLevels(input, bounds) {
  const defaults = [
    0.8 * bounds.compression,
    0.4 * bounds.compression,
    0,
    0.4 * bounds.tension,
    0.8 * bounds.tension,
  ];
  const values = [...(Array.isArray(input) ? input : defaults), 0]
    .map(Number)
    .filter((value) => Number.isFinite(value) && value > bounds.compression && value < bounds.tension)
    .sort((a, b) => a - b);
  const unique = values.filter((value, index) => index === 0 || !nearlyEqual(value, values[index - 1]));
  if (unique.length < 2) throw pmmError('PMM_AXIAL_LEVELS_INSUFFICIENT', 'At least two unique internal axial levels are required.');
  return deepFreeze(unique);
}

function normalizeAngles(input, countInput) {
  const count = Math.max(8, Math.trunc(positive(countInput, 16)));
  const defaults = Array.from({ length: count }, (_, index) => TWO_PI * index / count);
  const values = [...(Array.isArray(input) ? input : defaults), ...CARDINAL_ANGLES]
    .map(Number)
    .filter(Number.isFinite)
    .map(normalizeAngle)
    .sort((a, b) => a - b);
  const unique = values.filter((value, index) => index === 0 || !nearlyEqual(value, values[index - 1], 1e-12));
  if (unique.length < 8) throw pmmError('PMM_ANGLES_INSUFFICIENT', 'At least eight unique PMM angles are required.');
  return deepFreeze(unique);
}

function normalizeCurvatures(input, options) {
  if (Array.isArray(input)) {
    const values = input.map(Number).filter((value) => Number.isFinite(value) && value >= 0).sort((a, b) => a - b);
    const unique = values.filter((value, index) => index === 0 || !nearlyEqual(value, values[index - 1]));
    if (unique.length >= 3 && nearlyEqual(unique[0], 0)) return deepFreeze(unique);
  }
  const max = positive(options.curvatureMax, 0.02);
  const count = Math.max(5, Math.trunc(positive(options.curvatureSteps, 40)));
  return deepFreeze(Array.from({ length: count + 1 }, (_, index) => max * index / count));
}

function resolveTargetAxialSolver(options) {
  const solver = options.solveTargetAxial
    || options.solveAtTargetAxialForce
    || options.sectionResponse?.solveTargetAxial
    || options.sectionResponse?.solveAtTargetAxialForce;
  if (typeof solver !== 'function') {
    throw pmmError(
      'PMM_TARGET_AXIAL_SOLVER_REQUIRED',
      'A sectionResponse target-axial solver must be supplied as solveTargetAxial.',
    );
  }
  return solver;
}

function blockedInterpolation(reason, input, surface, details = {}) {
  return deepFreeze({
    version: PMM_SURFACE_VERSION,
    ok: false,
    blocked: true,
    reason,
    clamped: false,
    requestedAxialForce: finiteOrNull(input?.axialForce ?? input?.N),
    bounds: surface?.axialBounds || null,
    surfaceHash: surface?.surfaceHash || null,
    sourceHash: surface?.sourceHash || null,
    ...details,
  });
}

function surfaceHashPayload(surface) {
  return {
    version: surface.version,
    qualification: surface.qualification,
    signConvention: surface.signConvention,
    units: surface.units,
    sourceHash: surface.sourceHash,
    axialBounds: surface.axialBounds,
    levels: surface.levels,
    intercepts: surface.intercepts,
    summary: {
      axialLevelCount: surface.summary?.axialLevelCount,
      angleCount: surface.summary?.angleCount,
      curvatureSampleCount: surface.summary?.curvatureSampleCount,
      axialConvexityAdjustedLevelCount: surface.summary?.axialConvexityAdjustedLevelCount,
    },
  };
}

function uniqueIssues(errors) {
  const seen = new Set();
  return deepFreeze(errors.filter((issue) => {
    const key = `${issue.code}|${issue.path || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }));
}

function sanitize(value) {
  if (value === null || value === undefined) return value ?? null;
  if (Array.isArray(value)) return value.map(sanitize);
  if (ArrayBuffer.isView(value)) return Array.from(value, sanitize);
  if (value instanceof Map) {
    return Object.fromEntries([...value.entries()]
      .map(([key, item]) => [String(key), sanitize(item)])
      .sort(([left], [right]) => left.localeCompare(right)));
  }
  if (value instanceof Set) return [...value].map(sanitize).sort(compareSanitized);
  if (typeof value !== 'object') return typeof value === 'function' ? undefined : value;
  const out = {};
  for (const key of Object.keys(value).sort()) {
    const item = sanitize(value[key]);
    if (item !== undefined) out[key] = item;
  }
  return out;
}

function compareSanitized(a, b) {
  return stableHash(a).localeCompare(stableHash(b));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function interpolateNullable(a, b, ratio) {
  const left = finiteOrNull(a);
  const right = finiteOrNull(b);
  if (left === null && right === null) return null;
  if (left === null) return right;
  if (right === null) return left;
  return left + ratio * (right - left);
}

function normalizeAngle(value) {
  const angle = Number(value) % TWO_PI;
  return angle < 0 ? angle + TWO_PI : angle;
}

function angularDistance(a, b) {
  const delta = Math.abs(normalizeAngle(a) - normalizeAngle(b));
  return Math.min(delta, TWO_PI - delta);
}

function signedAngleDifference(a, b) {
  let delta = Number(a) - Number(b);
  while (delta > Math.PI) delta -= TWO_PI;
  while (delta < -Math.PI) delta += TWO_PI;
  return delta;
}

function nearlyEqual(a, b, tolerance = 1e-10) {
  return Math.abs(Number(a) - Number(b)) <= tolerance * Math.max(1, Math.abs(Number(a)), Math.abs(Number(b)));
}

function clean(value) {
  return String(value ?? '').trim();
}

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function finiteOrNull(value) {
  const number = Number(value);
  return value !== null && value !== undefined && Number.isFinite(number) ? number : null;
}

function positive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function pmmError(code, message, details = null) {
  const error = new Error(message);
  error.name = 'PmmSurfaceError';
  error.code = code;
  if (details) error.details = details;
  return error;
}
