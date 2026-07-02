# P3-M15 Hinge Control Verification

date: 2026-07-02
status: preliminary core locked

## Scope

This note verifies P3-M15 against `docs/phase3/NONLINEAR_ENGINE_PLAN.md` tickets P3-T54 to P3-T56.

## Verified Items

| Ticket | Plan item | Evidence |
| --- | --- | --- |
| P3-T54 | Moment-rotation hinge backbone, assignment, and state trace | `src/nonlinear/hinges/momentHinge.js`, `src/nonlinear/hinges/hingeAssign.js` |
| P3-T55 | Displacement control and Crisfield arc-length trace | `src/nonlinear/control/displacementControl.js`, `arcLength.js` |
| P3-T56 | Formal pushover result, control trace, regression trace, and B4/B5 link | `src/nonlinear/pushoverFormal.js` |
| Agent trace | `getNonlinearAnalysisTrace()` includes `hingeControlGate` |

## Added Review Finding

The M15 pieces existed, but the agent-readable milestone gate was weaker than M14. P3-M15 now exposes `NONLINEAR_HINGE_CONTROL_TRACE_VERSION` and a compact hinge/control gate.

The gate records:

1. hinge, displacement-control, arc-length, and formal pushover contract versions
2. hinge backbone point IDs, state rows, and event transitions
3. displacement and arc-length control step summaries with post-peak tracking
4. B3, B4, and B5 benchmark case status
5. member-end hinge assignment summary and tangent assembly correction count
6. formal pushover control trace and optional baseline regression summary
7. explicit limitations separating M15 from PMM, fiber, and nonlinear time-history scope

## Formal Pushover Fix

`runFormalPushover()` now propagates step-level `hingeEvents` and a top-level `hingeEvents` list. Reports and AI agents can identify the first step where yielded or ultimate member counts increase.

2026-07-02 review fix: formal pushover now includes `control` metadata with control type, pattern, direction, target displacement, stop reason, and final response. It also accepts a baseline capacity curve and returns a regression summary for B5-style pushover comparison.

2026-07-02 review update: `PUSHOVER_VERSION` is now promoted to `p3-m15-pushover-formal` as required by `NONLINEAR_ENGINE_PLAN.md`. The former linear reanalysis path remains visible as `sourceVersion`, so old UI and agent calls keep their signature while reports can distinguish the formal P3-M15 contract from the underlying preliminary source path.

2026-07-02 contract review update: displacement-control and arc-length traces now expose P3-M15 contracts and compact summaries. Formal pushover now exposes a P3-M15 contract plus capacity-curve, hinge-event, first-yield, first-ultimate, and stop-reason summary fields. `hingeControlGate.summary` now reports benchmark, hinge-event, assigned-hinge, post-peak, pushover, and required benchmark readiness for API and AI-agent review.

2026-07-02 ticket coverage review update: `hingeControlGate` now exposes a formal P3-M15 contract, feature-to-ticket map, and `summary.ticketCoverage` for P3-T54 to P3-T56. The coverage rows tie hinge state/assignment, displacement plus arc-length controls, and formal pushover with B4/B5 benchmark evidence to explicit rows for report and AI-agent audit.

2026-07-02 control maturity review update: `hingeControlGate` now exposes `contract.maturity` and `controlReview`. The review marks the current M15 result as a preliminary formal contract, records that a production hinge-equilibrium loop is still false, confirms whether hinge tangent corrections are visible, and returns `m15-ready-for-m16-review` only when hinge trace, assignment, displacement/arc-length control, formal pushover, and B3-B5 benchmarks are all available.

## Current Test Gate

`tests/p3-m15-nonlinear-hinge-control.mjs` verifies M-theta backbone creation, member-end hinge assignment from material nonlinear backbone data, hinge state events, displacement-control increments, arc-length post-peak path tracking, formal pushover output, formal/source version separation, control stop reason, regression summary, B3/B4/B5 benchmark registration, tangent assembly correction exposure, and agent manifest exposure.

## Remaining Limits

P3-M15 remains preliminary. It now feeds concentrated hinge tangent corrections into the tangent assembly trace, but it does not yet run a full hinge-controlled global nonlinear equilibrium loop. PMM interaction, fiber section response, and nonlinear time-history remain P3-M16 scope.
