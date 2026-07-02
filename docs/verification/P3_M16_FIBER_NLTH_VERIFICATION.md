# P3-M16 Fiber NLTH Verification

date: 2026-07-02
status: preliminary core locked

## Scope

This note verifies P3-M16 against `docs/phase3/NONLINEAR_ENGINE_PLAN.md` tickets P3-T83 to P3-T86.

## Verified Items

| Ticket | Plan item | Evidence |
| --- | --- | --- |
| P3-T83 | PMM interaction hinge interpolation | `src/nonlinear/hinges/pmmHinge.js` |
| P3-T84 | RC/steel fiber section, material-backbone consumption, and moment-curvature trace | `src/nonlinear/fiber/fiberSection.js`, `momentCurvature.js` |
| P3-T85 | Newmark nonlinear time-history with step-level Newton iteration trace | `src/nonlinear/dynamics/newmark.js` |
| P3-T86 | Ground-motion record parsing and scaling trace | `src/nonlinear/dynamics/groundMotion.js` |
| Damping | Rayleigh coefficient trace | `src/nonlinear/dynamics/rayleigh.js` |
| Agent trace | `getNonlinearAnalysisTrace()` includes `fiberNlthGate` |

## Added Review Finding

The M16 pieces existed but were not summarized as a milestone-level contract. P3-M16 now exposes `NONLINEAR_FIBER_NLTH_TRACE_VERSION` and a compact fiber/NLTH gate for reports and AI agents.

The gate records:

1. PMM, fiber section, moment-curvature, Newmark, Rayleigh, and ground-motion contract versions
2. PMM interpolation source range and point count
3. PMM source member/material/section when generated from a model member
4. fiber count, material-backbone count, curvature row count, and yield-moment summary
5. ground-motion scale factor, time step, NLTH row count, convergence flag, max iteration count, and yielded-state flag
6. B6, B7, and B8 benchmark case status

2026-07-02 review fix: `runNewmarkNlth()` now records per-step Newton residual/correction/tangent rows and exposes overall convergence status. The `fiberNlthGate` reports `nlthConverged` and `maxIterations` so reports and AI agents can detect a nonlinear time-history step that did not satisfy the equilibrium tolerance.

2026-07-02 review update: Ground-motion records and the P3-M16 gate now expose point count, duration, period range, source PGA, target PGA, and scale factor. `buildNonlinearAnalysisTrace()` carries `spectrumScaling` beside the scaled record so reports and AI agents can audit the P3-T86 scaling basis without rebuilding it.

2026-07-02 contract review update: PMM interpolation, fiber section, moment-curvature, Newmark NLTH, and ground-motion traces now expose P3-M16 contracts. The M16 gate summary now reports agent-readiness, benchmark status, PMM point count, fiber count, curvature rows, ground-motion point count, NLTH convergence, yielded-state status, and required B6-B8 benchmarks.

## Current Test Gate

`tests/p3-m16-nonlinear-fiber-nlth.mjs` verifies PMM interpolation, member-derived PMM backbone generation, material-backbone stress interpolation, member-derived fiber section generation, fiber strain force recovery, moment-curvature comparison, Rayleigh damping targets, ground-motion scaling basis, spectrum-scaling trace exposure, Newmark NLTH yielded trace, per-step Newton iteration logs, B6/B7/B8 benchmark registration, and agent manifest exposure.

## Remaining Limits

P3-M16 remains preliminary. It now consumes material nonlinear backbone data in fiber traces and can generate PMM/fiber traces from model members, but it is still a concentrated-plasticity trace core rather than distributed plasticity or full production seismic qualification. Soil-structure interaction and field-calibrated nonlinear material libraries remain outside this gate.
