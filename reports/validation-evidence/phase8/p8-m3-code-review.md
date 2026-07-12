# P8-M3 Code Review

```yaml
reviewed_at: 2026-07-12
milestone: P8-M3
status: PASS
critical_findings_open: 0
high_findings_open: 0
independent_review_rounds: 2
```

## Corrected Findings

1. Replaced the old direction-vector corotational screen with an objective 3D frame/truss formulation using total exponential-map nodal rotations, current chord/director axes, principal quaternion logs, and exact in-repository second-order jets.
2. Separated physical spatial moments from generalized rotation-coordinate forces. External and internal moments use the same SO(3) pull-back/push-forward contract, including their consistent tangents.
3. Replaced finite-difference release tangents with analytic implicit condensation of physical force and release residual derivatives. Central-difference comparison is below `5e-7` relative error.
4. Derived finite-rotation release gauge modes from `R_node R_ref R_hinge`. Rigid offsets add the joint translation `du = -domega x r_current` required to keep the member face fixed.
5. Preserved release modes as element-owned subspaces and identified singular combinations from `K V`, removing basis dependence. A `1e-6` spring oriented 45 degrees to two supplied release axes remains active while its orthogonal null combination is gauged.
6. Removed the scale-relative null default that could erase real weak stiffness. The production default is an absolute `1e-8` tangent-action floor; explicit caller overrides remain visible options.
7. Split gross physical member loads from the effective Newton right-hand side. Corotational elements claim mechanical member loads, add original reference joint fixed-end actions to total resisting force, and solve load-induced release rotations without double condensation. Gross loads remain in the six-resultant equilibrium audit.
8. Separated current-local force reporting from reference-local station recovery. Released UDL end forces, hinge rotation, station diagrams, and a reference torsion rotated 90 degrees into current bending axes are regression-tested.
9. Changed release convergence scaling to moment components only, preventing large axial force from relaxing a released-moment tolerance.
10. Retained material `alpha` and section `H/B` in canonical snapshots. Missing thermal expansion or gradient-depth properties now fail closed; the shared hand calculation uses the same compression-negative sign as the solver.
11. Blocked unknown member behaviors and invalid or mismatched release contracts instead of silently converting them to frame/rigid behavior.
12. Made the assembler's required general matrix class override an unsafe caller SPD request for releases and finite-rotation moments.
13. Kept finite two-axis releases static-only and nonconservative for cyclic/NLTH transfer. Unsupported follower loads, unilateral behavior, transverse truss member loads, and principal-chart crossings fail closed.

## Review Scope

- Objective frame/truss kinematics, rigid motion, offsets, local axes, and principal rotation branch
- Physical/generalized force work conjugacy and consistent tangent assembly
- Internal release solve, hinge kinematics, null-space stabilization, mechanisms, and weak restraints
- Reference mechanical member loads, temperature prestress, recovery, reactions, and equilibrium audit
- Dense/reference and in-house WASM general-backend routing
- Canonical property snapshots, public exports, verification registry, Agent contract, ADR, and evidence

## Verification Results

- `tests/p8-m3-corotational-element.mjs`: PASS
- `tests/p8-m3-corotational-global.mjs`: PASS
- released tangent central-difference relative error: `4.2140041702552304e-7`
- released member-load relative error: `7.105427357601002e-15`
- 45-degree weak-restraint rotation error: `5.633514488234681e-15`
- offset-release gauge axial error: `3.1763735522036263e-22`
- Euler critical ratio: `1.0167421128135177`
- near-critical amplification: `6.006360989037771`
- independent elastica tip relative error: `2.7609378227387864e-4`
- Phase 7 fixed-end thermal sign and elastic expansion hand calculation: PASS

## Residual Risks

- The total rotation vector remains limited to the principal chart; chart switching is not implemented.
- Finite bending releases are qualified for static force equilibrium only and are rejected by dynamic/energy-based workflows.
- Follower loads and unilateral truss active sets are not implemented in P8-M3.
- The skew reference is an independent in-repository implementation comparison, not external commercial-solver certification.
- Large-model performance and commercial pilot equivalence remain P8-M11 gates.
