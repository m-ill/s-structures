export const PDELTA_STABILITY_VERSION = 'p7-m8-direct-stability-v1';

export function evaluateConstrainedTangentStability(K = [], freeDofs = [], options = {}) {
  const tolerance = positive(options.tolerance, 1e-9);
  const free = [...(freeDofs || [])];
  if (!free.length) {
    return {
      version: PDELTA_STABILITY_VERSION,
      method: 'dimension-block-congruence-scaled-ldlt',
      status: 'stable',
      stable: true,
      tolerance,
      freeDofCount: 0,
      lowestStabilityIndicator: null,
      minimumScaledPivot: null,
      reason: 'NO_FREE_DOFS',
    };
  }

  const raw = constrainedSymmetricMatrix(K, free);
  const reference = constrainedSymmetricMatrix(options.referenceMatrix || K, free);
  const translationDiagonal = reference
    .map((row, index) => ({ dof: free[index], value: Math.abs(row[index] || 0) }))
    .filter((item) => item.dof % 6 < 3)
    .map((item) => item.value);
  const rotationDiagonal = reference
    .map((row, index) => ({ dof: free[index], value: Math.abs(row[index] || 0) }))
    .filter((item) => item.dof % 6 >= 3)
    .map((item) => item.value);
  const translationScale = Math.max(1e-30, ...translationDiagonal);
  const rotationScale = Math.max(1e-30, ...rotationDiagonal);
  const scales = free.map((dof) => Math.sqrt(dof % 6 < 3 ? translationScale : rotationScale));
  const A = raw.map((row, i) => row.map((value, j) => value / (scales[i] * scales[j])));
  const L = Array.from({ length: A.length }, () => new Array(A.length).fill(0));
  const pivots = new Array(A.length).fill(0);
  let minimumScaledPivot = Infinity;
  let maximumScaledPivot = 0;
  let criticalIndex = null;

  for (let i = 0; i < A.length; i += 1) {
    let pivot = A[i][i];
    for (let k = 0; k < i; k += 1) pivot -= L[i][k] ** 2 * pivots[k];
    pivots[i] = pivot;
    if (pivot < minimumScaledPivot) {
      minimumScaledPivot = pivot;
      criticalIndex = i;
    }
    maximumScaledPivot = Math.max(maximumScaledPivot, Math.abs(pivot));
    if (!Number.isFinite(pivot) || pivot <= tolerance) {
      return stabilityResult(false, {
        tolerance,
        free,
        pivots: pivots.slice(0, i + 1),
        minimumScaledPivot,
        maximumScaledPivot,
        criticalIndex,
        dimensionalScales: { translation: translationScale, rotation: rotationScale },
        reason: !Number.isFinite(pivot) ? 'NONFINITE_LDLT_PIVOT' : 'NONPOSITIVE_OR_NEAR_ZERO_LDLT_PIVOT',
      });
    }
    L[i][i] = 1;
    for (let j = i + 1; j < A.length; j += 1) {
      let value = A[j][i];
      for (let k = 0; k < i; k += 1) value -= L[j][k] * L[i][k] * pivots[k];
      L[j][i] = value / pivot;
    }
  }

  return stabilityResult(true, {
    tolerance,
    free,
    pivots,
    minimumScaledPivot,
    maximumScaledPivot,
    criticalIndex,
    dimensionalScales: { translation: translationScale, rotation: rotationScale },
    reason: 'POSITIVE_DEFINITE',
  });
}

export function bracketCriticalLoadScale(matrixAtScale, freeDofs = [], options = {}) {
  const referenceCompression = Math.max(0, Number(options.referenceCompression) || 0);
  const tolerance = positive(options.tolerance, 1e-9);
  if (!(referenceCompression > 0)) {
    return {
      version: PDELTA_STABILITY_VERSION,
      method: 'scaled-ldlt-bracket-bisection',
      status: 'not-applicable',
      reason: 'NO_REFERENCE_COMPRESSION',
      referenceCompression: 0,
      estimatedCriticalLoad: null,
      estimatedPcr: null,
      bracket: null,
    };
  }
  if (!(freeDofs || []).length) {
    return {
      version: PDELTA_STABILITY_VERSION,
      method: 'scaled-ldlt-bracket-bisection',
      status: 'not-available',
      reason: 'NO_FREE_STABILITY_DOFS',
      referenceCompression,
      estimatedCriticalLoad: null,
      estimatedPcr: null,
      bracket: null,
    };
  }

  const evaluate = (scale) => {
    const built = matrixAtScale(scale);
    if (!built || built.ok === false || !Array.isArray(built.Kt || built)) {
      return {
        stable: false,
        status: 'failed',
        reason: built?.reason || 'TANGENT_BUILD_FAILED',
        lowestStabilityIndicator: null,
      };
    }
    return evaluateConstrainedTangentStability(built.Kt || built, freeDofs, {
      tolerance,
      referenceMatrix: options.referenceMatrix,
    });
  };

  const zero = evaluate(0);
  if (!zero.stable) {
    return {
      version: PDELTA_STABILITY_VERSION,
      method: 'scaled-ldlt-bracket-bisection',
      status: 'failed',
      reason: 'ELASTIC_TANGENT_NOT_POSITIVE_DEFINITE',
      referenceCompression,
      estimatedCriticalLoad: null,
      estimatedPcr: null,
      bracket: null,
      zero,
    };
  }

  const maximumScale = positive(options.maximumScale, 1e6);
  let stableScale = 0;
  let stableEvaluation = zero;
  let unstableScale = positive(options.initialScale, 1);
  let unstableEvaluation = evaluate(unstableScale);
  while (unstableEvaluation.stable && unstableScale < maximumScale) {
    stableScale = unstableScale;
    stableEvaluation = unstableEvaluation;
    unstableScale = Math.min(maximumScale, unstableScale * 2);
    unstableEvaluation = evaluate(unstableScale);
  }
  if (unstableEvaluation.stable) {
    return {
      version: PDELTA_STABILITY_VERSION,
      method: 'scaled-ldlt-bracket-bisection',
      status: 'not-bracketed',
      reason: 'INSTABILITY_NOT_FOUND_WITHIN_SCALE_LIMIT',
      referenceCompression,
      estimatedCriticalLoad: null,
      estimatedPcr: null,
      bracket: {
        stableFactor: stableScale,
        unstableFactor: null,
        stableLoad: stableScale * referenceCompression,
        unstableLoad: null,
      },
      stableEvaluation,
    };
  }

  const relativeTolerance = positive(options.relativeTolerance, 1e-6);
  const maximumIterations = Math.max(1, Math.trunc(positive(options.maximumIterations, 36)));
  let iterations = 0;
  while (iterations < maximumIterations) {
    const width = unstableScale - stableScale;
    if (width <= relativeTolerance * Math.max(1, unstableScale)) break;
    const trialScale = 0.5 * (stableScale + unstableScale);
    const trial = evaluate(trialScale);
    if (trial.stable) {
      stableScale = trialScale;
      stableEvaluation = trial;
    } else {
      unstableScale = trialScale;
      unstableEvaluation = trial;
    }
    iterations += 1;
  }
  const criticalFactor = 0.5 * (stableScale + unstableScale);
  const estimatedCriticalLoad = criticalFactor * referenceCompression;
  return {
    version: PDELTA_STABILITY_VERSION,
    method: 'scaled-ldlt-bracket-bisection',
    status: 'bracketed',
    reason: 'STABILITY_LOSS_BRACKETED',
    referenceCompression,
    criticalLoadFactor: criticalFactor,
    estimatedCriticalLoad,
    estimatedPcr: estimatedCriticalLoad,
    bracket: {
      stableFactor: stableScale,
      unstableFactor: unstableScale,
      stableLoad: stableScale * referenceCompression,
      unstableLoad: unstableScale * referenceCompression,
      relativeWidth: (unstableScale - stableScale) / Math.max(1, criticalFactor),
    },
    stableEvaluation,
    unstableEvaluation,
    iterations,
    tolerance,
  };
}

function stabilityResult(stable, details) {
  const pivotRatio = details.maximumScaledPivot > 0
    ? details.minimumScaledPivot / details.maximumScaledPivot
    : details.minimumScaledPivot;
  return {
    version: PDELTA_STABILITY_VERSION,
    method: 'dimension-block-congruence-scaled-ldlt',
    status: stable ? 'stable' : 'unstable',
    stable,
    reason: details.reason,
    tolerance: details.tolerance,
    freeDofCount: details.free.length,
    criticalFreeIndex: details.criticalIndex,
    criticalDof: details.criticalIndex == null ? null : details.free[details.criticalIndex],
    minimumScaledPivot: Number.isFinite(details.minimumScaledPivot) ? details.minimumScaledPivot : null,
    maximumScaledPivot: Number.isFinite(details.maximumScaledPivot) ? details.maximumScaledPivot : null,
    lowestStabilityIndicator: Number.isFinite(pivotRatio) ? pivotRatio : null,
    scaledPivots: details.pivots,
    dimensionalScales: details.dimensionalScales || null,
  };
}

function constrainedSymmetricMatrix(K, free) {
  return free.map((i) => free.map((j) => (
    0.5 * ((Number(K[i]?.[j]) || 0) + (Number(K[j]?.[i]) || 0))
  )));
}

function positive(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return number;
  }
  return 1;
}
