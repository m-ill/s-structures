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
| P3-T52 | Newton-Raphson, line search candidate trace, convergence log | `src/nonlinear/control/newtonRaphson.js`, `convergence.js` |
| P3-T53 | B1/B2 geometry benchmark gate | `runNonlinearGeometryBenchmarks()` |
| Agent trace | `getNonlinearAnalysisTrace()` includes `geometryGate` |

## Added Review Finding

The M14 pieces existed but were spread across state, element, convergence, and benchmark modules. P3-M14 now exposes `NONLINEAR_GEOMETRY_TRACE_VERSION`, a compact geometry gate for AI agents and reports.

The gate records:

1. state and Newton-Raphson contract versions
2. convergence log with line-search usage, candidate alpha rows, residual norms, accepted alpha, and reason
3. KE/KG/hinge tangent assembly summary for AI-readable diagnostics
4. required B1/B2 benchmark cases
5. explicit limitations separating M14 from later full equilibrium, fiber, and time-history milestones

## Current Test Gate

2026-07-02 review fix: Newton-Raphson line-search now records evaluated alpha candidates and accepted residual norms per iteration. This gives reports and AI agents enough data to explain whether convergence used full Newton steps or damped steps.

2026-07-02 review update: Added the explicit P3-M14 load-control trace module required by `NONLINEAR_ENGINE_PLAN.md`. `buildLoadControlTrace()` records lambda increments, Newton convergence status, iteration count, final state snapshot, and limitations, and `geometryGate.contracts.loadControl` now exposes the contract version for reports and AI agents.

`tests/p3-m14-nonlinear-geometry.mjs` verifies state snapshots, corotational beam state, geometric stiffness, nonlinear tangent assembly, convergence norms, Newton-Raphson line-search candidate trace, load-control trace, B1/B2 benchmarks, and agent trace exposure.

## Remaining Limits

P3-M14 remains preliminary. It now has a tangent assembly trace, but it is not yet a full nonlinear frame solver with global equilibrium iterations. Full material hinge control, PMM, fiber, and nonlinear time-history behavior remain P3-M15 to P3-M16 scope.
