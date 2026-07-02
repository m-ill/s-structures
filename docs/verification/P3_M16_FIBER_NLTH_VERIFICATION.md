# P3-M16 Fiber NLTH Verification

date: 2026-07-02
status: preliminary core locked

## Scope

This note verifies P3-M16 against `docs/phase3/NONLINEAR_ENGINE_PLAN.md` tickets P3-T83 to P3-T86.

## Verified Items

| Ticket | Plan item | Evidence |
| --- | --- | --- |
| P3-T83 | PMM interaction hinge interpolation | `src/nonlinear/hinges/pmmHinge.js` |
| P3-T84 | RC/steel fiber section and moment-curvature trace | `src/nonlinear/fiber/fiberSection.js`, `momentCurvature.js` |
| P3-T85 | Newmark nonlinear time-history with step trace | `src/nonlinear/dynamics/newmark.js` |
| P3-T86 | Ground-motion record parsing and scaling trace | `src/nonlinear/dynamics/groundMotion.js` |
| Damping | Rayleigh coefficient trace | `src/nonlinear/dynamics/rayleigh.js` |
| Agent trace | `getNonlinearAnalysisTrace()` includes `fiberNlthGate` |

## Added Review Finding

The M16 pieces existed but were not summarized as a milestone-level contract. P3-M16 now exposes `NONLINEAR_FIBER_NLTH_TRACE_VERSION` and a compact fiber/NLTH gate for reports and AI agents.

The gate records:

1. PMM, fiber section, moment-curvature, Newmark, Rayleigh, and ground-motion contract versions
2. PMM interpolation source range and point count
3. fiber count, curvature row count, and yield-moment summary
4. ground-motion scale factor, time step, NLTH row count, and yielded-state flag
5. B6, B7, and B8 benchmark case status

## Current Test Gate

`tests/p3-m16-nonlinear-fiber-nlth.mjs` verifies PMM interpolation, fiber strain force recovery, moment-curvature comparison, Rayleigh damping targets, ground-motion scaling, Newmark NLTH yielded trace, B6/B7/B8 benchmark registration, and agent manifest exposure.

## Remaining Limits

P3-M16 remains preliminary. It is a concentrated-plasticity trace core, not distributed plasticity or full production seismic qualification. Soil-structure interaction and field-calibrated nonlinear material libraries remain outside this gate.
