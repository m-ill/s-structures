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
| P3-T56 | Formal pushover result, stepwise hinge-degraded stiffness trace, control trace, regression trace, and B4/B5 link | `src/nonlinear/pushover.js`, `src/nonlinear/pushoverFormal.js` |
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
7. previous-step hinge secant stiffness reduction trace
8. explicit limitations separating M15 from PMM, fiber, and nonlinear time-history scope

## Formal Pushover Fix

`runFormalPushover()` now propagates step-level `hingeEvents` and a top-level `hingeEvents` list. Reports and AI agents can identify the first step where yielded or ultimate member counts increase.

2026-07-02 review fix: formal pushover now includes `control` metadata with control type, pattern, direction, target displacement, stop reason, and final response. It also accepts a baseline capacity curve and returns a regression summary for B5-style pushover comparison.

2026-07-02 review update: `PUSHOVER_VERSION` is now promoted to `p3-m15-pushover-formal` as required by `NONLINEAR_ENGINE_PLAN.md`. The former linear reanalysis path remains visible as `sourceVersion`, so old UI and agent calls keep their signature while reports can distinguish the formal P3-M15 contract from the underlying preliminary source path.

2026-07-02 contract review update: displacement-control and arc-length traces now expose P3-M15 contracts and compact summaries. Formal pushover now exposes a P3-M15 contract plus capacity-curve, hinge-event, first-yield, first-ultimate, and stop-reason summary fields. `hingeControlGate.summary` now reports benchmark, hinge-event, assigned-hinge, post-peak, pushover, and required benchmark readiness for API and AI-agent review.

2026-07-02 ticket coverage review update: `hingeControlGate` now exposes a formal P3-M15 contract, feature-to-ticket map, and `summary.ticketCoverage` for P3-T54 to P3-T56. The coverage rows tie hinge state/assignment, displacement plus arc-length controls, and formal pushover with B4/B5 benchmark evidence to explicit rows for report and AI-agent audit.

2026-07-02 control maturity review update: `hingeControlGate` now exposes `contract.maturity` and `controlReview`. The review marks the current M15 result as a preliminary formal contract, records that a production hinge-equilibrium loop is still false, confirms whether hinge tangent corrections are visible, and returns `m15-ready-for-m16-review` only when hinge trace, assignment, displacement/arc-length control, formal pushover, and B3-B5 benchmarks are all available.

2026-07-03 B5 regression hardening: `runPushoverRegressionBenchmark()` now uses a fixed representative portal-frame baseline by default instead of comparing the current pushover result to itself. `comparePushoverRegression()` also reports current/baseline step counts and `stepCountMismatch`, and the B5 benchmark fails if the curve length or base-shear/roof-displacement values differ. This keeps the P3 plan requirement for a fixed pushover regression gate meaningful for reports and AI-agent review.

2026-07-02 secant stiffness review update: `runPushover()` now carries the previous accepted hinge state into the next load step by generating member-specific degraded section records. The formal pushover result exposes `hingeDegradation.trace`, per-step `degradedMemberCount`, `minStiffnessFactor`, and `method.stiffnessUpdate = previous-step-hinge-secant-stiffness`. This closes the earlier gap where hinge state was only reported after each linear step. It remains preliminary because the reduction is a previous-step secant update, not a simultaneous global hinge equilibrium loop.

2026-07-02 agent-manifest alignment update: the agent capability manifest now uses the same wording as the formal pushover trace. It no longer states that pushover lacks hinge-degradation stiffness rebuilding; instead, it states that previous-step secant degradation is traced while simultaneous hinge-controlled global equilibrium remains non-production.

2026-07-03 hinge-state code review update: `evaluateMomentHinge()` now keeps zero rotation at point A with `elastic` state, and interpolated segment states remain on the active lower branch until the next hinge point is reached. This fixes the previous issue where a zero-rotation hinge row could be reported as yielded. `assignMemberHinges()` also now selects the first positive material nonlinear backbone point as the yield point, so `{rotation: 0, moment: 0}` seed rows no longer mask the real material yield row.

2026-07-03 displacement-control review hardening: `buildDisplacementControlTrace()` now exposes step-level and trace-level review objects. A zero or invalid control influence is recorded as `invalid-displacement-control-influence`, and `hingeControlGate.controlReview.missing` includes `displacement-control-input-review`. This keeps AI agents from treating fallback load-factor increments as a clean displacement-control trace.

2026-07-03 pushover failure-gate hardening: formal pushover now reports `ok: false` when the control trace stops with `STEP_FAILED`. `hingeControlGate` also treats `PUSHOVER_STEP_FAILED`, `STEP_FAILED`, or nonconverged pushover steps as `formal-pushover-step-failure`, so partial capacity curves cannot advance to M16 review as clean M15 evidence.

2026-07-03 hinge-control gate hardening: `hingeControlGate.summary.readyForAgentReview` now follows `controlReview.status === "trace-ready"` instead of always returning true. P3-T55 coverage also requires displacement-control input review to pass and all arc-length steps to satisfy the constraint, so invalid control input remains inspectable but cannot be treated as clean M15 evidence.

2026-07-03 arc-length input hardening: `buildArcLengthTrace()` now exposes step-level and trace-level review objects. Invalid alpha, invalid radius, or unsatisfied spherical constraints are recorded as review warnings, and `hingeControlGate.controlReview.missing` includes `arc-length-input-review`. P3-T55 coverage now requires both displacement-control and arc-length reviews to pass before M16 handoff can be marked trace-ready.

## Current Test Gate

`tests/p3-m15-nonlinear-hinge-control.mjs` verifies M-theta backbone creation, zero-rotation elastic state, member-end hinge assignment from material nonlinear backbone data, material yield-point extraction, hinge state events, displacement-control increments and input review holds, arc-length post-peak path tracking plus invalid-input review holds, formal pushover output, formal/source version separation, stepwise hinge degradation trace, control stop reason, pushover step-failure review holds, invalid-control ticket blocking, regression summary, B3/B4/B5 benchmark registration, tangent assembly correction exposure, and agent manifest exposure. `tests/m16-agent-capabilities.mjs` also guards the manifest limitation text against reverting to the old no-degradation wording.

## Remaining Limits

P3-M15 remains preliminary. It now feeds concentrated hinge tangent corrections into the tangent assembly trace and carries previous-step hinge stiffness reductions through formal pushover, but it does not yet run a full simultaneous hinge-controlled global nonlinear equilibrium loop. PMM interaction, fiber section response, and nonlinear time-history remain P3-M16 scope.
