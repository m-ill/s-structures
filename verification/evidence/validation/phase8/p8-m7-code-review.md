# P8-M7 Code Review

- Review date: 2026-07-13
- Scope: Crisfield arc-length, displacement handoff, cyclic static protocol, compute-backend policy, production Pushover continuation
- Outcome: PASS with explicit GPU and bifurcation qualification limits

## Resolved Findings

| Severity | Finding | Resolution |
| --- | --- | --- |
| P0 | Legacy arc-length code only checked a prepared path and did not solve the augmented global system | Added a spherical-constraint predictor/corrector that assembles and solves the current MDOF tangent/reference-load augmented matrix |
| P0 | A failed cyclic target could retain accepted substeps from the incomplete segment | Added protocol-segment rollback to the immutable segment-start state and trims uncommitted path, reversal, and material events |
| P0 | M5 handoff lacked the incoming path direction | Handoff v2 now records hashed `deltaQ` and `deltaLambda` from the last two committed displacement-control states |
| P0 | Production Pushover advertised no executable post-peak continuation | Added opt-in `arcLength.enabled` execution that consumes the exact M5 checkpoint, recovers accepted arc steps, and reports arc failure as the requested run failure |
| P1 | Root selection could reverse to the opposite path after a limit point | Predictor candidates are ranked by generalized inner product with the previous accepted increment and deterministic tie breaks |
| P1 | Load and displacement terms had no explicit scale contract | Added versioned translational/rotational weights, characteristic length, load scale `alpha`, and persisted scaling hash |
| P1 | Arc radius was fixed and retry state was implicit | Added iteration-based bounded adaptation, failure cutback, minimum radius, restart checkpoint, and persisted next radius |
| P1 | Indefinite solve behavior was not inspectable | Accepted iterations retain backend matrix class, pivots, residual, line-search, and augmented linear closure diagnostics |
| P1 | Cyclic load-controlled segments integrated only their endpoints | Load control now exposes every accepted evaluation and cyclic work integration consumes each accepted state |
| P1 | A malformed accepted evaluation could throw during cyclic work integration instead of returning a rollback-safe result | Both displacement- and load-controlled path integration now return a structured failure and restore the protocol-segment boundary; a vector-mismatch regression verifies byte-equivalent rollback |
| P1 | A hold target could be misclassified as a reversal | Hold points now have zero path direction and cannot create a reversal event |
| P1 | Energy normalization treated `null` as numeric zero before named-energy fallback | Finite-value selection now excludes nullish entries |
| P1 | GPU requests had no capability boundary | Added explicit `auto/cpu/wasm/gpu` policy, opt-in enable flag, precision/determinism metadata, and fail-closed production qualification |

## Reviewed Boundaries

- Arc-length uses `deltaQ^T W deltaQ + alpha^2 deltaLambda^2 = radius^2`; the augmented corrector enforces global equilibrium and the spherical constraint in the same iteration.
- Predictor sign continuity is based on the previous committed increment. Checkpoint restoration is byte-equivalent before the first predictor, and continuous/split runs produce identical committed state and event history.
- The von Mises verification uses two actual 3D corotational truss elements in the canonical domain. Accepted load factors are compared pointwise with an independently evaluated two-bar geometry equation; no expected path array is supplied to the solver.
- Cyclic static preserves hinge/fiber element states through ordinary committed/trial contracts. Target, reversal, residual deformation, loop energy, degradation, and deterministic restart are separately verified.
- Path warnings based on a small pivot ratio are screening only. They do not claim eigenvalue bifurcation classification or automatic branch switching.
- Dense reference execution remains limited to small verification models. Production continuation requires the repository's general/indefinite backend and never silently falls back to dense.
- GPU execution is not implemented in M7. The solver accepts a future backend through the same contract, but a GPU request fails unless the supplied backend is explicitly enabled; production additionally requires deterministic float64 qualification.

## Regression Gate

- `node tools/run-phase8-tests.mjs M7`: PASS, including `NL-ARC-01`~`10` and `NL-CYC-01`~`06`.
- `npm run test:p8`: PASS for P8-M0~P8-M7; M7 was rerun after the final rollback guard.
- `node tools/run-phase7-tests.mjs`: PASS for the complete Phase 7 modeling and elastic-analysis contract set.
- `node tools/run-milestone-tests.mjs`: PASS for all 114 existing product milestones.
- Agent contract and documentation reference-integrity checks: PASS (`60` documents, `413` references).

## Deferred By Design

- Automatic bifurcation eigenvector extraction and alternate-branch switching are outside M7; near-singular paths emit a qualified warning.
- GPU kernels, WebGPU sparse factorization, and CPU/GPU parity evidence require a separate performance ADR and qualification suite. The current API seam is not reported as GPU acceleration.
- Full Phase 7 model feature closure and result provenance are P8-M9.
- User-facing arc/cyclic setup, charts, failure recovery, and Agent workflow are P8-M10.
- External commercial solver correlation, representative-model performance, and pilot acceptance remain P8-M11, so all M7 results remain `candidate` and design transfer stays blocked.
