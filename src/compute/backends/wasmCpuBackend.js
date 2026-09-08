import { WASM_SPARSE_DIAGNOSTICS_VERSION } from '../../metadata/numericVersions.js';
export { WASM_SPARSE_DIAGNOSTICS_VERSION };
import { stableHash } from '../../core/stableHash.js';
import { symbolicFactor } from '../sparse/symbolic.js';

export const WASM_SPARSE_BACKEND_ID = 'p8-wasm-sparse-v1';


const DEFAULT_PIVOT_TOLERANCE = 1e-12;
const DEFAULT_RELATIVE_TOLERANCE = 1e-10;
const MAX_U32 = 0xffff_ffff;
const MATRIX_CLASSES = Object.freeze(['spd', 'general', 'indefinite', 'symmetric-indefinite']);
const MATRIX_FORMATS = Object.freeze(['csr', 'csc']);
const DIAGNOSTIC_FIELDS = 14;
const SYMBOLIC_CACHE_LIMIT = 64;
const STATUS_REASON = Object.freeze({
  0: null,
  1: 'INVALID_DIMENSIONS',
  2: 'INVALID_CSR',
  3: 'NONFINITE_INPUT',
  4: 'SINGULAR_PIVOT',
  5: 'CG_NON_POSITIVE_CURVATURE',
  6: 'MAX_ITERATIONS',
  7: 'NONFINITE_SOLUTION',
  8: 'RESIDUAL_TOLERANCE_EXCEEDED',
  9: 'INVALID_OPTIONS',
});

export async function createWasmSparseBackend({ wasmBytes, wasmUrl } = {}) {
  const module = await loadModule({ wasmBytes, wasmUrl });
  const imports = WebAssembly.Module.imports(module);
  if (imports.length !== 0) {
    throw new Error(`Phase 8 solver WASM must be self-contained; found ${imports.length} import(s).`);
  }
  const instance = await WebAssembly.instantiate(module, {});
  const wasm = validateExports(instance.exports);
  const abiVersion = wasm.p8_solver_abi_version() >>> 0;
  const capabilities = wasm.p8_solver_capabilities() >>> 0;
  const diagnosticLength = wasm.p8_diagnostics_len() >>> 0;
  const p9AbiVersion = wasm.p9_solver_abi_version() >>> 0;
  const p9Capabilities = wasm.p9_solver_capabilities() >>> 0;
  if (abiVersion !== 1) throw new Error(`Unsupported Phase 8 solver ABI version: ${abiVersion}.`);
  if (p9AbiVersion !== 2) throw new Error(`Unsupported Phase 9 solver ABI version: ${p9AbiVersion}.`);
  if ((capabilities & 0b111) !== 0b111) throw new Error('Phase 8 solver WASM lacks required sparse capabilities.');
  if ((p9Capabilities & 0b1_1111) !== 0b1_1111) throw new Error('Phase 9 solver WASM lacks required multi-RHS capabilities.');
  if (diagnosticLength < DIAGNOSTIC_FIELDS || diagnosticLength > 64) {
    throw new Error(`Invalid Phase 8 solver diagnostic length: ${diagnosticLength}.`);
  }

  const preflightResult = Object.freeze({
    ok: true,
    available: true,
    reason: null,
    backendId: WASM_SPARSE_BACKEND_ID,
    production: true,
    wasmAbiVersion: abiVersion,
    matrixClasses: MATRIX_CLASSES,
    matrixFormats: MATRIX_FORMATS,
    deterministic: true,
    denseFallback: false,
    memoryOwnership: 'explicit-wasm-allocation',
    ordering: 'symmetric-approximate-minimum-degree',
    symbolicCacheLimit: SYMBOLIC_CACHE_LIMIT,
  });
  const symbolicContext = createSymbolicContext();
  const memoryStats = createMemoryStats();

  return {
    id: WASM_SPARSE_BACKEND_ID,
    production: true,
    executionTarget: 'wasm-cpu',
    numericPrecision: 'f64',
    deterministic: true,
    matrixClasses: MATRIX_CLASSES,
    matrixFormats: MATRIX_FORMATS,
    preflight() {
      return preflightResult;
    },
    p9Preflight() {
      return Object.freeze({
        ...preflightResult,
        wasmAbiVersion: p9AbiVersion,
        multiRhs: true,
        persistentSymbolic: true,
        boundedCopies: true,
        simd: Object.freeze({ supported: false, enabled: false }),
        threads: Object.freeze({ supported: false, enabled: false }),
      });
    },
    solve(matrix, rhs, options = {}) {
      return solveWithWasm(wasm, diagnosticLength, matrix, rhs, options, symbolicContext, memoryStats);
    },
    solveMultiple(matrix, rhsList, options = {}) {
      return solveMultipleWithWasm(
        wasm,
        diagnosticLength,
        matrix,
        rhsList,
        options,
        symbolicContext,
        memoryStats,
      );
    },
    snapshot() {
      return memoryStats.snapshot();
    },
  };
}

async function loadModule({ wasmBytes, wasmUrl }) {
  if (wasmBytes instanceof WebAssembly.Module) return wasmBytes;
  let source = wasmBytes;
  if (source === undefined) {
    const url = wasmUrl === undefined
      ? new URL('../../nonlinear/equilibrium/backends/phase8_solver.wasm', import.meta.url)
      : resolveWasmUrl(wasmUrl);
    source = await readWasmUrl(url);
  }
  if (!(source instanceof ArrayBuffer) && !ArrayBuffer.isView(source)) {
    throw new TypeError('wasmBytes must be an ArrayBuffer, typed array, or WebAssembly.Module.');
  }
  return WebAssembly.compile(source);
}

function resolveWasmUrl(value) {
  if (value instanceof URL) return value;
  try {
    return new URL(String(value), import.meta.url);
  } catch {
    throw new TypeError('wasmUrl must be a valid URL or URL string.');
  }
}

async function readWasmUrl(url) {
  if (url.protocol === 'file:' && typeof process !== 'undefined' && process.versions?.node) {
    const { readFile } = await import('node:fs/promises');
    return readFile(url);
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Unable to load Phase 8 solver WASM: HTTP ${response.status}.`);
  return response.arrayBuffer();
}

function validateExports(exports) {
  const functions = [
    'p8_solver_abi_version',
    'p8_solver_capabilities',
    'p8_diagnostics_len',
    'p8_alloc',
    'p8_dealloc',
    'p8_solve_csr',
    'p9_solver_abi_version',
    'p9_solver_capabilities',
    'p9_solve_csr_multi',
  ];
  if (!(exports.memory instanceof WebAssembly.Memory)) {
    throw new Error('Phase 8 solver WASM does not export memory.');
  }
  for (const name of functions) {
    if (typeof exports[name] !== 'function') {
      throw new Error(`Phase 8 solver WASM does not export ${name}().`);
    }
  }
  return exports;
}

function solveWithWasm(wasm, diagnosticLength, matrix, rhs, options, symbolicContext, memoryStats) {
  let normalized;
  let normalizedRhs;
  let solveOptions;
  try {
    normalized = normalizeSparseMatrix(matrix);
    normalizedRhs = normalizeRhs(rhs, normalized.rowCount);
    solveOptions = normalizeSolveOptions(options, normalized.rowCount);
  } catch (error) {
    return inputFailure(error);
  }

  let symmetryError = null;
  if (solveOptions.matrixClass === 'spd') {
    symmetryError = csrSymmetryError(normalized);
    const symmetryTolerance = 1e-10;
    if (!Number.isFinite(symmetryError) || symmetryError > symmetryTolerance) {
      return failureResult('MATRIX_NOT_SYMMETRIC', {
        stage: 'qualification',
        matrixClass: solveOptions.matrixClass,
        inputStorage: normalized.inputStorage,
        rowCount: normalized.rowCount,
        colCount: normalized.colCount,
        nnz: normalized.values.length,
        symmetryError,
        symmetryTolerance,
        finite: Number.isFinite(symmetryError),
      });
    }
  }
  const symbolic = symbolicContext.resolve(normalized);
  const solverMatrix = permuteCsr(normalized, symbolic.permutation);
  const solverRhs = permuteVector(normalizedRhs, symbolic.permutation);

  const allocations = [];
  const allocate = (byteLength, alignment) => {
    const size = Math.max(1, byteLength);
    if (!Number.isSafeInteger(size) || size > MAX_U32) {
      throw new BackendError('WASM_INPUT_TOO_LARGE', `WASM allocation exceeds u32: ${size} bytes.`);
    }
    const pointer = wasm.p8_alloc(size, alignment) >>> 0;
    if (pointer === 0) throw new BackendError('WASM_ALLOCATION_FAILED', `Unable to allocate ${size} bytes.`);
    allocations.push({ pointer, size, alignment });
    memoryStats.allocate(size);
    return pointer;
  };

  let statusCode = null;
  let rawDiagnostics = null;
  let solution = null;
  try {
    const rowPointer = allocate(solverMatrix.rowPtr.byteLength, Uint32Array.BYTES_PER_ELEMENT);
    const columnIndex = allocate(solverMatrix.colIdx.byteLength, Uint32Array.BYTES_PER_ELEMENT);
    const values = allocate(solverMatrix.values.byteLength, Float64Array.BYTES_PER_ELEMENT);
    const rhsPointer = allocate(solverRhs.byteLength, Float64Array.BYTES_PER_ELEMENT);
    const solutionPointer = allocate(solverRhs.byteLength, Float64Array.BYTES_PER_ELEMENT);
    const diagnosticsPointer = allocate(
      diagnosticLength * Float64Array.BYTES_PER_ELEMENT,
      Float64Array.BYTES_PER_ELEMENT,
    );

    new Uint32Array(wasm.memory.buffer, rowPointer, solverMatrix.rowPtr.length).set(solverMatrix.rowPtr);
    new Uint32Array(wasm.memory.buffer, columnIndex, solverMatrix.colIdx.length).set(solverMatrix.colIdx);
    new Float64Array(wasm.memory.buffer, values, solverMatrix.values.length).set(solverMatrix.values);
    new Float64Array(wasm.memory.buffer, rhsPointer, solverRhs.length).set(solverRhs);
    new Float64Array(wasm.memory.buffer, solutionPointer, solverRhs.length).fill(0);
    new Float64Array(wasm.memory.buffer, diagnosticsPointer, diagnosticLength).fill(Number.NaN);

    statusCode = wasm.p8_solve_csr(
      solveOptions.matrixClassCode,
      normalized.rowCount,
      solverMatrix.values.length,
      rowPointer,
      columnIndex,
      values,
      rhsPointer,
      solutionPointer,
      solveOptions.pivotTolerance,
      solveOptions.relativeTolerance,
      solveOptions.maxIterations,
      diagnosticsPointer,
    ) >>> 0;

    rawDiagnostics = new Float64Array(diagnosticLength);
    rawDiagnostics.set(new Float64Array(wasm.memory.buffer, diagnosticsPointer, diagnosticLength));
    const permutedSolution = new Float64Array(normalized.rowCount);
    permutedSolution.set(new Float64Array(wasm.memory.buffer, solutionPointer, normalized.rowCount));
    solution = unpermuteVector(permutedSolution, symbolic.permutation);
  } catch (error) {
    const reason = error instanceof BackendError ? error.code : 'WASM_SOLVE_TRAP';
    return failureResult(reason, {
      stage: 'wasm-solve',
      matrixClass: solveOptions.matrixClass,
      inputStorage: normalized.inputStorage,
      rowCount: normalized.rowCount,
      colCount: normalized.colCount,
      nnz: normalized.values.length,
      finite: false,
      message: String(error?.message || error),
    });
  } finally {
    for (let index = allocations.length - 1; index >= 0; index -= 1) {
      const allocation = allocations[index];
      wasm.p8_dealloc(allocation.pointer, allocation.size, allocation.alignment);
      memoryStats.free(allocation.size);
    }
  }

  return wasmResult(statusCode, rawDiagnostics, solution, normalized, solveOptions, symmetryError, symbolic);
}

function solveMultipleWithWasm(
  wasm,
  diagnosticLength,
  matrix,
  rhsList,
  options,
  symbolicContext,
  memoryStats,
) {
  if (options?.signal?.aborted === true || options?.shouldCancel?.() === true) {
    return multipleFailure(failureResult('CANCELLED', { stage: 'preflight' }));
  }
  let normalized;
  let normalizedRhsList;
  let solveOptions;
  try {
    normalized = normalizeSparseMatrix(matrix);
    if (!Array.isArray(rhsList) || rhsList.length < 1) {
      throw new InputError('INVALID_RHS_BATCH', 'At least one right-hand side is required.');
    }
    normalizedRhsList = rhsList.map((rhs) => normalizeRhs(rhs, normalized.rowCount));
    solveOptions = normalizeSolveOptions(options, normalized.rowCount);
  } catch (error) {
    return multipleFailure(inputFailure(error));
  }

  let symmetryError = null;
  if (solveOptions.matrixClass === 'spd') {
    symmetryError = csrSymmetryError(normalized);
    if (!Number.isFinite(symmetryError) || symmetryError > 1e-10) {
      return multipleFailure(failureResult('MATRIX_NOT_SYMMETRIC', {
        stage: 'qualification',
        matrixClass: solveOptions.matrixClass,
        symmetryError,
        symmetryTolerance: 1e-10,
      }));
    }
  }

  const symbolic = symbolicContext.resolve(normalized);
  const solverMatrix = permuteCsr(normalized, symbolic.permutation);
  const solverRhsList = normalizedRhsList.map((rhs) => permuteVector(rhs, symbolic.permutation));
  const rhsCount = solverRhsList.length;
  const dimension = normalized.rowCount;
  const allocations = [];
  const allocate = (byteLength, alignment) => {
    const size = Math.max(1, byteLength);
    if (!Number.isSafeInteger(size) || size > MAX_U32) {
      throw new BackendError('WASM_INPUT_TOO_LARGE', `WASM allocation exceeds u32: ${size} bytes.`);
    }
    const pointer = wasm.p8_alloc(size, alignment) >>> 0;
    if (pointer === 0) throw new BackendError('WASM_ALLOCATION_FAILED', `Unable to allocate ${size} bytes.`);
    allocations.push({ pointer, size, alignment });
    memoryStats.allocate(size);
    return pointer;
  };

  try {
    const rowPointer = allocate(solverMatrix.rowPtr.byteLength, Uint32Array.BYTES_PER_ELEMENT);
    const columnIndex = allocate(solverMatrix.colIdx.byteLength, Uint32Array.BYTES_PER_ELEMENT);
    const valuesPointer = allocate(solverMatrix.values.byteLength, Float64Array.BYTES_PER_ELEMENT);
    const channelBytes = rhsCount * dimension * Float64Array.BYTES_PER_ELEMENT;
    const rhsPointer = allocate(channelBytes, Float64Array.BYTES_PER_ELEMENT);
    const solutionPointer = allocate(channelBytes, Float64Array.BYTES_PER_ELEMENT);
    const diagnosticsPointer = allocate(
      rhsCount * diagnosticLength * Float64Array.BYTES_PER_ELEMENT,
      Float64Array.BYTES_PER_ELEMENT,
    );

    new Uint32Array(wasm.memory.buffer, rowPointer, solverMatrix.rowPtr.length).set(solverMatrix.rowPtr);
    new Uint32Array(wasm.memory.buffer, columnIndex, solverMatrix.colIdx.length).set(solverMatrix.colIdx);
    new Float64Array(wasm.memory.buffer, valuesPointer, solverMatrix.values.length).set(solverMatrix.values);
    const rhsView = new Float64Array(wasm.memory.buffer, rhsPointer, rhsCount * dimension);
    solverRhsList.forEach((rhs, index) => rhsView.set(rhs, index * dimension));
    new Float64Array(wasm.memory.buffer, solutionPointer, rhsCount * dimension).fill(0);
    new Float64Array(wasm.memory.buffer, diagnosticsPointer, rhsCount * diagnosticLength).fill(Number.NaN);

    const statusCode = wasm.p9_solve_csr_multi(
      solveOptions.matrixClassCode,
      dimension,
      solverMatrix.values.length,
      rowPointer,
      columnIndex,
      valuesPointer,
      rhsCount,
      rhsPointer,
      dimension,
      solutionPointer,
      dimension,
      solveOptions.pivotTolerance,
      solveOptions.relativeTolerance,
      solveOptions.maxIterations,
      diagnosticsPointer,
      diagnosticLength,
    ) >>> 0;

    const rawAll = new Float64Array(rhsCount * diagnosticLength);
    rawAll.set(new Float64Array(wasm.memory.buffer, diagnosticsPointer, rawAll.length));
    const solutionAll = new Float64Array(rhsCount * dimension);
    solutionAll.set(new Float64Array(wasm.memory.buffer, solutionPointer, solutionAll.length));
    const results = [];
    for (let index = 0; index < rhsCount; index += 1) {
      const raw = rawAll.slice(index * diagnosticLength, (index + 1) * diagnosticLength);
      if (!Number.isFinite(raw[0])) break;
      const channelStatus = Math.trunc(raw[0]);
      const permutedSolution = solutionAll.slice(index * dimension, (index + 1) * dimension);
      results.push(wasmResult(
        channelStatus,
        raw,
        unpermuteVector(permutedSolution, symbolic.permutation),
        normalized,
        solveOptions,
        symmetryError,
        symbolic,
      ));
      if (channelStatus !== 0) break;
    }
    const ok = statusCode === 0 && results.length === rhsCount && results.every((row) => row.ok);
    return {
      ok,
      results,
      x: results.map((row) => row.x),
      reason: ok ? null : results.at(-1)?.reason || STATUS_REASON[statusCode] || `WASM_STATUS_${statusCode}`,
      diagnostics: {
        version: 'p9-wasm-multi-rhs-diagnostics-v1',
        backendId: WASM_SPARSE_BACKEND_ID,
        nativeMultiRhs: true,
        wasmAbiVersion: 2,
        rhsCount,
        solvedRhsCount: results.filter((row) => row.ok).length,
        eventOrder: results.map((_row, index) => index),
        patternHash: symbolic.patternHash,
        symbolicCacheHit: symbolic.cacheHit,
        denseMatrixAllocated: false,
        denseFallbackAllocated: false,
        denseConversionCount: 0,
        statusCode,
      },
    };
  } catch (error) {
    return multipleFailure(failureResult(
      error instanceof BackendError ? error.code : 'WASM_SOLVE_TRAP',
      { stage: 'wasm-multi-rhs', message: String(error?.message || error) },
    ));
  } finally {
    for (let index = allocations.length - 1; index >= 0; index -= 1) {
      const allocation = allocations[index];
      wasm.p8_dealloc(allocation.pointer, allocation.size, allocation.alignment);
      memoryStats.free(allocation.size);
    }
  }
}

function multipleFailure(result) {
  return { ...result, results: [], x: [], diagnostics: { ...result.diagnostics, nativeMultiRhs: true, rhsCount: 0 } };
}

function wasmResult(statusCode, raw, solution, matrix, options, symmetryError, symbolic) {
  const diagnosticStatus = Number.isFinite(raw[0]) ? Math.trunc(raw[0]) : null;
  const statusMatches = diagnosticStatus === statusCode;
  const solutionFinite = solution.every(Number.isFinite);
  const wasmFinite = raw[13] === 1;
  const pivotRatio = finiteDiagnostic(raw[9]);
  const ok = statusCode === 0 && statusMatches && solutionFinite && wasmFinite;
  const reason = ok
    ? null
    : !statusMatches
      ? 'WASM_DIAGNOSTIC_STATUS_MISMATCH'
      : !solutionFinite
        ? 'NONFINITE_SOLUTION'
        : STATUS_REASON[statusCode] || `WASM_STATUS_${statusCode}`;
  const diagnostics = {
    version: WASM_SPARSE_DIAGNOSTICS_VERSION,
    backendId: WASM_SPARSE_BACKEND_ID,
    production: true,
    method: options.matrixClass === 'spd' ? 'wasm-csr-cg' : 'wasm-row-sparse-partial-pivot-lu',
    matrixClass: options.matrixClass,
    inputStorage: matrix.inputStorage,
    matrixStorage: 'csr',
    factorStorage: options.matrixClass === 'spd' ? null : 'row-sparse-u',
    storagePath: [matrix.inputStorage, 'canonical-csr', 'wasm-linear-memory'],
    rowCount: matrix.rowCount,
    colCount: matrix.colCount,
    inputNnz: matrix.inputNnz,
    nnz: matrix.values.length,
    duplicateMergedCount: matrix.duplicateMergedCount,
    droppedZeroCount: matrix.droppedZeroCount,
    denseMatrixAllocated: false,
    denseFallbackAllocated: false,
    denseConversionCount: 0,
    deterministic: true,
    statusCode,
    diagnosticStatus,
    iterations: integerDiagnostic(raw[1]),
    maxIterations: options.maxIterations,
    residualL2: finiteDiagnostic(raw[2]),
    residualNorm: finiteDiagnostic(raw[3]),
    relativeResidual: finiteDiagnostic(raw[3]),
    residualMax: finiteDiagnostic(raw[4]),
    rhsNorm: finiteDiagnostic(raw[5]),
    matrixNorm: finiteDiagnostic(raw[6]),
    pivotMin: finiteDiagnostic(raw[7]),
    pivotMax: finiteDiagnostic(raw[8]),
    pivotRatio,
    pivotConditionIndicator: pivotRatio > 0 ? 1 / pivotRatio : null,
    conditionMetric: 'pivot-spread-proxy-not-norm-condition-number',
    factorNonzeros: integerDiagnostic(raw[10]),
    fillInCount: integerDiagnostic(raw[11]),
    failureIndex: raw[12] >= 0 && Number.isFinite(raw[12]) ? Math.trunc(raw[12]) : null,
    finite: wasmFinite && solutionFinite,
    pivotTolerance: options.pivotTolerance,
    relativeTolerance: options.relativeTolerance,
    symmetryError,
    patternHash: symbolic.patternHash,
    ordering: symbolic.ordering,
    permutation: Array.from(symbolic.permutation),
    symbolicCacheHit: symbolic.cacheHit,
    symbolicAnalysisCount: symbolic.analysisCount,
    symbolicCacheSize: symbolic.cacheSize,
    reason,
    failure: ok ? null : {
      stage: options.matrixClass === 'spd' ? 'iterative-solve' : 'factorization-or-solve',
      reason,
      index: raw[12] >= 0 && Number.isFinite(raw[12]) ? Math.trunc(raw[12]) : null,
    },
  };
  return { ok, x: ok ? solution : null, reason, diagnostics };
}

function createSymbolicContext() {
  const cache = new Map();
  let analysisCount = 0;
  return {
    resolve(matrix) {
      const patternHash = stableHash({
        rowCount: matrix.rowCount,
        colCount: matrix.colCount,
        rowPtr: Array.from(matrix.rowPtr),
        colIdx: Array.from(matrix.colIdx),
      }).slice(0, 24);
      const cached = cache.get(patternHash);
      if (cached) return { ...cached, cacheHit: true, analysisCount, cacheSize: cache.size };
      const csc = csrPatternToCsc(matrix);
      const symbolic = symbolicFactor(csc, { ordering: 'approximate-minimum-degree' });
      analysisCount += 1;
      const row = Object.freeze({
        patternHash,
        ordering: 'symmetric-approximate-minimum-degree',
        permutation: Int32Array.from(symbolic.permutation),
      });
      if (cache.size >= SYMBOLIC_CACHE_LIMIT) cache.delete(cache.keys().next().value);
      cache.set(patternHash, row);
      return { ...row, cacheHit: false, analysisCount, cacheSize: cache.size };
    },
  };
}

function csrPatternToCsc(matrix) {
  const colPtr = new Int32Array(matrix.colCount + 1);
  for (const column of matrix.colIdx) colPtr[column + 1] += 1;
  for (let column = 0; column < matrix.colCount; column += 1) colPtr[column + 1] += colPtr[column];
  const cursor = Int32Array.from(colPtr);
  const rowIdx = new Int32Array(matrix.values.length);
  const values = new Float64Array(matrix.values.length).fill(1);
  for (let row = 0; row < matrix.rowCount; row += 1) {
    for (let offset = matrix.rowPtr[row]; offset < matrix.rowPtr[row + 1]; offset += 1) {
      const destination = cursor[matrix.colIdx[offset]]++;
      rowIdx[destination] = row;
    }
  }
  return {
    format: 'csc',
    rowCount: matrix.rowCount,
    colCount: matrix.colCount,
    nnz: values.length,
    colPtr,
    rowIdx,
    values,
  };
}

function permuteCsr(matrix, permutation) {
  const inverse = new Int32Array(permutation.length);
  permutation.forEach((original, permuted) => { inverse[original] = permuted; });
  const rows = Array.from({ length: matrix.rowCount }, () => []);
  for (let originalRow = 0; originalRow < matrix.rowCount; originalRow += 1) {
    const row = rows[inverse[originalRow]];
    for (let offset = matrix.rowPtr[originalRow]; offset < matrix.rowPtr[originalRow + 1]; offset += 1) {
      row.push({ column: inverse[matrix.colIdx[offset]], value: matrix.values[offset] });
    }
  }
  const rowPtr = new Uint32Array(matrix.rowCount + 1);
  const colIdx = new Uint32Array(matrix.values.length);
  const values = new Float64Array(matrix.values.length);
  let cursor = 0;
  rows.forEach((row, rowIndex) => {
    row.sort((a, b) => a.column - b.column);
    for (const entry of row) {
      colIdx[cursor] = entry.column;
      values[cursor] = entry.value;
      cursor += 1;
    }
    rowPtr[rowIndex + 1] = cursor;
  });
  return { rowCount: matrix.rowCount, colCount: matrix.colCount, rowPtr, colIdx, values };
}

function permuteVector(vector, permutation) {
  return Float64Array.from(permutation, (original) => vector[original]);
}

function unpermuteVector(vector, permutation) {
  const output = new Float64Array(vector.length);
  permutation.forEach((original, permuted) => { output[original] = vector[permuted]; });
  return output;
}

function normalizeSolveOptions(options, rowCount) {
  if (!options || typeof options !== 'object') {
    throw new InputError('INVALID_OPTIONS', 'Solver options must be an object.');
  }
  const requestedClass = String(options.matrixClass ?? 'general').trim().toLowerCase();
  let matrixClass;
  let matrixClassCode;
  if (requestedClass === 'spd') {
    matrixClass = 'spd';
    matrixClassCode = 0;
  } else if (
    requestedClass === 'general'
    || requestedClass === 'indefinite'
    || requestedClass === 'symmetric-indefinite'
  ) {
    matrixClass = requestedClass === 'general' ? 'general' : 'indefinite';
    matrixClassCode = 1;
  } else {
    throw new InputError('UNSUPPORTED_MATRIX_CLASS', `Unsupported matrix class: ${requestedClass}.`);
  }

  const pivotTolerance = positiveOption(
    options.pivotTolerance,
    DEFAULT_PIVOT_TOLERANCE,
    'pivotTolerance',
  );
  const relativeTolerance = positiveOption(
    options.relativeTolerance,
    DEFAULT_RELATIVE_TOLERANCE,
    'relativeTolerance',
  );
  if (pivotTolerance > 1 || relativeTolerance > 1) {
    throw new InputError('INVALID_OPTIONS', 'Solver tolerances must not exceed one.');
  }
  const defaultIterations = Math.min(MAX_U32, Math.max(32, rowCount * 5));
  const maxIterationsValue = options.maxIterations ?? defaultIterations;
  const maxIterations = Number(maxIterationsValue);
  if (!Number.isInteger(maxIterations) || maxIterations <= 0 || maxIterations > MAX_U32) {
    throw new InputError('INVALID_OPTIONS', 'maxIterations must be a positive u32 integer.');
  }
  return {
    matrixClass,
    matrixClassCode,
    pivotTolerance,
    relativeTolerance,
    maxIterations,
  };
}

function positiveOption(value, fallback, name) {
  if (value === undefined) return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new InputError('INVALID_OPTIONS', `${name} must be finite and greater than zero.`);
  }
  return number;
}

function normalizeRhs(rhs, dimension) {
  if (!isNumericArrayLike(rhs) || rhs.length !== dimension) {
    throw new InputError('INVALID_RHS', `Right-hand side length must equal ${dimension}.`);
  }
  const output = new Float64Array(dimension);
  for (let index = 0; index < dimension; index += 1) {
    const value = Number(rhs[index]);
    if (!Number.isFinite(value)) {
      throw new InputError('NONFINITE_RHS', `Right-hand side value ${index} is not finite.`);
    }
    output[index] = value;
  }
  return output;
}

function normalizeSparseMatrix(matrix) {
  if (!matrix || typeof matrix !== 'object') {
    throw new InputError('INVALID_MATRIX', 'Sparse matrix must be an object.');
  }
  const rowCount = readDimension(matrix, ['rowCount', 'rows', 'nRows'], 0);
  const colCount = readDimension(matrix, ['colCount', 'cols', 'nCols'], 1);
  if (!Number.isInteger(rowCount) || !Number.isInteger(colCount) || rowCount <= 0 || colCount <= 0) {
    throw new InputError('INVALID_DIMENSIONS', 'Sparse matrix dimensions must be positive integers.');
  }
  if (rowCount !== colCount) {
    throw new InputError('MATRIX_NOT_SQUARE', `Sparse solver requires a square matrix, got ${rowCount}x${colCount}.`);
  }
  if (rowCount > MAX_U32 - 1) {
    throw new InputError('WASM_INPUT_TOO_LARGE', 'Sparse matrix dimension exceeds the WASM u32 ABI.');
  }

  const format = inferFormat(matrix);
  const pointerSource = format === 'csr'
    ? firstDefined(matrix.rowPtr, matrix.rowPointers, matrix.indptr, matrix.pointers)
    : firstDefined(matrix.colPtr, matrix.colPointers, matrix.indptr, matrix.pointers);
  const indexSource = format === 'csr'
    ? firstDefined(matrix.colIdx, matrix.columnIndex, matrix.columnIndices, matrix.indices)
    : firstDefined(matrix.rowIdx, matrix.rowIndex, matrix.rowIndices, matrix.indices);
  const valueSource = firstDefined(matrix.values, matrix.data);
  const majorCount = format === 'csr' ? rowCount : colCount;
  const minorCount = format === 'csr' ? colCount : rowCount;
  if (!isNumericArrayLike(pointerSource)
    || !isNumericArrayLike(indexSource)
    || !isNumericArrayLike(valueSource)) {
    throw new InputError('INVALID_MATRIX', `Typed ${format.toUpperCase()} pointers, indices, and values are required.`);
  }
  if (pointerSource.length !== majorCount + 1) {
    throw new InputError('INVALID_MATRIX', `${format.toUpperCase()} pointer length must be ${majorCount + 1}.`);
  }

  const pointers = new Uint32Array(majorCount + 1);
  let previous = 0;
  for (let index = 0; index < pointers.length; index += 1) {
    const value = Number(pointerSource[index]);
    if (!Number.isInteger(value) || value < previous || value > MAX_U32) {
      throw new InputError('INVALID_MATRIX', `${format.toUpperCase()} pointer ${index} is invalid.`);
    }
    pointers[index] = value;
    previous = value;
  }
  if (pointers[0] !== 0) {
    throw new InputError('INVALID_MATRIX', `${format.toUpperCase()} pointers must start at zero.`);
  }
  const inputNnz = pointers[majorCount];
  if (indexSource.length !== inputNnz || valueSource.length !== inputNnz) {
    throw new InputError('INVALID_MATRIX', `${format.toUpperCase()} indices and values must match pointer nnz ${inputNnz}.`);
  }
  if (matrix.nnz !== undefined && Number(matrix.nnz) !== inputNnz) {
    throw new InputError('INVALID_MATRIX', `Matrix nnz does not match ${format.toUpperCase()} storage.`);
  }

  const indices = new Uint32Array(inputNnz);
  const values = new Float64Array(inputNnz);
  for (let offset = 0; offset < inputNnz; offset += 1) {
    const index = Number(indexSource[offset]);
    const value = Number(valueSource[offset]);
    if (!Number.isInteger(index) || index < 0 || index >= minorCount) {
      throw new InputError('INVALID_MATRIX', `${format.toUpperCase()} index ${offset} is out of range.`);
    }
    if (!Number.isFinite(value)) {
      throw new InputError('NONFINITE_MATRIX', `${format.toUpperCase()} value ${offset} is not finite.`);
    }
    indices[offset] = index;
    values[offset] = value;
  }

  const rawCsr = format === 'csr'
    ? { rowPtr: pointers, colIdx: indices, values }
    : cscToRawCsr(rowCount, colCount, pointers, indices, values);
  return canonicalizeCsr(rawCsr, {
    rowCount,
    colCount,
    inputNnz,
    inputStorage: format,
  });
}

function cscToRawCsr(rowCount, colCount, colPtr, rowIdx, values) {
  const rowPtr = new Uint32Array(rowCount + 1);
  for (let offset = 0; offset < rowIdx.length; offset += 1) rowPtr[rowIdx[offset] + 1] += 1;
  for (let row = 0; row < rowCount; row += 1) rowPtr[row + 1] += rowPtr[row];

  const cursor = rowPtr.slice(0, rowCount);
  const colIdx = new Uint32Array(values.length);
  const csrValues = new Float64Array(values.length);
  for (let column = 0; column < colCount; column += 1) {
    for (let offset = colPtr[column]; offset < colPtr[column + 1]; offset += 1) {
      const row = rowIdx[offset];
      const destination = cursor[row];
      cursor[row] += 1;
      colIdx[destination] = column;
      csrValues[destination] = values[offset];
    }
  }
  return { rowPtr, colIdx, values: csrValues };
}

function canonicalizeCsr(raw, metadata) {
  const rowPtr = new Uint32Array(metadata.rowCount + 1);
  const columns = [];
  const values = [];
  let duplicateMergedCount = 0;
  let droppedZeroCount = 0;

  for (let row = 0; row < metadata.rowCount; row += 1) {
    const start = raw.rowPtr[row];
    const end = raw.rowPtr[row + 1];
    const entries = new Array(end - start);
    for (let offset = start; offset < end; offset += 1) {
      entries[offset - start] = {
        column: raw.colIdx[offset],
        value: raw.values[offset],
      };
    }
    entries.sort((left, right) => left.column - right.column);
    let offset = 0;
    while (offset < entries.length) {
      const column = entries[offset].column;
      let value = entries[offset].value;
      let next = offset + 1;
      while (next < entries.length && entries[next].column === column) {
        value += entries[next].value;
        duplicateMergedCount += 1;
        next += 1;
      }
      if (!Number.isFinite(value)) {
        throw new InputError('NONFINITE_MATRIX', `Merged CSR value at row ${row}, column ${column} is not finite.`);
      }
      if (value === 0) {
        droppedZeroCount += 1;
      } else {
        columns.push(column);
        values.push(value);
      }
      offset = next;
    }
    if (columns.length > MAX_U32) {
      throw new InputError('WASM_INPUT_TOO_LARGE', 'Canonical CSR nnz exceeds the WASM u32 ABI.');
    }
    rowPtr[row + 1] = columns.length;
  }

  return {
    ...metadata,
    rowPtr,
    colIdx: Uint32Array.from(columns),
    values: Float64Array.from(values),
    duplicateMergedCount,
    droppedZeroCount,
  };
}

function csrSymmetryError(matrix) {
  let scale = 0;
  for (const value of matrix.values) scale = Math.max(scale, Math.abs(value));
  if (scale === 0) return 0;

  let normSquared = 0;
  let differenceSquared = 0;
  for (let row = 0; row < matrix.rowCount; row += 1) {
    for (let offset = matrix.rowPtr[row]; offset < matrix.rowPtr[row + 1]; offset += 1) {
      const column = matrix.colIdx[offset];
      const value = matrix.values[offset];
      const scaled = value / scale;
      normSquared += scaled * scaled;
      if (column === row) continue;
      const reverseOffset = findCsrOffset(matrix, column, row);
      const reverse = reverseOffset >= 0 ? matrix.values[reverseOffset] : 0;
      const difference = (value - reverse) / scale;
      differenceSquared += difference * difference * (reverseOffset >= 0 ? 1 : 2);
    }
  }
  return Math.sqrt(differenceSquared / Math.max(normSquared, Number.MIN_VALUE));
}

function findCsrOffset(matrix, row, column) {
  let low = matrix.rowPtr[row];
  let high = matrix.rowPtr[row + 1] - 1;
  while (low <= high) {
    const middle = low + Math.trunc((high - low) / 2);
    const candidate = matrix.colIdx[middle];
    if (candidate === column) return middle;
    if (candidate < column) low = middle + 1;
    else high = middle - 1;
  }
  return -1;
}

function readDimension(matrix, names, shapeIndex) {
  for (const name of names) {
    if (matrix[name] !== undefined) return Number(matrix[name]);
  }
  if (isNumericArrayLike(matrix.shape) && matrix.shape.length > shapeIndex) {
    return Number(matrix.shape[shapeIndex]);
  }
  if (matrix.dimension !== undefined) return Number(matrix.dimension);
  if (matrix.n !== undefined) return Number(matrix.n);
  return Number.NaN;
}

function inferFormat(matrix) {
  if (matrix.format !== undefined) {
    const format = String(matrix.format).trim().toLowerCase();
    if (format === 'csr' || format === 'csc') return format;
    throw new InputError('UNSUPPORTED_MATRIX_FORMAT', `Unsupported sparse matrix format: ${format}.`);
  }
  if (matrix.rowPtr !== undefined) return 'csr';
  if (matrix.colPtr !== undefined) return 'csc';
  throw new InputError('UNSUPPORTED_MATRIX_FORMAT', 'Sparse matrix format must be CSR or CSC.');
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined);
}

function isNumericArrayLike(value) {
  return Array.isArray(value)
    || (ArrayBuffer.isView(value) && !(value instanceof DataView) && typeof value.length === 'number');
}

function inputFailure(error) {
  if (error instanceof InputError) {
    return failureResult(error.code, {
      stage: 'input-validation',
      finite: !error.code.startsWith('NONFINITE'),
      message: error.message,
    });
  }
  return failureResult('INVALID_INPUT', {
    stage: 'input-validation',
    finite: false,
    message: String(error?.message || error),
  });
}

function failureResult(reason, detail = {}) {
  return {
    ok: false,
    x: null,
    reason,
    diagnostics: {
      version: WASM_SPARSE_DIAGNOSTICS_VERSION,
      backendId: WASM_SPARSE_BACKEND_ID,
      production: true,
      method: null,
      matrixStorage: 'csr',
      denseMatrixAllocated: false,
      denseFallbackAllocated: false,
      denseConversionCount: 0,
      deterministic: true,
      statusCode: null,
      reason,
      failure: { reason, stage: detail.stage || 'pre-solve' },
      ...detail,
    },
  };
}

function finiteDiagnostic(value) {
  return Number.isFinite(value) ? value : null;
}

function integerDiagnostic(value) {
  return Number.isFinite(value) && value >= 0 ? Math.trunc(value) : null;
}

class InputError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'InputError';
    this.code = code;
  }
}

class BackendError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'BackendError';
    this.code = code;
  }
}

function createMemoryStats() {
  let allocationCount = 0;
  let freeCount = 0;
  let allocatedBytes = 0;
  let freedBytes = 0;
  let outstandingBytes = 0;
  let peakBytes = 0;
  return Object.freeze({
    allocate(bytes) {
      allocationCount += 1;
      allocatedBytes += bytes;
      outstandingBytes += bytes;
      peakBytes = Math.max(peakBytes, outstandingBytes);
    },
    free(bytes) {
      freeCount += 1;
      freedBytes += bytes;
      outstandingBytes = Math.max(0, outstandingBytes - bytes);
    },
    snapshot() {
      return Object.freeze({
        version: 'p9-wasm-memory-ledger-v1',
        allocationCount,
        freeCount,
        allocatedBytes,
        freedBytes,
        outstandingBytes,
        peakBytes,
        balanced: allocationCount === freeCount && outstandingBytes === 0,
      });
    },
  });
}
