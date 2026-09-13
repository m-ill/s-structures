# Phase 18 — STRIX remaining-case completion and missing production elements

Phase 18 closes the ten internal S-Structures capability gaps left after the first STRIX 21 case pass. External custody and third-party program execution are explicitly out of scope; every milestone is graded on a deterministic S-Structures solve, an independent numerical reference where applicable, and case-specific immutable evidence.

## Execution order

1. TH1 — Newmark average-acceleration SDOF anchor and `dt` convergence
2. SP1 — production pushover moment-hinge cantilever
3. SM6 — 3-D fixed-base pipe-frame eigenproblem
4. SM5b — eccentric rigid-diaphragm eigenvalue condensation
5. SR1 — 2-D response-spectrum frame
6. SR2 — 3-D eccentric rigid-diaphragm response spectrum
7. SR2b — 3-D L-shaped braced-frame response spectrum
8. P3S2 — wall-modal stabilization sensitivity
9. SB12 — production 6-DOF two-node elastic link
10. SH1 — production coupled zero-length P-My-Mz hinge

## Completion contract

Each case must provide:

- a non-empty canonical model or constitutive input;
- a production-engine execution path;
- locked probes, units, signs, reference values and tolerances;
- at least three byte-stable engineering-result projections;
- physical invariant checks appropriate to the case;
- regression tests that do not encode the target response inside the production solver;
- a case evidence JSON and a user-facing report.

## Architecture boundary

Benchmark values and independent reference solvers remain under `verification/`. Production code only receives reusable model types, element kernels, assembly/recovery integration and public APIs. `SB12` and `SH1` must be implemented as production modules rather than benchmark-only response calculators.

## Completion documents

- `IMPLEMENTATION_STATUS.md` — final engine/source-scope verdict
- `CODE_REVIEW_AND_MODULARITY.md` — module ownership, review fixes, remaining integration debt
- `NEXT_BENCHMARK_EXECUTION_PLAN.md` — source-lock to external cross-validation order
- `STRIX_REFERENCE_SSTRUCTURES_COMPARISON.md` — DCR 공개 STRIX / Reference와 현재 S-Structures 21개 상태 비교
- `BENCHMARK_ENGINE_EXPLANATION_PACKAGE.md` — 21개 사례별 식·모델·코드·결과 설명 패키지와 발표자료 생성 계약
