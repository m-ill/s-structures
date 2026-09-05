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
| P3-T85 | Newmark nonlinear time-history with step-level Newton iteration, energy, stability, and step-split trace | `src/nonlinear/dynamics/newmark.js` |
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
5. ground-motion scale factor, time step, NLTH row count, convergence flag, max iteration count, energy trace, step-split flag, and yielded-state flag
6. B6, B7, and B8 benchmark case status

2026-07-02 review fix: `runNewmarkNlth()` now records per-step Newton residual/correction/tangent rows and exposes overall convergence status. The `fiberNlthGate` reports `nlthConverged` and `maxIterations` so reports and AI agents can detect a nonlinear time-history step that did not satisfy the equilibrium tolerance.

2026-07-02 review update: Ground-motion records and the P3-M16 gate now expose point count, duration, period range, source PGA, target PGA, and scale factor. `buildNonlinearAnalysisTrace()` carries `spectrumScaling` beside the scaled record so reports and AI agents can audit the P3-T86 scaling basis without rebuilding it.

2026-07-02 contract review update: PMM interpolation, fiber section, moment-curvature, Newmark NLTH, and ground-motion traces now expose P3-M16 contracts. The M16 gate summary now reports agent-readiness, benchmark status, PMM point count, fiber count, curvature rows, ground-motion point count, NLTH convergence, yielded-state status, and required B6-B8 benchmarks.

2026-07-02 ticket coverage review update: `fiberNlthGate` now exposes a formal P3-M16 contract, feature-to-ticket map, and `summary.ticketCoverage` for P3-T83 to P3-T86. The coverage rows tie PMM interpolation, fiber plus moment-curvature response, Newmark/Rayleigh NLTH, and ground-motion scaling to explicit evidence, while carrying B6-B8 benchmark status for report and AI-agent audit.

2026-07-02 performance maturity review update: `fiberNlthGate` now exposes `contract.maturity` and `fiberNlthReview`. The review marks the current M16 result as a preliminary performance trace, records that distributed plasticity and production seismic qualification are still false, confirms the ground-motion scaling trace, and returns `m16-ready-for-integrated-results-review` only when PMM, fiber, moment-curvature, Rayleigh damping, ground-motion scaling, NLTH convergence, and B6-B8 benchmarks are all available.

2026-07-02 NLTH stability review update: `runNewmarkNlth()` now records kinetic energy, strain energy, cumulative input energy, cumulative damping energy, residual ratio, energy jump ratio, and a `stepSplitRecommended` flag for every time step. `fiberNlthGate.dynamics.energyTrace` and `fiberNlthReview.stepSplitRecommended` expose this stability review to reports and AI agents. A step-split recommendation is treated as a review hold even when Newton convergence succeeds.

2026-07-03 ground-motion code review update: `fiberNlthReview` now requires a usable ground-motion scaling basis, not only a truthy scale factor. The review and P3-T86 ticket coverage require record points, positive source PGA, and a finite positive scale factor. Zero-PGA or empty records are now held for review with `ground-motion-scaling` in `missing`, preventing reports or AI agents from accepting an NLTH trace whose scaling basis cannot be audited.

2026-07-03 PMM input-range review update: `interpolatePmmBackbone()` now records the requested axial ratio, the clamped axial ratio, a `clamped` flag, and a review warning when the requested ratio is outside 0 to 1. `fiberNlthReview.missing` includes `pmm-axial-ratio-input-review` when this occurs, so reports and AI agents cannot treat an extrapolated PMM input as a clean interpolation trace.

2026-07-03 PMM input-default hardening: `createPmmBackboneSet()` and `interpolatePmmBackbone()` now fall back to the default PMM level set when an API caller supplies an empty or underspecified level array. This prevents malformed optional PMM input from crashing the M16 gate before the review layer can report status.

2026-07-03 fiber/NLTH gate hardening: `fiberNlthGate.summary.readyForAgentReview` now follows `fiberNlthReview.status === "trace-ready"`. P3-T83 coverage requires the PMM interpolation review to pass, and P3-T85 coverage now fails when the NLTH energy trace recommends step splitting. Review-held M16 traces remain inspectable but cannot be treated as clean integrated-results evidence.

2026-07-03 ground-motion time-step hardening: `parseGroundMotionText()`, `scaleGroundMotion()`, and `buildSpectrumScalingTrace()` now expose review objects for record point count, source PGA, scale factor, and positive `dt`. The M16 gate treats zero or invalid time-step input as a P3-T86 review hold, so an NLTH trace cannot pass ground-motion scaling coverage unless the record timing is auditable.

2026-07-03 NLTH input hardening: `runNewmarkNlth()` now exposes `inputReview` for dt, mass, stiffness, tolerance, maximum iterations, acceleration record count, and invalid acceleration values. `fiberNlthReview` holds P3-T85 with `nlth-input-review` when these inputs are invalid, so fallback calculation values cannot make an invalid NLTH setup appear ready for integrated results.

## Current Test Gate

`tests/p3-m16-nonlinear-fiber-nlth.mjs` verifies PMM interpolation, empty PMM level fallback, PMM axial-ratio range review holds, PMM ticket blocking, member-derived PMM backbone generation, material-backbone stress interpolation, member-derived fiber section generation, fiber strain force recovery, moment-curvature comparison, Rayleigh damping targets, ground-motion scaling basis, zero-PGA and invalid-dt scaling review holds, spectrum-scaling trace exposure, Newmark NLTH yielded trace, NLTH input review holds, per-step Newton iteration logs, energy/stability rows, step-split recommendation behavior and ticket blocking, B6/B7/B8 benchmark registration, and agent manifest exposure.

## Remaining Limits

P3-M16 remains preliminary. It now consumes material nonlinear backbone data in fiber traces and can generate PMM/fiber traces from model members, but it is still a concentrated-plasticity trace core rather than distributed plasticity or full production seismic qualification. Soil-structure interaction and field-calibrated nonlinear material libraries remain outside this gate.

2026-07-03 engineering-validation update: `getPhase3EngineeringValidationReview` now records nonlinear benchmark certification, hinge equilibrium, PMM/fiber, and NLTH qualification evidence separately from the automated P3-M16 trace. This keeps production nonlinear solver approval outside the synthetic/trace regression result until an engineer accepts the validation package.

2026-07-03 project-evidence bridge update: Accepted project evidence rows for nonlinear solver certification and hinge/fiber/NLTH qualification are now converted into `getPhase3EngineeringValidationReview()` nonlinear evidence rows. This lets AI agents see uploaded engineering-validation records without treating automated nonlinear trace readiness as final production solver approval.

2026-07-03 executable review update: `node tests/p3-nonlinear-milestone-review.mjs` now locks the P3-M14 to P3-M16 nonlinear milestone review contract. The Phase 3 runner includes this check in the P3-M16 group so N1 to N6 scope, B1 to B8 benchmark coverage, gate paths, and final approval fields remain agent-readable and separate from production engineering sign-off.

2026-07-03 nonlinear exit-criteria review update: `getPhase3NonlinearMilestoneReview()` now exposes N1 to N6 and B1 to B8 plan coverage as `exitCriteria` rows. Each row records the `NONLINEAR_ENGINE_PLAN.md` source, related ticket, requirement text, and automated evidence file, so AI agents can distinguish trace-covered nonlinear scope from production solver, hinge-equilibrium, distributed-plasticity, and seismic-qualification sign-off.
