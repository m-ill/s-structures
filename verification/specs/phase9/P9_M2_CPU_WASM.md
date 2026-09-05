# P9-M2 CPU/WASM Sparse Runtime Verification

## Decision

P9-M2 passes its focused verification gate. The common deterministic `f64` sparse runtime is implemented for CPU and WASM, duplicate production sparse writers are removed, and legacy imports resolve through compatibility facades. Release and design-transfer permissions remain closed.

## Implemented Runtime

- `src/compute/sparse/matrix.js`: canonical typed CSR/CSC creation, conversion, validation, hashes, diagnostics and matrix operations.
- `src/compute/sparse/symbolic.js`: deterministic symbolic ordering and fill estimate.
- `src/compute/sparse/ldlt.js`: SPD sparse LDLT factorization and solve.
- `src/compute/sparse/lu.js`: general and indefinite sparse row-map LU with partial pivoting.
- `src/compute/sparse/factorRuntime.js`: reusable symbolic/numeric handles, value invalidation, multi-RHS, cancellation, memory budget and disposal.
- `src/compute/backends/cpuSparseBackend.js`: common backend contract for CPU `f64` execution.
- `src/compute/backends/wasmCpuBackend.js`: Phase 8-compatible WASM backend plus Phase 9 ABI v2 multi-RHS execution and allocation ledger.
- `native/phase8-solver/src/lib.rs`: self-contained Rust solver with preserved `p8_*` exports and additive `p9_*` exports.

No licensed third-party numeric package is introduced. The Rust crate remains dependency-free and the WASM module has zero imports.

## Verification Mapping

| IDs | Test | Coverage |
| --- | --- | --- |
| P9-CPU-01~02 | `tests/p9-m2-cpu-wasm.mjs` | Typed CSR/CSC validation, conversion and independent matvec values |
| P9-CPU-03~06 | `tests/p9-m2-cpu-wasm.mjs` | SPD residual, general/indefinite pivoting, singular fail-closed behavior |
| P9-CPU-07~08 | `tests/p9-m2-cpu-wasm.mjs` | Symbolic/numeric reuse and value-hash invalidation |
| P9-CPU-09~10 | `tests/p9-m2-cpu-wasm.mjs` | CPU prepared-factor and WASM ABI v2 multi-RHS parity |
| P9-CPU-11~12 | `tests/p9-m2-cpu-wasm.mjs` | Cancellation, memory budget, missing backend, no fallback and balanced allocation |
| P9-CPU-13~14 | `tests/p9-m2-cpu-wasm.mjs` | Explicit SIMD/thread capability and deterministic event order |
| P9-CMP-08~10 | M1 Worker tests reused | Backend plan and Worker protocol continuity |
| P9-CMP-11~12 | `tests/p9-m2-cpu-wasm.mjs` | CPU dispose and WASM allocation/free balance |
| P9-REF-04~05 | `tests/p9-m2-sparse-architecture.mjs` | Single owner, facade-only legacy files, dependency direction |

## Focused Regression

```text
node tests/p9-m2-cpu-wasm.mjs              PASS
node tests/p9-m2-sparse-architecture.mjs   PASS
node tests/p9-m1-adapters-architecture.mjs PASS
node tests/p7-m10-sparse-integrity.mjs     PASS
node tests/p8-m2-assembly-primitives.mjs   PASS
node tests/p8-m2-wasm-backend.mjs          PASS
node tests/p8-m8-dynamic-domain.mjs        PASS
```

The 1,200-DOF banded proxy verifies sparse memory behavior without running long nonlinear suites. Existing Phase 8 nonlinear qualification evidence is reused according to the user-approved minimal-test policy.

## Scope Boundary

M2 is a sparse runtime milestone, not the complete elastic workflow migration. The WASM ABI v2 keeps one matrix transfer for a multi-RHS call, while long-lived numeric factor grouping across elastic combinations belongs to M3. SIMD and WASM threads are explicit disabled capabilities until they receive dedicated implementation and determinism evidence.
