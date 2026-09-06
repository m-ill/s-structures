import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import {
  WASM_SPARSE_BACKEND_ID,
  createWasmSparseBackend,
} from '../src/nonlinear/equilibrium/backends/wasmSparseBackend.js';

const wasmUrl = new URL('../src/nonlinear/equilibrium/backends/phase8_solver.wasm', import.meta.url);
const manifestUrl = new URL('../native/phase8-solver/Cargo.toml', import.meta.url);
const lockUrl = new URL('../native/phase8-solver/Cargo.lock', import.meta.url);
const rustSourceUrl = new URL('../native/phase8-solver/src/lib.rs', import.meta.url);
const buildToolUrl = new URL('../tools/build-phase8-wasm.mjs', import.meta.url);

const [wasmBytes, wasmStat, manifest, lockfile, rustSource, buildTool] = await Promise.all([
  readFile(wasmUrl),
  stat(wasmUrl),
  readFile(manifestUrl, 'utf8'),
  readFile(lockUrl, 'utf8'),
  readFile(rustSourceUrl, 'utf8'),
  readFile(buildToolUrl, 'utf8'),
]);

assert.ok(wasmStat.isFile() && wasmStat.size > 8, 'bundled WASM binary must be available');
assert.deepEqual([...wasmBytes.subarray(0, 4)], [0x00, 0x61, 0x73, 0x6d], 'WASM magic');
const wasmModule = new WebAssembly.Module(wasmBytes);
assert.deepEqual(WebAssembly.Module.imports(wasmModule), [], 'WASM must have no runtime imports');
const wasmExports = WebAssembly.Module.exports(wasmModule).map((item) => item.name);
for (const name of [
  'memory',
  'p8_alloc',
  'p8_dealloc',
  'p8_solve_csr',
  'p8_solver_abi_version',
  'p8_solver_capabilities',
]) {
  assert.ok(wasmExports.includes(name), `missing WASM export ${name}`);
}

assert.doesNotMatch(manifest, /^\s*\[(?:dev-|build-)?dependencies(?:\.[^\]]+)?\]/m);
assert.equal((lockfile.match(/^\[\[package\]\]$/gm) || []).length, 1, 'lockfile must contain only the in-repo crate');
assert.doesNotMatch(rustSource, /wasm_bindgen|extern\s+crate/);
assert.doesNotMatch(rustSource, /dimension\s*\*\s*dimension|dimension\.pow\s*\(\s*2\s*\)/);
assert.match(rustSource, /Vec<Entry>/, 'general solver must retain sparse rows');
assert.match(buildTool, /--locked/);
assert.match(buildTool, /copyFile\(builtWasm, destination\)/);

const backend = await createWasmSparseBackend();
const bytesBackend = await createWasmSparseBackend({ wasmBytes });
const urlBackend = await createWasmSparseBackend({ wasmUrl });
assert.equal(backend.id, WASM_SPARSE_BACKEND_ID);
assert.equal(backend.id, 'p8-wasm-sparse-v1');
assert.equal(backend.production, true);
assert.ok(backend.matrixClasses.includes('spd'));
assert.ok(backend.matrixClasses.includes('general'));
assert.ok(backend.matrixClasses.includes('symmetric-indefinite'));
assert.deepEqual(backend.matrixFormats, ['csr', 'csc']);
assert.deepEqual(backend.preflight(), {
  ok: true,
  available: true,
  reason: null,
  backendId: 'p8-wasm-sparse-v1',
  production: true,
  wasmAbiVersion: 1,
  matrixClasses: ['spd', 'general', 'indefinite', 'symmetric-indefinite'],
  matrixFormats: ['csr', 'csc'],
  deterministic: true,
  denseFallback: false,
  memoryOwnership: 'explicit-wasm-allocation',
  ordering: 'symmetric-approximate-minimum-degree',
  symbolicCacheLimit: 64,
});

const spdCsr = {
  format: 'csr',
  rowCount: 3,
  colCount: 3,
  rowPtr: new Uint32Array([0, 3, 6, 8]),
  colIdx: new Uint32Array([
    1, 0, 1,
    2, 0, 1,
    2, 1,
  ]),
  values: new Float64Array([
    0.5, 4, 0.5,
    1, 1, 3,
    2, 1,
  ]),
};
const spdRhs = new Float64Array([1, 2, 3]);
const spdExpected = [2 / 9, 1 / 9, 13 / 9];
const spd = backend.solve(spdCsr, spdRhs, {
  matrixClass: 'spd',
  pivotTolerance: 1e-13,
  relativeTolerance: 1e-12,
  maxIterations: 30,
});
assert.equal(spd.ok, true, JSON.stringify(spd.diagnostics));
assert.ok(spd.x instanceof Float64Array);
closeVector(spd.x, spdExpected, 1e-12, 'SPD CSR');
assert.equal(spd.diagnostics.method, 'wasm-csr-cg');
assert.equal(spd.diagnostics.inputStorage, 'csr');
assert.equal(spd.diagnostics.inputNnz, 8);
assert.equal(spd.diagnostics.nnz, 7);
assert.equal(spd.diagnostics.duplicateMergedCount, 1);
assert.equal(spd.diagnostics.symmetryError, 0);
assert.ok(spd.diagnostics.iterations > 0);
assert.equal(spd.diagnostics.symbolicCacheHit, false);
assert.equal(spd.diagnostics.ordering, 'symmetric-approximate-minimum-degree');
assertFiniteDiagnostics(spd);

const generalCsc = {
  format: 'csc',
  rowCount: 3,
  colCount: 3,
  colPtr: new Int32Array([0, 3, 6, 9]),
  rowIdx: new Int32Array([
    2, 0, 1,
    1, 2, 0,
    1, 0, 2,
  ]),
  values: new Float64Array([
    -1, 3, 2,
    -2, 0.5, 2,
    4, -1, -1,
  ]),
};
const general = backend.solve(generalCsc, new Float64Array([1, -2, 0]), {
  matrixClass: 'general',
  pivotTolerance: 1e-13,
  relativeTolerance: 1e-12,
});
assert.equal(general.ok, true, JSON.stringify(general.diagnostics));
closeVector(general.x, [1, -2, -2], 1e-12, 'general CSC');
assert.equal(general.diagnostics.method, 'wasm-row-sparse-partial-pivot-lu');
assert.equal(general.diagnostics.inputStorage, 'csc');
assert.ok(general.diagnostics.factorNonzeros > 0);
assertFiniteDiagnostics(general);

const indefiniteCsr = {
  format: 'csr',
  shape: new Uint32Array([2, 2]),
  rowPtr: new Uint32Array([0, 1, 3]),
  colIdx: new Uint32Array([1, 0, 1]),
  values: new Float64Array([2, 2, 3]),
};
const indefinite = backend.solve(indefiniteCsr, new Float64Array([-2, -1]), {
  matrixClass: 'symmetric-indefinite',
  relativeTolerance: 1e-12,
});
assert.equal(indefinite.ok, true, JSON.stringify(indefinite.diagnostics));
closeVector(indefinite.x, [1, -1], 1e-12, 'indefinite CSR');
assert.equal(indefinite.diagnostics.matrixClass, 'indefinite');
assert.ok(indefinite.diagnostics.pivotMin > 0);
assertFiniteDiagnostics(indefinite);

const singular = backend.solve({
  format: 'csr',
  rowCount: 2,
  colCount: 2,
  rowPtr: new Uint32Array([0, 2, 4]),
  colIdx: new Uint32Array([0, 1, 0, 1]),
  values: new Float64Array([1, 2, 2, 4]),
}, new Float64Array([3, 6]), {
  matrixClass: 'general',
  pivotTolerance: 1e-12,
  relativeTolerance: 1e-12,
});
assert.equal(singular.ok, false);
assert.equal(singular.x, null);
assert.equal(singular.reason, 'SINGULAR_PIVOT');
assert.equal(singular.diagnostics.statusCode, 4);
assert.equal(singular.diagnostics.failureIndex, 1);
assert.equal(singular.diagnostics.pivotMin, 0);
assert.equal(singular.diagnostics.finite, true);
assertNoDenseAllocation(singular);

const rejectedIndefiniteSpd = backend.solve(indefiniteCsr, new Float64Array([-2, -1]), {
  matrixClass: 'spd',
});
assert.equal(rejectedIndefiniteSpd.ok, false);
assert.equal(rejectedIndefiniteSpd.reason, 'CG_NON_POSITIVE_CURVATURE');

const nonfinite = backend.solve({
  format: 'csr',
  rowCount: 1,
  colCount: 1,
  rowPtr: new Uint32Array([0, 1]),
  colIdx: new Uint32Array([0]),
  values: new Float64Array([Number.NaN]),
}, new Float64Array([1]), { matrixClass: 'general' });
assert.equal(nonfinite.ok, false);
assert.equal(nonfinite.reason, 'NONFINITE_MATRIX');
assert.equal(nonfinite.diagnostics.finite, false);
assertNoDenseAllocation(nonfinite);

const deterministicBaseline = snapshot(spd);
let repeatedAnalysisCount = null;
for (let run = 0; run < 5; run += 1) {
  const repeated = backend.solve(spdCsr, spdRhs, {
    matrixClass: 'spd',
    pivotTolerance: 1e-13,
    relativeTolerance: 1e-12,
    maxIterations: 30,
  });
  assert.equal(repeated.diagnostics.symbolicCacheHit, true);
  repeatedAnalysisCount ??= repeated.diagnostics.symbolicAnalysisCount;
  assert.equal(repeated.diagnostics.symbolicAnalysisCount, repeatedAnalysisCount);
  assert.deepEqual(snapshot(repeated), deterministicBaseline, `same-instance deterministic run ${run}`);
}
assert.deepEqual(snapshot(bytesBackend.solve(spdCsr, spdRhs, {
  matrixClass: 'spd',
  pivotTolerance: 1e-13,
  relativeTolerance: 1e-12,
  maxIterations: 30,
})), deterministicBaseline, 'byte-instantiated deterministic run');
assert.deepEqual(snapshot(urlBackend.solve(generalCsc, new Float64Array([1, -2, 0]), {
  matrixClass: 'general',
  pivotTolerance: 1e-13,
  relativeTolerance: 1e-12,
})), snapshot(general), 'URL-instantiated deterministic general run');

console.log(JSON.stringify({
  ok: true,
  backend: backend.id,
  wasmBytes: wasmStat.size,
  wasmImports: WebAssembly.Module.imports(wasmModule).length,
  spdIterations: spd.diagnostics.iterations,
  spdResidual: spd.diagnostics.relativeResidual,
  generalResidual: general.diagnostics.relativeResidual,
  singularReason: singular.reason,
  deterministicRuns: 7,
}, null, 2));

function snapshot(result) {
  const diagnostics = { ...result.diagnostics };
  delete diagnostics.symbolicCacheHit;
  delete diagnostics.symbolicAnalysisCount;
  delete diagnostics.symbolicCacheSize;
  return {
    ok: result.ok,
    x: result.x ? Array.from(result.x) : null,
    reason: result.reason,
    diagnostics,
  };
}

function assertFiniteDiagnostics(result) {
  assert.equal(result.diagnostics.finite, true);
  for (const field of [
    'residualL2',
    'relativeResidual',
    'residualMax',
    'rhsNorm',
    'matrixNorm',
    'pivotMin',
    'pivotMax',
    'pivotRatio',
    'pivotConditionIndicator',
  ]) {
    assert.ok(Number.isFinite(result.diagnostics[field]), `${field} must be finite`);
  }
  assert.ok(result.diagnostics.relativeResidual <= result.diagnostics.relativeTolerance);
  assertNoDenseAllocation(result);
}

function assertNoDenseAllocation(result) {
  assert.equal(result.diagnostics.denseMatrixAllocated, false);
  assert.equal(result.diagnostics.denseFallbackAllocated, false);
  assert.equal(result.diagnostics.denseConversionCount, 0);
}

function closeVector(actual, expected, tolerance, label) {
  assert.equal(actual.length, expected.length, `${label} length`);
  for (let index = 0; index < expected.length; index += 1) {
    const difference = Math.abs(actual[index] - expected[index]);
    assert.ok(
      difference <= tolerance,
      `${label}[${index}]: expected ${expected[index]}, got ${actual[index]}, diff ${difference}`,
    );
  }
}
