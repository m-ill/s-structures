# ADR-007: Gravity-Preloaded Displacement Control and Arc-Length Handoff

- Status: Accepted
- Date: 2026-07-13
- Milestone: P8-M5

## Context

The legacy Pushover path reduces secant stiffness between linear solves. It does not enforce the lateral control displacement and global equilibrium in the same iteration. A production candidate also needs an immutable gravity predecessor that is independent of the selected lateral pattern.

## Decision

1. Gravity is solved by MDOF load control on a gravity-only canonical domain. Its standard analysis run record, committed-state hash, and checkpoint hash are mutually linked.
2. A lateral case may reuse the gravity checkpoint only after run, state, checkpoint, structural-domain, and equilibrium audits pass. The committed state is then rebound to the lateral domain without importing trial state.
3. The Pushover pattern is a signed nodal translational reference load. Uniform, triangular, modal, and explicit user patterns are normalized to a declared reference base shear.
4. Displacement control solves the nonsymmetric augmented system

   ```text
   [ Kt  -dR/dlambda ] [dq     ] = [R]
   [ cT       0      ] [dlambda]   [g]
   ```

   with two-sided equilibration, physical-solution recovery, and an unscaled residual check.
5. P8-M5 accepts only nodal translational reference-load derivatives. Reference member loads, follower loads, and nodal moments fail closed.
6. Rejected Newton, line-search, event-localization, or cutback trials are rolled back and never enter the capacity curve.
7. Canonical base shear is the support-reaction increment from the gravity baseline. Applied lateral shear is retained separately for closure audit.
8. P8-M5 emits an exact committed `q`, `lambda`, element-state, event cursor, and checkpoint handoff for P8-M7. It does not claim that arc-length continuation is implemented.

## Branch Policy

- Continue displacement control while the target path is stable and convergent.
- Localize accepted hinge transitions by displacement-increment cutback.
- Stop on an explicit mechanism set, requested target, post-peak threshold, cancellation, minimum increment, or nonconvergence.
- Preserve the last accepted checkpoint for every failed or handoff termination.
- P8-M7 must consume the handoff checkpoint byte-equivalently before its first predictor. `NL-PUSH-13` in M5 verifies handoff completeness and reproducibility; continuation accuracy remains an M7 gate.

## Consequences

- The formal Pushover engine is separate from the legacy secant engine and remains `candidate`/`designBlocked` until later independent qualification.
- Gravity states can be shared by compatible directional Pushover cases without coupling their identity to a lateral pattern or output policy.
- The implementation uses the repository's in-house numerical backend and standard JavaScript runtime. No commercial solver or licensed numerical library is introduced.
