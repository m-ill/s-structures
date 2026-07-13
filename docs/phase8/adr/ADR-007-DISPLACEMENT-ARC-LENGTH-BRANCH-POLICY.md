# ADR-007: Gravity-Preloaded Displacement Control and Arc-Length Handoff

- Status: Accepted
- Date: 2026-07-13
- Milestone: P8-M5 / P8-M7

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
8. P8-M5 emits an exact committed `q`, `lambda`, element-state, event cursor, checkpoint, and the last accepted `deltaQ/deltaLambda` for P8-M7.
9. P8-M7 solves the Crisfield spherical constraint

   ```text
   deltaQ^T W deltaQ + alpha^2 deltaLambda^2 = radius^2
   ```

   together with current-step global equilibrium in a pivoted general augmented system.
10. The initial predictor selects between positive and negative roots by generalized inner product with the previous committed increment. Ties use a deterministic requested-direction rule.
11. Radius adaptation is bounded and iteration-count based. A failed corrector rolls the whole trial branch back before radius cutback.
12. A restart restores the exact checkpoint, previous increment, next radius, element history, and event sequence before another predictor.
13. Cyclic static uses the same displacement/load controllers and committed element states. A failed target rolls back the entire protocol segment, including accepted substeps and observational events.
14. Near-bifurcation classification is a pivot-ratio warning only. M7 does not claim eigenvalue branch switching.

## Branch Policy

- Continue displacement control while the target path is stable and convergent.
- Localize accepted hinge transitions by displacement-increment cutback.
- Stop on an explicit mechanism set, requested target, post-peak threshold, cancellation, minimum increment, or nonconvergence.
- Preserve the last accepted checkpoint for every failed or handoff termination.
- P8-M7 consumes the handoff checkpoint byte-equivalently before its first predictor. `NL-ARC-09/10` verify restart and production handoff continuity.
- Continue the selected branch by increment inner-product continuity across load and displacement sign reversals.
- Treat alternate-branch selection as a separate eigenvalue/bifurcation feature; never infer it from a small pivot alone.

## Consequences

- The formal Pushover engine is separate from the legacy secant engine and remains `candidate`/`designBlocked` until later independent qualification.
- Gravity states can be shared by compatible directional Pushover cases without coupling their identity to a lateral pattern or output policy.
- The implementation uses the repository's in-house numerical backend and standard JavaScript runtime. No commercial solver or licensed numerical library is introduced.
- GPU is an optional backend target, not an implemented solver in M7. A request fails closed unless an explicitly enabled backend satisfies the declared precision/determinism policy; production requires deterministic float64 until another policy is independently qualified.
