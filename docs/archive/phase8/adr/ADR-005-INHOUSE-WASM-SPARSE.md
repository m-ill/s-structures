# ADR-005: In-House WASM Sparse Solver Backend

```yaml
status: accepted
accepted_at: 2026-07-12
milestone: P8-M2
decision_scope: nonlinear equilibrium linear-system backend
```

## Context

Phase 8 needs deterministic SPD and indefinite/general sparse solves in a worker without converting the production matrix to a dense global matrix. The backend also needs explicit memory ownership, machine-readable failure diagnostics, and a reference path that remains separate from production execution.

## Decision

Use the in-repository Rust crate at `native/phase8-solver` and compile it to the self-contained WebAssembly binary `src/nonlinear/equilibrium/backends/phase8_solver.wasm`.

- The crate has no external Cargo dependencies and contains the numerical algorithms in repository source.
- The WASM module has zero runtime imports.
- SPD systems use diagonally preconditioned conjugate gradient after symmetry qualification.
- General and symmetric-indefinite systems use row-sparse Gaussian elimination with partial pivoting.
- The JavaScript adapter canonicalizes CSR/CSC input, applies deterministic symmetric ordering, caches symbolic patterns, owns all WASM allocations, and reports residual, pivot, fill, finiteness, and failure diagnostics.
- The dense pivoted solver is reference-only and limited to 300 active DOFs.
- The JavaScript sparse solver is reference-only and limited to 2,000 active DOFs.
- Production mode fails with `PRODUCTION_BACKEND_UNAVAILABLE`; it never falls back to either reference backend.

## Licensing Boundary

No third-party numerical solver, external Cargo crate, or dynamically imported numerical runtime is used. The Rust compiler and standard library remain build-toolchain components and must remain listed in the product's normal toolchain/license inventory before distribution. This ADR does not claim that software has no license; it records that Phase 8 introduces no separately licensed numerical solver dependency.

## Build and Reproducibility

Run:

```text
npm.cmd run build:p8wasm
```

The build uses the locked crate, `wasm32-unknown-unknown`, release LTO, deterministic source epoch, and then rejects any WASM runtime import. Source, `Cargo.lock`, generated binary, byte size, SHA-256, and import count are retained or reported by the repository workflow.

## Failure Policy

- Non-square, malformed, non-finite, non-symmetric SPD, singular, and non-positive-curvature systems fail closed.
- Solver status and diagnostic status must agree.
- Non-finite solutions are never returned as successful.
- Cancellation preserves the latest committed boundary; uncommitted state is discarded.
- Reference backends cannot satisfy a production preflight.

## Consequences and Remaining Qualification

The backend is suitable as the P8-M2 production execution path, but commercial performance equivalence is not yet claimed. The current general solver is single-threaded, single-right-hand-side, and can incur substantial fill for unfavorable patterns. Cancellation is observed at worker/solver boundaries rather than inside one synchronous factorization. Large-model fill, latency, memory, crash recovery, and browser coverage remain P8-M10/P8-M11 qualification gates.
