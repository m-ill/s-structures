# ADR-002: Finite Rotation and Corotational Formulation

```yaml
status: accepted
accepted_at: 2026-07-12
milestone: P8-M3
decision_scope: 3D frame/truss kinematics, moment work conjugacy, release, and member-load configuration
```

## Context

P8-M3 needs an objective 3D frame/truss element that shares the Phase 7 canonical member geometry, properties, offsets, releases, and load recovery. A finite-rotation implementation must distinguish physical spatial moments from generalized forces conjugate to additive rotation-vector coordinates. It must also prevent unsupported rotation branches, follower loads, unilateral behavior, and energy-dependent use of a nonconservative finite two-axis release.

## Alternatives Considered

- Incremental Euler rotations were rejected because update order would enter the stored state and objectivity audit.
- A follower interpretation for all member loads was rejected because existing Phase 7 loads are reference-configuration dead loads.
- Finite-difference release tangents were rejected after review because they introduced false null stiffness and scale-dependent Newton behavior.
- Treating every unknown member behavior or release value as a frame/rigid default was rejected because it silently changes the analysis model.
- A conservative two-axis joint topology was deferred because it requires a separate state and energy contract suitable for cyclic and dynamic use.

## Decision

- Store each nodal orientation as a total global exponential-map rotation vector with the principal chart limited to `|phi| < pi - 1e-4`.
- Form nodal orientation matrices with the exponential map and form the objective current frame from the current chord and averaged end directors. Relative end rotations use the principal quaternion log.
- Define axial extension, torsion, and two-axis end rotations in the corotated frame. The unreleased elastic frame energy uses the Phase 7 `localK12`; its global resisting force and tangent are the exact first and second derivatives computed by in-repository second-order automatic differentiation.
- Pull a physical global nodal moment back to rotation coordinates as `g_phi = J_l(phi)^T m`. Assemble `K_int - dP_ext/dq` and route noncoaxial moment cases to a general matrix backend. Convert generalized result moments back to physical spatial moments before equilibrium audit and reporting.
- Rotate rigid offsets exactly with the joint orientation. Transfer face force and moment to the joint with the current rigid arm.
- Treat uniform temperature and temperature gradient as initial-strain forces inside `Pint` and `Kt`; remove their equivalent nodal vectors from the corotational external load. Positive uniform temperature means free expansion and compression under full restraint.
- Keep non-follower mechanical member loads in the reference configuration. The external assembler retains their condensed equivalent nodal vector as the gross physical load for equilibrium audit, but removes it from the effective Newton right-hand side when a corotational element claims the load. The element adds the original reference joint fixed-end action to its total resisting force and release residual, so load-induced hinge kinematics and current-axis zero-moment conditions are solved consistently. Station recovery transforms the resulting current face forces to reference axes and uses reference length. A follower flag fails closed.
- Solve finite end releases as internal rotational variables. The release residual is the current local physical moment in each released axis. Differentiate the physical global resisting force and release residual with second-order jets, then apply the implicit derivative `dF/dq - dF/dh (dG/dh)^-1 dG/dq` for the condensed general tangent. Derive each finite-rotation gauge direction from the differential of `R_node R_ref R_hinge`, not from a current-axis approximation.
- Preserve declared release modes as element-owned subspaces and stabilize only singular combinations found from `K V` within each subspace. The default tangent-action threshold is an absolute `1e-8` numerical floor with no scale-relative term. A `1e-6` restraint at 45 degrees to the supplied release basis proves that the restrained combination is retained while its orthogonal null combination is gauged.
- A finite two-axis bending release that retains torsion is static-force consistent but not assigned a conservative scalar potential. Such an element reports `energyConservative:false` and omits `elementPotential`; cyclic and NLTH workflows must reject it until a qualified conservative joint topology is implemented.
- Truss response is axial only. Truss nodal rotations are gauge freedoms when no rigid offset exists. Transverse truss member loads and unilateral truss behavior fail closed in P8-M3.

## Verification Boundary

`NL-COR-01..12` covers the small-displacement limit, arbitrary rigid motion, unreleased and released consistent tangents, axial/torsional/biaxial response, Euler approach trend, an independent elastica boundary-value solution, a frozen Phase 7 skew-frame reference, physical finite release moments, finite-rotation release null modes, weak-restraint preservation, loaded offsets, combined release/offset, reference member-load recovery, thermal prestress, and SO(3) moment pull-back.

The skew fixture is an independent implementation comparison within this repository, not an external commercial-solver result. Commercial pilot equivalence and large-model performance remain P8-M11 gates.

## Consequences

- Unreleased frame/truss geometry is objective and energy-derived within the principal chart.
- Physical and generalized moments are no longer conflated.
- A rotation-vector branch crossing, chord collapse, follower load, unsupported unilateral member, transverse truss member load, or unapproved mechanism produces an explicit failure.
- Finite released elements require the general backend and are static-only until an energy-conservative release topology is qualified.
- Released elements carry the cost of a local internal Newton solve and analytic implicit condensation. Residual-only evaluation and release tangent optimization remain P8-M11 performance work.

## Migration Impact

- Canonical material snapshots now retain `alpha`; section snapshots retain `H` and `B` for thermal-gradient provenance.
- Temperature loads without either explicit or material `alpha`, and gradients without either explicit `h` or section `H`, fail closed instead of receiving generic defaults.
- Unknown member behaviors and non-`rigid`/`pin` release contracts fail during element/load preparation.
- Existing result consumers may continue using current-local `localResponse.resistingForce`; reference recovery is exposed separately as `referenceResistingForce` and is used for station diagrams.

## Reconsideration Conditions

Revisit this decision only with new verification IDs and migration evidence when adding follower loads, a conservative finite-release topology, rotation-chart switching beyond the principal branch, or a materially different large-rotation parameterization.

## Licensing

The formulation, automatic differentiation, SO(3) transforms, internal release solve, and tests are implemented in repository source. P8-M3 adds no external numerical library or separately licensed solver dependency.
