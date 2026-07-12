# Phase 8 Solver

This crate is the in-repository numerical backend for Phase 8 nonlinear equilibrium.

- No external Cargo dependencies.
- Exports a pointer-based, self-contained WASM ABI with zero imports.
- Supports SPD conjugate-gradient and pivoted row-sparse general/indefinite solves.
- Built with `npm.cmd run build:p8wasm`.
- Output: `src/nonlinear/equilibrium/backends/phase8_solver.wasm`.

The JavaScript adapter owns validation, CSR/CSC canonicalization, symbolic ordering/cache, allocation, diagnostics, and production/reference separation. See `docs/phase8/adr/ADR-005-INHOUSE-WASM-SPARSE.md`.
