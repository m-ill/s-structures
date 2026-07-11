import { resolveCriterion } from '../../core/analysisCriteria.js';
import { cscMatVec, cscToDense, denseToCsc, sparseStats } from './cscMatrix.js';
import { factorLdlt, solveLdlt } from './ldlt.js';
import { symbolicFactor } from './symbolicFactor.js';
import { buildSolverWarningDiagnostics, matrixSymmetryError } from './diagnostics.js';

export const SPARSE_SOLVE_VERSION = 'p7-m10-sparse-solve-v3';

export function solveSparseLinear(A, b, options = {}) {
  const startedAt = now();
  const matrix = options.preparedMatrix || normalizeMatrix(A, options.dropTolerance);
  if (!matrix) return invalidSolveResult('INVALID_MATRIX', startedAt);
  if (!validRhs(b, matrix.colCount)) return invalidSolveResult('INVALID_RHS', startedAt, matrix);

  const criteriaModel = criteriaFrom(options);
  const directLimit = Math.max(1, Number(options.directLimit ?? 256));
  if (options.method === 'cg' || matrix.colCount > directLimit) {
    return solveSparseCg(matrix, b, {
      ...options,
      criteriaModel,
      inputStorage: isCsc(A) ? 'csc' : 'dense',
      rhsCount: 1,
      rhsIndex: 0,
      startedAt,
    });
  }

  const prepared = createSparseFactorization(A, {
    ...options,
    criteriaModel,
    preparedMatrix: matrix,
  });
  return solvePreparedFactorization(prepared, b, {
    ...options,
    criteriaModel,
    rhsCount: 1,
    rhsIndex: 0,
    startedAt,
  });
}

export function createSparseFactorization(A, options = {}) {
  const startedAt = now();
  const criteriaModel = criteriaFrom(options);
  const pivotTolerance = positiveNumber(
    options.pivotTolerance,
    resolveCriterion(criteriaModel, 'solver.pivotSingular'),
    1e-12,
  );
  const inputStorage = isCsc(A) ? 'csc' : 'dense';
  const matrix = options.preparedMatrix || normalizeMatrix(A, options.dropTolerance);
  if (!matrix) {
    return preparedFailure('INVALID_MATRIX', {
      startedAt,
      inputStorage,
      matrix: null,
      factorizationAttemptCount: 0,
    });
  }

  const symbolicStartedAt = now();
  const symbolic = symbolicFactor(matrix, { ordering: options.ordering || 'approximate-minimum-degree' });
  const symbolicMs = elapsed(symbolicStartedAt);
  const factor = factorLdlt(matrix, {
    permutation: symbolic.permutation,
    pivotTolerance,
    factorDropTolerance: options.factorDropTolerance,
  });

  if (factor.ok) {
    return {
      ok: true,
      version: SPARSE_SOLVE_VERSION,
      method: 'sparse-ldlt',
      matrix,
      inputStorage,
      matrixStorage: 'csc',
      factorStorage: factor.factorStorage,
      symbolic,
      symbolicMs,
      factor,
      fallbackFactor: null,
      fallback: false,
      fallbackAttempted: false,
      fallbackSucceeded: false,
      sparseFailure: null,
      failure: null,
      denseConversionCount: 0,
      denseFallbackAllocated: false,
      factorizationCount: 1,
      factorizationAttemptCount: 1,
      sparseFactorizationCount: 1,
      fallbackFactorizationCount: 0,
      factorizationMs: elapsed(startedAt),
    };
  }

  const sparseFailure = factorFailureDetail(factor);
  if (options.allowDenseFallback === false) {
    return preparedFailure(factor.reason || 'SPARSE_FACTORIZATION_FAILED', {
      startedAt,
      inputStorage,
      matrix,
      symbolic,
      symbolicMs,
      factor,
      sparseFailure,
      factorizationAttemptCount: 1,
      sparseFactorizationCount: 1,
      fallbackFactorizationCount: 0,
    });
  }

  const dense = inputStorage === 'csc' ? cscToDense(matrix) : A;
  const fallbackFactor = factorDenseGaussian(dense, { pivotTolerance });
  if (!fallbackFactor.ok) {
    return preparedFailure(fallbackFactor.reason || factor.reason || 'FACTORIZATION_FAILED', {
      startedAt,
      inputStorage,
      matrix,
      symbolic,
      symbolicMs,
      factor,
      sparseFailure,
      fallbackFactor,
      fallbackAttempted: true,
      denseConversionCount: inputStorage === 'csc' ? 1 : 0,
      factorizationAttemptCount: 2,
      sparseFactorizationCount: 1,
      fallbackFactorizationCount: 1,
    });
  }

  return {
    ok: true,
    version: SPARSE_SOLVE_VERSION,
    method: 'dense-partial-pivot-fallback',
    matrix,
    inputStorage,
    matrixStorage: 'csc',
    factorStorage: 'dense-lu',
    symbolic,
    symbolicMs,
    factor,
    fallbackFactor,
    fallback: true,
    fallbackAttempted: true,
    fallbackSucceeded: true,
    sparseFailure,
    failure: null,
    denseConversionCount: inputStorage === 'csc' ? 1 : 0,
    denseFallbackAllocated: true,
    factorizationCount: 1,
    factorizationAttemptCount: 2,
    sparseFactorizationCount: 1,
    fallbackFactorizationCount: 1,
    factorizationMs: elapsed(startedAt),
  };
}

export function solvePreparedFactorization(prepared, rhs, options = {}) {
  const startedAt = options.startedAt || now();
  const solveStartedAt = now();
  let solved;
  if (!prepared?.ok) {
    solved = { ok: false, x: null, reason: prepared?.reason || 'FACTORIZATION_NOT_AVAILABLE', solveMs: 0 };
  } else if (!validRhs(rhs, prepared.matrix.colCount)) {
    solved = { ok: false, x: null, reason: 'INVALID_RHS', solveMs: elapsed(solveStartedAt) };
  } else if (prepared.method === 'sparse-ldlt') {
    solved = solveLdlt(prepared.factor, rhs);
  } else {
    solved = solveDenseGaussianFactor(prepared.fallbackFactor, rhs);
  }

  const pivotSource = prepared?.method === 'dense-partial-pivot-fallback'
    ? prepared.fallbackFactor
    : prepared?.factor || prepared?.fallbackFactor || {};
  const rhsCount = Math.max(1, Number(options.rhsCount || 1));
  const rhsIndex = Math.max(0, Number(options.rhsIndex || 0));
  const matrix = prepared?.matrix;
  if (!matrix) return invalidSolveResult(solved.reason, startedAt);

  const method = prepared.ok
    ? prepared.method
    : prepared.fallbackAttempted
      ? 'sparse-ldlt-failed'
      : 'sparse-ldlt-failed-no-fallback';
  const factorNonzeros = prepared.factor?.ok ? prepared.factor.nonzerosL : null;
  const inputFactorNonzeros = prepared.symbolic?.lowerTriangleNonzeros || null;
  const diagnostics = {
    ...sparseStats(matrix),
    version: SPARSE_SOLVE_VERSION,
    method,
    inputStorage: prepared.inputStorage,
    matrixStorage: 'csc',
    factorStorage: prepared.factorStorage || prepared.fallbackFactor?.factorStorage || prepared.factor?.factorStorage || null,
    storagePath: storagePath(prepared),
    sparseAttempted: true,
    fallback: !!prepared.fallbackAttempted,
    fallbackSucceeded: !!prepared.fallbackSucceeded,
    denseFallbackAllocated: !!prepared.denseFallbackAllocated,
    denseConversionCount: Number(prepared.denseConversionCount || 0),
    symbolic: prepared.symbolic || null,
    factorNonzeros,
    inputFactorNonzeros,
    fillInCount: factorNonzeros !== null && inputFactorNonzeros !== null
      ? Math.max(0, factorNonzeros - inputFactorNonzeros)
      : null,
    fillInRatio: factorNonzeros !== null && inputFactorNonzeros > 0
      ? factorNonzeros / inputFactorNonzeros
      : null,
    factorizationCount: Number(prepared.factorizationCount || 0),
    factorizationAttemptCount: Number(prepared.factorizationAttemptCount || 0),
    sparseFactorizationCount: Number(prepared.sparseFactorizationCount || 0),
    fallbackFactorizationCount: Number(prepared.fallbackFactorizationCount || 0),
    rhsCount,
    rhsIndex,
    solveCount: 1,
    factorReused: rhsCount > 1,
    symbolicMs: Number(prepared.symbolicMs || 0),
    factorizationMs: Number(prepared.factorizationMs || 0),
    solveMs: Number(solved.solveMs || 0),
    totalMs: elapsed(startedAt),
    pivotMin: finiteOr(pivotSource.pivotMin, Math.abs(Number(pivotSource.pivot) || 0)),
    pivotMax: finiteOr(pivotSource.pivotMax, Math.abs(Number(pivotSource.pivot) || 0)),
    pivotRatio: finiteOr(pivotSource.pivotRatio, 0),
    reason: prepared.sparseFailure?.reason || solved.reason || prepared.reason || null,
    sparseFailure: prepared.sparseFailure || null,
    failure: solved.ok ? null : prepared.failure || {
      stage: prepared.ok ? 'solve' : 'factorization',
      reason: solved.reason,
      sparse: prepared.sparseFailure || null,
      fallback: factorFailureDetail(prepared.fallbackFactor),
    },
  };
  diagnostics.diagnostics = buildSolverWarningDiagnostics(
    matrix,
    solved.x,
    rhs,
    diagnostics,
    options.criteriaModel || {},
    options.labels || [],
  );
  return {
    ok: !!solved.ok,
    x: solved.x,
    reason: solved.ok ? null : solved.reason,
    diagnostics,
  };
}

export function solveSparseMultiple(A, rhsList = [], options = {}) {
  if (!Array.isArray(rhsList) || rhsList.length === 0) {
    return attachMultipleDiagnostics([], {
      version: SPARSE_SOLVE_VERSION,
      method: null,
      rhsCount: 0,
      solveCount: 0,
      successfulSolveCount: 0,
      factorizationCount: 0,
      factorizationAttemptCount: 0,
      factorReused: false,
    });
  }

  const matrix = normalizeMatrix(A, options.dropTolerance);
  if (!matrix) {
    const results = rhsList.map(() => invalidSolveResult('INVALID_MATRIX', now()));
    return attachMultipleDiagnostics(results, multipleSummary(results, null));
  }

  const criteriaModel = criteriaFrom(options);
  const directLimit = Math.max(1, Number(options.directLimit ?? 256));
  if (options.method === 'cg' || matrix.colCount > directLimit) {
    const cgQualification = qualifyCgMatrix(matrix, options);
    const results = rhsList.map((rhs, rhsIndex) => solveSparseCg(matrix, rhs, {
      ...options,
      criteriaModel,
      cgQualification,
      inputStorage: isCsc(A) ? 'csc' : 'dense',
      rhsCount: rhsList.length,
      rhsIndex,
      startedAt: now(),
    }));
    return attachMultipleDiagnostics(results, multipleSummary(results, null));
  }

  const prepared = createSparseFactorization(A, {
    ...options,
    criteriaModel,
    preparedMatrix: matrix,
  });
  const results = rhsList.map((rhs, rhsIndex) => solvePreparedFactorization(prepared, rhs, {
    ...options,
    criteriaModel,
    rhsCount: rhsList.length,
    rhsIndex,
    startedAt: now(),
  }));
  return attachMultipleDiagnostics(results, multipleSummary(results, prepared));
}

export function factorDenseGaussian(A, options = {}) {
  const startedAt = now();
  if (!validDenseMatrix(A)) {
    return {
      ok: false,
      reason: 'INVALID_MATRIX',
      factorizationMs: elapsed(startedAt),
      factorStorage: 'dense-lu',
    };
  }
  const n = A.length;
  const LU = A.map((row) => row.map(Number));
  const permutation = Array.from({ length: n }, (_row, index) => index);
  const pivotTolerance = positiveNumber(options.pivotTolerance, 1e-12);
  let pivotMin = Infinity;
  let pivotMax = 0;

  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(LU[row][col]) > Math.abs(LU[pivot][col])) pivot = row;
    }
    const pivotAbs = Math.abs(LU[pivot][col]);
    pivotMax = Math.max(pivotMax, pivotAbs);
    pivotMin = Math.min(pivotMin, pivotAbs);
    if (!Number.isFinite(pivotAbs) || pivotAbs <= Math.max(pivotTolerance, pivotMax * pivotTolerance)) {
      return {
        ok: false,
        reason: 'SINGULAR_PIVOT',
        pivotIndex: col,
        pivotOriginalIndex: permutation[pivot],
        pivot: LU[pivot][col],
        pivotMin: pivotMin === Infinity ? 0 : pivotMin,
        pivotMax,
        pivotRatio: pivotMax > 0 && pivotMin !== Infinity ? pivotMin / pivotMax : 0,
        factorizationMs: elapsed(startedAt),
        factorStorage: 'dense-lu',
      };
    }
    if (pivot !== col) {
      [LU[col], LU[pivot]] = [LU[pivot], LU[col]];
      [permutation[col], permutation[pivot]] = [permutation[pivot], permutation[col]];
    }
    for (let row = col + 1; row < n; row += 1) {
      LU[row][col] /= LU[col][col];
      const multiplier = LU[row][col];
      if (!multiplier) continue;
      for (let k = col + 1; k < n; k += 1) LU[row][k] -= multiplier * LU[col][k];
    }
  }
  return {
    ok: true,
    method: 'dense-partial-pivot',
    LU,
    permutation,
    pivotMin: pivotMin === Infinity ? 0 : pivotMin,
    pivotMax,
    pivotRatio: pivotMax > 0 && pivotMin !== Infinity ? pivotMin / pivotMax : 0,
    factorizationMs: elapsed(startedAt),
    factorStorage: 'dense-lu',
  };
}

export function solveDenseGaussianFactor(factor, b) {
  const startedAt = now();
  const n = factor?.LU?.length || 0;
  if (!factor?.ok) return { ok: false, x: null, reason: factor?.reason || 'FACTORIZATION_NOT_AVAILABLE', solveMs: elapsed(startedAt) };
  if (!validRhs(b, n)) return { ok: false, x: null, reason: 'INVALID_RHS', solveMs: elapsed(startedAt) };
  const permuted = factor.permutation.map((index) => Number(b[index]));
  const y = new Array(n).fill(0);
  for (let i = 0; i < n; i += 1) {
    let sum = permuted[i];
    for (let j = 0; j < i; j += 1) sum -= factor.LU[i][j] * y[j];
    y[i] = sum;
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i -= 1) {
    let sum = y[i];
    for (let j = i + 1; j < n; j += 1) sum -= factor.LU[i][j] * x[j];
    x[i] = sum / factor.LU[i][i];
  }
  if (x.some((value) => !Number.isFinite(value))) {
    return { ok: false, x: null, reason: 'NONFINITE_SOLUTION', solveMs: elapsed(startedAt) };
  }
  return { ok: true, x, solveMs: elapsed(startedAt) };
}

export function solveDenseGaussian(A, b, options = {}) {
  const startedAt = now();
  const dense = isCsc(A) ? cscToDense(A) : A;
  const factor = factorDenseGaussian(dense, options);
  if (!factor.ok) {
    return {
      ...factor,
      x: null,
      solveMs: factor.factorizationMs,
      triangularSolveMs: 0,
      totalMs: elapsed(startedAt),
    };
  }
  const solved = solveDenseGaussianFactor(factor, b);
  return {
    ...solved,
    method: 'dense-partial-pivot',
    pivotMin: factor.pivotMin,
    pivotMax: factor.pivotMax,
    pivotRatio: factor.pivotRatio,
    factorizationMs: factor.factorizationMs,
    triangularSolveMs: solved.solveMs,
    solveMs: factor.factorizationMs + solved.solveMs,
    totalMs: elapsed(startedAt),
  };
}

export function solveSparseCg(matrix, b, options = {}) {
  const startedAt = options.startedAt || now();
  const solveStartedAt = now();
  if (!validRhs(b, matrix.colCount)) return invalidSolveResult('INVALID_RHS', startedAt, matrix);
  const qualification = options.cgQualification || qualifyCgMatrix(matrix, options);
  if (!qualification.ok) return cgQualificationFailure(matrix, b, qualification, options, startedAt);
  const criteriaModel = options.criteriaModel || {};
  const tolerance = positiveNumber(options.tolerance, resolveCriterion(criteriaModel, 'solver.resWarn'), 1e-6);
  const maxIterations = Math.max(1, Number(options.maxIterations || matrix.colCount * 5));
  const x = new Array(matrix.colCount).fill(0);
  let r = b.map(Number);
  const diagonal = cscDiagonal(matrix);
  let z = r.map((value, i) => value / Math.max(diagonal[i] || 0, 1e-12));
  let p = z.slice();
  let rz = dot(r, z);
  const loadNorm = Math.max(1, normInf(b));
  let residual = normInf(r) / loadNorm;
  let iterations = 0;
  let breakdown = null;
  while (iterations < maxIterations && residual > tolerance) {
    const Ap = cscMatVec(matrix, p);
    const denom = dot(p, Ap);
    const curvatureScale = p.reduce((sum, value, index) => sum + Math.abs(value * Ap[index]), 0);
    if (!Number.isFinite(denom) || !(denom > qualification.curvatureTolerance * Math.max(curvatureScale, Number.EPSILON))) {
      breakdown = 'CG_NON_POSITIVE_CURVATURE';
      break;
    }
    const alpha = rz / denom;
    for (let i = 0; i < x.length; i += 1) {
      x[i] += alpha * p[i];
      r[i] -= alpha * Ap[i];
    }
    iterations += 1;
    residual = normInf(r) / loadNorm;
    if (residual <= tolerance) break;
    z = r.map((value, i) => value / Math.max(diagonal[i] || 0, 1e-12));
    const nextRz = dot(r, z);
    const beta = rz ? nextRz / rz : 0;
    for (let i = 0; i < p.length; i += 1) p[i] = z[i] + beta * p[i];
    rz = nextRz;
  }
  const ok = residual <= tolerance && !breakdown;
  const stats = sparseStats(matrix);
  const conditionEstimate = estimateDiagonalCondition(diagonal);
  const positiveDiagonal = diagonal.map((value) => Math.abs(value)).filter((value) => value > 0);
  const reason = ok ? null : breakdown || 'CG_NOT_CONVERGED';
  const warningDiagnostics = {
    version: 'p7-m10-sparse-cg-diagnostics-v2',
    matrixStorage: 'csc',
    denseConversionCount: 0,
    symmetryError: null,
    residualMax: normInf(r),
    residualNorm: residual,
    loadNorm,
    conditionEstimate,
    pivotRatio: 1 / Math.max(1, conditionEstimate),
    suspectedMechanismDofs: suspectedFromDiagonal(diagonal, options.labels || []),
    warnings: residual > tolerance ? [{
      code: 'SOLVER_RESIDUAL_WARN',
      message: `solver.residualNorm ${residual.toExponential(3)} exceeds warning limit ${tolerance.toExponential(3)}.`,
      target: 'solver.residualNorm',
      value: residual,
      limit: tolerance,
    }] : [],
  };
  const diagnostics = {
    ...stats,
    version: SPARSE_SOLVE_VERSION,
    method: 'sparse-cg',
    inputStorage: options.inputStorage || 'csc',
    matrixStorage: 'csc',
    factorStorage: null,
    storagePath: [options.inputStorage === 'dense' ? 'dense-input' : 'csc-input', 'csc-iterative'],
    sparseAttempted: true,
    fallback: false,
    fallbackSucceeded: false,
    denseFallbackAllocated: false,
    denseConversionCount: 0,
    factorizationCount: 0,
    factorizationAttemptCount: 0,
    sparseFactorizationCount: 0,
    fallbackFactorizationCount: 0,
    rhsCount: Math.max(1, Number(options.rhsCount || 1)),
    rhsIndex: Math.max(0, Number(options.rhsIndex || 0)),
    solveCount: 1,
    factorReused: false,
    factorizationMs: 0,
    solveMs: elapsed(solveStartedAt),
    totalMs: elapsed(startedAt),
    pivotMin: positiveDiagonal.length ? Math.min(...positiveDiagonal) : 0,
    pivotMax: positiveDiagonal.length ? Math.max(...positiveDiagonal) : 0,
    pivotRatio: 1 / Math.max(1, conditionEstimate),
    iterations,
    reason,
    qualification,
    failure: ok ? null : {
      stage: 'iterative-solve',
      reason,
      iterations,
      residualNorm: residual,
      instability: reason === 'CG_NON_POSITIVE_CURVATURE',
    },
    diagnostics: warningDiagnostics,
  };
  return { ok, x, diagnostics, reason };
}

export function qualifyCgMatrix(matrix, options = {}) {
  const symmetryError = matrixSymmetryError(matrix);
  const symmetryTolerance = positiveNumber(options.cgSymmetryTolerance, 1e-10);
  const curvatureTolerance = positiveNumber(options.cgCurvatureTolerance, 1e-12);
  const diagonal = cscDiagonal(matrix);
  const diagonalAbs = diagonal.map(Math.abs);
  const diagonalMax = diagonalAbs.reduce((max, value) => Math.max(max, value), 0);
  const diagonalMin = diagonalAbs.length
    ? diagonalAbs.reduce((min, value) => Math.min(min, value), Infinity)
    : 0;
  const diagonalRatio = diagonalMax > 0 ? diagonalMin / diagonalMax : 0;
  const minDiagonalRatio = positiveNumber(options.cgMinDiagonalRatio, 1e-14);
  if (!Number.isFinite(symmetryError) || symmetryError > symmetryTolerance) {
    return cgQualificationBlocked('CG_MATRIX_NOT_SYMMETRIC', {
      symmetryError,
      symmetryTolerance,
      curvatureTolerance,
      diagonalMin,
      diagonalMax,
      diagonalRatio,
    });
  }
  const nonpositiveDiagonal = diagonal.findIndex((value) => !Number.isFinite(value) || !(value > 0));
  if (nonpositiveDiagonal >= 0 || !(diagonalMax > 0) || diagonalRatio <= minDiagonalRatio) {
    return cgQualificationBlocked(
      nonpositiveDiagonal >= 0 ? 'CG_MATRIX_NON_POSITIVE_DIAGONAL' : 'CG_MATRIX_NEAR_SINGULAR_DIAGONAL',
      {
        symmetryError,
        symmetryTolerance,
        curvatureTolerance,
        diagonalMin,
        diagonalMax,
        diagonalRatio,
        minDiagonalRatio,
        dof: nonpositiveDiagonal >= 0 ? nonpositiveDiagonal : diagonalAbs.indexOf(diagonalMin),
      },
    );
  }

  return certifyCgSpdByComponents(matrix, options, {
    symmetryError,
    symmetryTolerance,
    curvatureTolerance,
    diagonalMin,
    diagonalMax,
    diagonalRatio,
  });
}

function certifyCgSpdByComponents(matrix, options, baseDetail) {
  const components = symmetricSparsityComponents(matrix);
  const componentLimit = Math.max(1, Math.trunc(positiveNumber(
    options.cgSpdCertificationMaxComponentDofs,
    10000,
  )));
  const pivotTolerance = positiveNumber(options.pivotTolerance, 1e-12);
  const ordering = options.ordering || 'approximate-minimum-degree';
  let factorizedComponentCount = 0;
  let minimumPivotRatio = Infinity;
  let largestComponentDofs = 0;

  for (let componentIndex = 0; componentIndex < components.length; componentIndex += 1) {
    const component = components[componentIndex];
    largestComponentDofs = Math.max(largestComponentDofs, component.length);
    if (component.length === 1) continue;
    if (component.length > componentLimit) {
      return cgQualificationBlocked('CG_SPD_CERTIFICATION_RESOURCE_LIMIT', {
        ...baseDetail,
        method: 'componentwise-sparse-ldlt-positive-pivot-certification',
        componentIndex,
        componentDofs: component.length,
        componentLimit,
      });
    }

    try {
      const block = principalCscBlock(matrix, component);
      const symbolic = symbolicFactor(block, { ordering });
      const factor = factorLdlt(block, {
        permutation: symbolic.permutation,
        pivotTolerance,
      });
      factorizedComponentCount += 1;
      const pivotScale = factor.ok
        ? factor.D.reduce((max, value) => Math.max(max, Math.abs(value)), Number.EPSILON)
        : 0;
      const nonpositivePivot = factor.ok
        ? factor.D.findIndex((value) => !Number.isFinite(value)
          || !(value > baseDetail.curvatureTolerance * pivotScale))
        : factor.pivotIndex;
      if (!factor.ok || nonpositivePivot >= 0) {
        const localDof = factor.ok ? factor.permutation[nonpositivePivot] : factor.pivotOriginalIndex;
        return cgQualificationBlocked('CG_MATRIX_NOT_POSITIVE_DEFINITE', {
          ...baseDetail,
          dof: Number.isInteger(localDof) ? component[localDof] : null,
          componentIndex,
          componentDofs: component.length,
          factorReason: factor.reason || null,
          factorPivot: factor.ok ? factor.D[nonpositivePivot] : factor.pivot,
          method: 'sparse-ldlt-positive-pivot-certification',
        });
      }
      minimumPivotRatio = Math.min(minimumPivotRatio, factor.pivotRatio);
    } catch (error) {
      return cgQualificationBlocked('CG_SPD_CERTIFICATION_FAILED', {
        ...baseDetail,
        method: 'componentwise-sparse-ldlt-positive-pivot-certification',
        componentIndex,
        componentDofs: component.length,
        errorName: error?.name || 'Error',
      });
    }
  }

  return {
    ok: true,
    status: 'qualified',
    method: 'componentwise-sparse-ldlt-positive-pivot-certification',
    certification: 'exact-all-components-positive-pivots',
    ...baseDetail,
    probeCount: 0,
    componentCount: components.length,
    factorizedComponentCount,
    largestComponentDofs,
    componentLimit,
    minimumPivotRatio: minimumPivotRatio === Infinity ? 1 : minimumPivotRatio,
  };
}

function symmetricSparsityComponents(matrix) {
  const adjacency = Array.from({ length: matrix.colCount }, () => []);
  for (let col = 0; col < matrix.colCount; col += 1) {
    for (let pointer = matrix.colPtr[col]; pointer < matrix.colPtr[col + 1]; pointer += 1) {
      const row = matrix.rowIdx[pointer];
      if (row === col || !matrix.values[pointer]) continue;
      adjacency[col].push(row);
      adjacency[row].push(col);
    }
  }

  const visited = new Uint8Array(matrix.colCount);
  const components = [];
  for (let start = 0; start < matrix.colCount; start += 1) {
    if (visited[start]) continue;
    visited[start] = 1;
    const stack = [start];
    const component = [];
    while (stack.length) {
      const current = stack.pop();
      component.push(current);
      for (const neighbor of adjacency[current]) {
        if (visited[neighbor]) continue;
        visited[neighbor] = 1;
        stack.push(neighbor);
      }
    }
    component.sort((a, b) => a - b);
    components.push(component);
  }
  return components;
}

function principalCscBlock(matrix, component) {
  const localOf = new Map(component.map((globalDof, localDof) => [globalDof, localDof]));
  const colPtr = [0];
  const rowIdx = [];
  const values = [];
  for (const globalCol of component) {
    const entries = [];
    for (let pointer = matrix.colPtr[globalCol]; pointer < matrix.colPtr[globalCol + 1]; pointer += 1) {
      const localRow = localOf.get(matrix.rowIdx[pointer]);
      if (localRow === undefined) continue;
      entries.push({ row: localRow, value: Number(matrix.values[pointer]) });
    }
    entries.sort((a, b) => a.row - b.row);
    for (const entry of entries) {
      rowIdx.push(entry.row);
      values.push(entry.value);
    }
    colPtr.push(rowIdx.length);
  }
  return {
    format: 'csc',
    rowCount: component.length,
    colCount: component.length,
    colPtr,
    rowIdx,
    values,
    nnz: values.length,
  };
}

function cgQualificationBlocked(reason, detail = {}) {
  return {
    ok: false,
    status: 'blocked',
    reason,
    certification: 'rejected-before-iteration',
    ...detail,
  };
}

function cgQualificationFailure(matrix, b, qualification, options, startedAt) {
  const stats = sparseStats(matrix);
  const diagonal = cscDiagonal(matrix);
  const positiveDiagonal = diagonal.filter((value) => Number.isFinite(value) && value > 0);
  const conditionEstimate = estimateDiagonalCondition(diagonal);
  const reason = qualification.reason || 'CG_MATRIX_NOT_QUALIFIED';
  const loadNorm = Math.max(1, normInf(b));
  const warning = {
    code: reason,
    message: `CG solve blocked during symmetry/SPD qualification: ${reason}.`,
    target: 'solver.cgQualification',
  };
  return {
    ok: false,
    x: null,
    reason,
    diagnostics: {
      ...stats,
      version: SPARSE_SOLVE_VERSION,
      method: 'sparse-cg',
      inputStorage: options.inputStorage || 'csc',
      matrixStorage: 'csc',
      factorStorage: null,
      storagePath: [options.inputStorage === 'dense' ? 'dense-input' : 'csc-input', 'csc-iterative-qualification'],
      sparseAttempted: true,
      fallback: false,
      fallbackSucceeded: false,
      denseFallbackAllocated: false,
      denseConversionCount: 0,
      factorizationCount: 0,
      factorizationAttemptCount: 0,
      sparseFactorizationCount: 0,
      fallbackFactorizationCount: 0,
      rhsCount: Math.max(1, Number(options.rhsCount || 1)),
      rhsIndex: Math.max(0, Number(options.rhsIndex || 0)),
      solveCount: 0,
      factorReused: false,
      factorizationMs: 0,
      solveMs: 0,
      totalMs: elapsed(startedAt),
      pivotMin: positiveDiagonal.length ? Math.min(...positiveDiagonal) : 0,
      pivotMax: positiveDiagonal.length ? Math.max(...positiveDiagonal) : 0,
      pivotRatio: 1 / Math.max(1, conditionEstimate),
      iterations: 0,
      reason,
      qualification,
      failure: {
        stage: 'cg-qualification',
        reason,
        iterations: 0,
        residualNorm: 1,
        instability: true,
      },
      diagnostics: {
        version: 'p7-m10-sparse-cg-diagnostics-v2',
        matrixStorage: 'csc',
        denseConversionCount: 0,
        symmetryError: qualification.symmetryError ?? null,
        residualMax: normInf(b),
        residualNorm: 1,
        loadNorm,
        conditionEstimate,
        pivotRatio: 1 / Math.max(1, conditionEstimate),
        suspectedMechanismDofs: suspectedFromDiagonal(diagonal, options.labels || []),
        warnings: [warning],
      },
    },
  };
}

function preparedFailure(reason, detail) {
  const fallbackAttempted = !!detail.fallbackAttempted;
  const failure = {
    stage: fallbackAttempted ? 'fallback-factorization' : 'sparse-factorization',
    reason,
    sparse: detail.sparseFailure || factorFailureDetail(detail.factor),
    fallback: factorFailureDetail(detail.fallbackFactor),
  };
  return {
    ok: false,
    version: SPARSE_SOLVE_VERSION,
    method: fallbackAttempted ? 'sparse-ldlt-failed' : 'sparse-ldlt-failed-no-fallback',
    reason,
    matrix: detail.matrix,
    inputStorage: detail.inputStorage,
    matrixStorage: detail.matrix ? 'csc' : null,
    factorStorage: detail.fallbackFactor?.factorStorage || detail.factor?.factorStorage || null,
    symbolic: detail.symbolic || null,
    symbolicMs: Number(detail.symbolicMs || 0),
    factor: detail.factor || null,
    fallbackFactor: detail.fallbackFactor || null,
    fallback: fallbackAttempted,
    fallbackAttempted,
    fallbackSucceeded: false,
    sparseFailure: detail.sparseFailure || factorFailureDetail(detail.factor),
    failure,
    denseConversionCount: Number(detail.denseConversionCount || 0),
    denseFallbackAllocated: fallbackAttempted,
    factorizationCount: 0,
    factorizationAttemptCount: Number(detail.factorizationAttemptCount || 0),
    sparseFactorizationCount: Number(detail.sparseFactorizationCount || 0),
    fallbackFactorizationCount: Number(detail.fallbackFactorizationCount || 0),
    factorizationMs: elapsed(detail.startedAt),
  };
}

function factorFailureDetail(factor) {
  if (!factor || factor.ok) return null;
  return {
    reason: factor.reason || 'FACTORIZATION_FAILED',
    pivotIndex: factor.pivotIndex ?? null,
    pivotOriginalIndex: factor.pivotOriginalIndex ?? null,
    pivot: factor.pivot ?? null,
    pivotMin: factor.pivotMin ?? null,
    pivotMax: factor.pivotMax ?? null,
    pivotRatio: factor.pivotRatio ?? null,
  };
}

function storagePath(prepared) {
  const path = [prepared.inputStorage === 'dense' ? 'dense-input' : 'csc-input'];
  if (prepared.inputStorage === 'dense') path.push('csc-working-copy');
  else path.push('csc-symbolic');
  if (prepared.fallbackAttempted) path.push('dense-lu-fallback');
  else if (prepared.factorStorage) path.push(prepared.factorStorage);
  return path;
}

function multipleSummary(results, prepared) {
  const first = results[0]?.diagnostics || {};
  const factorizationMs = Number(prepared?.factorizationMs || 0);
  const solveMs = results.reduce((sum, result) => sum + Number(result.diagnostics?.solveMs || 0), 0);
  return {
    version: SPARSE_SOLVE_VERSION,
    method: prepared?.method || first.method || null,
    rhsCount: results.length,
    solveCount: results.length,
    successfulSolveCount: results.filter((result) => result.ok).length,
    factorizationCount: Number(prepared?.factorizationCount ?? first.factorizationCount ?? 0),
    factorizationAttemptCount: Number(prepared?.factorizationAttemptCount ?? first.factorizationAttemptCount ?? 0),
    sparseFactorizationCount: Number(prepared?.sparseFactorizationCount ?? first.sparseFactorizationCount ?? 0),
    fallbackFactorizationCount: Number(prepared?.fallbackFactorizationCount ?? first.fallbackFactorizationCount ?? 0),
    factorReused: !!prepared && results.length > 1,
    fallback: !!prepared?.fallbackAttempted,
    fallbackSucceeded: !!prepared?.fallbackSucceeded,
    denseConversionCount: Number(prepared?.denseConversionCount ?? first.denseConversionCount ?? 0),
    failureCount: results.filter((result) => !result.ok).length,
    factorizationMs,
    solveMs,
    totalMs: factorizationMs + solveMs,
  };
}

function attachMultipleDiagnostics(results, diagnostics) {
  results.diagnostics = diagnostics;
  results.rhsCount = diagnostics.rhsCount;
  results.solveCount = diagnostics.solveCount;
  results.factorizationCount = diagnostics.factorizationCount;
  results.factorizationAttemptCount = diagnostics.factorizationAttemptCount;
  return results;
}

function invalidSolveResult(reason, startedAt, matrix = null) {
  const diagnostics = {
    ...(matrix ? sparseStats(matrix) : { format: null, rowCount: 0, colCount: 0, nnz: 0, density: 0 }),
    version: SPARSE_SOLVE_VERSION,
    method: 'not-run',
    sparseAttempted: false,
    fallback: false,
    factorizationCount: 0,
    factorizationAttemptCount: 0,
    rhsCount: 1,
    solveCount: 0,
    totalMs: elapsed(startedAt),
    reason,
    failure: { stage: 'input-validation', reason },
    diagnostics: null,
  };
  return { ok: false, x: null, reason, diagnostics };
}

function normalizeMatrix(A, dropTolerance = 0) {
  if (isCsc(A)) {
    if (!validCscMatrix(A)) return null;
    return Number.isFinite(Number(A.nnz)) ? A : { ...A, nnz: A.values.length };
  }
  if (!validDenseMatrix(A)) return null;
  return denseToCsc(A, nonnegativeNumber(dropTolerance, 0));
}

function validDenseMatrix(A) {
  return Array.isArray(A)
    && A.every((row) => Array.isArray(row) && row.length === A.length && row.every((value) => Number.isFinite(Number(value))));
}

function validCscMatrix(matrix) {
  if (matrix.rowCount !== matrix.colCount || matrix.colPtr.length !== matrix.colCount + 1) return false;
  if (matrix.rowIdx.length !== matrix.values.length || matrix.colPtr[0] !== 0) return false;
  if (matrix.colPtr[matrix.colPtr.length - 1] !== matrix.values.length) return false;
  return matrix.colPtr.every((value, index) => Number.isInteger(value) && value >= 0 && (index === 0 || value >= matrix.colPtr[index - 1]))
    && matrix.rowIdx.every((value) => Number.isInteger(value) && value >= 0 && value < matrix.rowCount)
    && matrix.values.every((value) => Number.isFinite(Number(value)));
}

function validRhs(rhs, n) {
  return Array.isArray(rhs) && rhs.length === n && rhs.every((value) => Number.isFinite(Number(value)));
}

function isCsc(value) {
  return value?.format === 'csc'
    && Array.isArray(value.colPtr)
    && Array.isArray(value.rowIdx)
    && Array.isArray(value.values);
}

function cscDiagonal(matrix) {
  const diagonal = new Array(matrix.colCount).fill(0);
  for (let col = 0; col < matrix.colCount; col += 1) {
    for (let p = matrix.colPtr[col]; p < matrix.colPtr[col + 1]; p += 1) {
      if (matrix.rowIdx[p] === col) diagonal[col] += matrix.values[p];
    }
  }
  return diagonal;
}

function estimateDiagonalCondition(diagonal) {
  const values = diagonal.map((value) => Math.abs(value)).filter((value) => value > 0);
  if (!values.length) return Infinity;
  return Math.max(...values) / Math.max(Math.min(...values), Number.EPSILON);
}

function suspectedFromDiagonal(diagonal, labels) {
  const max = Math.max(0, ...diagonal.map((value) => Math.abs(value)));
  if (!(max > 0)) return diagonal.slice(0, 20).map((_value, index) => labels[index] || `dof:${index}`);
  return diagonal
    .map((value, index) => ({ index, ratio: Math.abs(value) / max }))
    .filter((item) => item.ratio < 1e-10)
    .slice(0, 20)
    .map((item) => labels[item.index] || `dof:${item.index}`);
}

function criteriaFrom(options) {
  return options.criteriaModel || options.model || options.analysisCriteria || {};
}

function dot(a, b) {
  return a.reduce((sum, value, index) => sum + value * (Number(b[index]) || 0), 0);
}

function normInf(values) {
  return values.reduce((max, value) => Math.max(max, Math.abs(Number(value) || 0)), 0);
}

function positiveNumber(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return number;
  }
  return 1;
}

function nonnegativeNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function finiteOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function now() {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}

function elapsed(startedAt) {
  return Math.max(0, now() - startedAt);
}
