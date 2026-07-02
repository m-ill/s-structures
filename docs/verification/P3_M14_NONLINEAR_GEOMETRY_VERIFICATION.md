# P3-M14 Nonlinear Geometry Verification

date: 2026-07-02
status: preliminary core locked

## Scope

This note verifies P3-M14 against `docs/phase3/NONLINEAR_ENGINE_PLAN.md` tickets P3-T50 to P3-T53.

## Verified Items

| Ticket | Plan item | Evidence |
| --- | --- | --- |
| P3-T50 | Nonlinear analysis state and restart-safe snapshot | `src/nonlinear/state.js`, `snapshotAnalysisState()` |
| P3-T51 | Corotational beam, geometric stiffness trace, and tangent assembly | `src/nonlinear/elements/corotationalBeam.js`, `src/nonlinear/assembly.js` |
| P3-T52 | Newton-Raphson, global residual trace, line search candidate trace, convergence log | `src/nonlinear/control/newtonRaphson.js`, `globalEquilibrium.js`, `convergence.js` |
| P3-T53 | B1/B2 geometry benchmark gate | `runNonlinearGeometryBenchmarks()` |
| Agent trace | `getNonlinearAnalysisTrace()` includes `geometryGate` |

## Added Review Finding

The M14 pieces existed but were spread across state, element, convergence, and benchmark modules. P3-M14 now exposes `NONLINEAR_GEOMETRY_TRACE_VERSION`, a compact geometry gate for AI agents and reports.

The gate records:

1. state and Newton-Raphson contract versions
2. convergence log with line-search usage, candidate alpha rows, residual norms, accepted alpha, and reason
3. KE/KG/hinge tangent assembly summary for AI-readable diagnostics
4. required B1/B2 benchmark cases
5. reduced-DOF global residual Newton trace for agent inspection
6. explicit limitations separating M14 from later certified production equilibrium, fiber, and time-history milestones

## Current Test Gate

2026-07-02 review fix: Newton-Raphson line-search now records evaluated alpha candidates and accepted residual norms per iteration. This gives reports and AI agents enough data to explain whether convergence used full Newton steps or damped steps.

2026-07-02 review update: Added the explicit P3-M14 load-control trace module required by `NONLINEAR_ENGINE_PLAN.md`. `buildLoadControlTrace()` records lambda increments, Newton convergence status, iteration count, final state snapshot, and limitations, and `geometryGate.contracts.loadControl` now exposes the contract version for reports and AI agents.

2026-07-02 contract review update: `buildLoadControlTrace()` now exposes a P3-M14 contract and summary with step count, converged step count, final load factor, and maximum iteration count. `geometryGate.contracts` now includes the convergence contract version, and `geometryGate.summary` exposes benchmark, convergence, load-control, and tangent-assembly readiness for agent/API review.

2026-07-02 ticket coverage review update: `geometryGate` now exposes a formal P3-M14 contract, feature-to-ticket map, and `summary.ticketCoverage` for P3-T50 to P3-T53. The coverage rows tie state snapshots, corotational KE/KG tangent assembly, Newton/load-control convergence, and B1/B2 benchmarks to explicit evidence so reports and AI agents can audit the milestone without inferring intent from module names.

2026-07-02 solver maturity review update: `geometryGate` now exposes `contract.maturity` and `solverReview`. The review explicitly marks P3-M14 as a preliminary trace core, records that production global equilibrium certification is still false, and returns an `agentDecision` of `m14-ready-for-m15-review` only when tangent assembly, Newton convergence, load control, and B1/B2 benchmarks are all present.

2026-07-02 global residual review update: `runGlobalEquilibriumTrace()` now reduces the tangent matrix to active DOFs, solves `K*du = residual`, records residual/displacement/energy norms, and exposes the rows through `geometryGate.globalEquilibrium`. `solverReview.globalResidualAssembly` is now `reduced-dof-newton-trace`; `productionEquilibriumSolver` remains false until the trace is hardened into a certified nonlinear frame solver.

2026-07-03 load-control code review update: `buildLoadControlTrace()` now treats the Newton result as an accepted control value and stores only the increment into the next state. This fixes the previous accumulation bug where absolute accepted values could be added as displacement increments. Failed increments are recorded but not accepted into `lambda` or displacement, and the trace stops unless `continueOnFailure` is explicitly enabled. Each row records a `stateSnapshot`, matching the P3-M14 convergence contract.

2026-07-03 restart-safety hardening: `createAnalysisState()`, `snapshotAnalysisState()`, and `advanceAnalysisState()` now deep-copy hinge rows and event rows. This prevents later path-dependent hinge history mutation from changing prior accepted states or snapshots, which is required before M15/M16 hinge/fiber history can rely on M14 state restart records.

`tests/p3-m14-nonlinear-geometry.mjs` verifies state snapshots, restart-safe hinge/event copies, corotational beam state, geometric stiffness, nonlinear tangent assembly, convergence norms, Newton-Raphson line-search candidate trace, reduced-DOF global equilibrium trace, load-control trace, B1/B2 benchmarks, and agent trace exposure.

## Remaining Limits

P3-M14 remains preliminary. It now has a tangent assembly trace and a reduced-DOF global residual Newton trace, but it is not yet a certified production nonlinear frame solver. Full material hinge control, PMM, fiber, and nonlinear time-history behavior remain P3-M15 to P3-M16 scope.
