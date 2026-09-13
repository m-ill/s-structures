# ADR-012: Phase 8 Qualification and Release Gate

## Status

Accepted for implementation on 2026-07-14. The current release decision is `candidate` and design transfer is blocked.

## Context

Phase 8 has production Pushover and MDOF NLTH engines, but successful execution is not sufficient evidence for structural design use. The final milestone needs to distinguish reference-code checks, measured runtime behavior, reproducible pilot execution, independent numerical comparison, owner review, and release approval.

## Decision

1. Independent closed-form and separate reference code stays isolated from production element, assembly, equilibrium, sparse-solver, and recovery implementations.
2. Production performance is measured through the deterministic f64 WASM sparse backend. Kernel timing is labeled separately from end-to-end frame timing.
3. Parallel determinism uses two independent Worker threads and compares result hashes and event ordering.
4. Five versioned pilot packages run through the production Pushover/NLTH entry points. Required result channels are checked, not merely the terminal status.
5. Unsupported unilateral members fail closed with `NONLINEAR_UNILATERAL_ACTIVE_SET_UNSUPPORTED`.
6. External comparisons must include channel-aligned actual and reference values. Absolute and relative errors are recomputed by the release tool; metadata alone cannot pass.
7. Pilot reproducibility and independent pilot qualification are separate. Reproducible candidates remain design-blocked until numerical comparison and owner sign-off pass.
8. Q5 requires Q1-Q4, all M0-M10 evidence, five independently qualified pilots, a completed review, and zero open Critical/High findings.
9. The release manifest excludes generation time from its integrity hash but includes source revision and every evidence hash.
10. Missing evidence never selects a legacy, dense, CPU, GPU, or preliminary fallback.

## Consequences

- M11 implementation can be complete while release acceptance remains blocked.
- Current `productionPushover` and `productionNlth` capabilities remain `candidate` with `designBlocked:true`.
- `NL-PERF-02/07/12/13` remain blocked pending approved M-tier and browser measurements.
- `NL-PILOT-01~05` remain blocked pending independent comparisons and owner approvals, even though all five input-to-report artifacts are reproducible.
- A future qualification run can promote only the evidence-backed feature scope; it cannot promote unsupported features by implication.
