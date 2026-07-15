# P9-M2 Code Review

## Scope

Reviewed common sparse ownership, typed storage, SPD/general factors, factor lifecycle, CPU/WASM backends, Rust ABI additions, compatibility facades, focused tests, evidence generation and release-state updates.

## Findings Resolved

### High: Three solver areas owned incompatible CSC implementations

Linear, nonlinear equilibrium and nonlinear dynamics each implemented sparse storage. The implementations now reside under `src/compute/sparse`; old paths contain only small compatibility exports. Architecture tests block new duplicate writers and reverse dependencies.

### High: General systems required a dense fallback in the legacy solver

The common production runtime now uses sparse row-map LU with partial pivoting for general and indefinite matrices. Singular pivots fail closed. Common CPU/WASM diagnostics always report zero dense conversion and zero dense fallback.

### High: WASM copied and solved only one RHS per call

The additive Phase 9 ABI v2 accepts RHS-major channels, copies the matrix once, returns per-channel diagnostics and preserves deterministic order. The original Phase 8 ABI remains intact and its regression test passes.

### Medium: Typed CSC migration broke legacy CSC detection

Legacy diagnostics and assembly recognized only JavaScript arrays. Canonical constructors now return typed arrays, so those checks could misclassify CSC as dense. Detection now accepts typed array storage while common validation still requires canonical typed buffers.

### Medium: Stored value hashes could hide post-factor mutation

Factor validation initially trusted a stored value hash. Runtime checks now recompute pattern/value hashes from live buffers before solve, so mutated matrix values invalidate the handle instead of using a stale numeric factor.

### Medium: Allocation failures needed deterministic cleanup

All WASM allocations are registered immediately and released in reverse order in `finally`. CPU factor resources are reference-counted and released on handle disposal. Failure, success and multi-RHS tests end at zero outstanding bytes.

## Refactor Gates

- Single sparse implementation owner: PASS.
- Legacy sparse and WASM paths reduced to compatibility facades: PASS.
- Common compute dependency direction: PASS.
- Production common backend dense conversion/fallback: zero.
- CPU and WASM allocation/free balance: PASS.
- Phase 8 ABI and focused solver compatibility: PASS.

## Residual Risk

- The legacy verification solver retains an explicit dense fallback path for historical tests; it is outside the new common production backend and is not selected by the M2 backend contract.
- Long-lived native WASM numeric handles across separate calls are not exported. M2 provides persistent common CPU factor handles and native same-call multi-RHS; M3 owns elastic factor-group reuse.
- SIMD and WASM threads are declared unavailable. They are not performance claims.
- Full elastic production orchestration remains on the M1 compatibility adapter until M3.

## Review Decision

No open Critical or High finding remains in the implemented P9-M2 scope. M2 is acceptable as a `G1` CPU/WASM-integrated candidate with release and design-transfer gates closed.
