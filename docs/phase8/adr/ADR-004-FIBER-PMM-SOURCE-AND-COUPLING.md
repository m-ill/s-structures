# ADR-004: Fiber PMM Source and Same-Iteration Coupling

- Status: accepted for candidate implementation
- Milestone: P8-M6
- Date: 2026-07-13
- Verification: NL-FIB-01..NL-FIB-14, NL-PMM-01..NL-PMM-08

## Context

The preliminary nonlinear path contained a one-dimensional RC strip model, a three-fiber steel I-section, and hard-coded PMM levels. Those representations could produce traces but could not be treated as model-bound production analysis. Phase 8 also requires nonlinear properties to remain linked to the Phase 7 material, section, and reinforcement source instead of creating an independent geometry catalog.

## Decision

1. Fiber cells use immutable `(y,z,area,materialId)` records in section-local coordinates and explicit SI geometry units. Section H/depth maps to local y, B/width maps to local z, `Iy=int(z^2)dA`, and `Iz=int(y^2)dA`, matching the Phase 7 frame element.
2. Steel H, BOX, and PIPE meshes and RC cover/core/bar meshes are generated from the same Phase 7 `shape/params/properties` snapshot used by elastic analysis.
3. RC fiber generation requires an explicit reinforcement snapshot. Missing reinforcement, unsupported geometry, invalid units, Phase 7 A/I mismatch above the declared tolerance, and invalid PMM bounds fail closed; the solver does not invent detailing.
4. Section deformation is `[epsilon0,kappaY,kappaZ]`, section force is `[N,My,Mz]`, and axial tension is positive.
5. The section tangent is the integrated 3x3 constitutive tangent and is checked against finite differences.
6. PMM surfaces are generated through repeated target-axial section equilibrium solves. Capacity is the first declared material strength limit or a resolved local peak; arbitrary sample maxima are forbidden. Validation covers sign, angular and axial convexity, bounds, interpolation continuity, and immutable source/content hashes.
7. Runtime PMM evaluation never clamps out-of-range axial force. It returns a blocked result and the production element converts that state into a coded analysis failure.
8. The corotational concentrated-hinge element evaluates the PMM surface using its current trial `N,My,Mz` in the same internal iteration. Trial moment sensitivities to all three force components enter the internal condensation Jacobian.
9. A dynamic trial backbone retains the base hinge property hash so committed cyclic history remains bound to one property snapshot. PMM source and surface hashes are stored in a separate interaction trace.
10. Concentrated hinges scale their immutable backbone to the absolute fiber-section moment capacity, not only to a relative axial reduction factor.
11. Members declared as `distributed-plasticity` use 2-5 point Gauss integration of the same fiber section. Every integration point owns trial/committed material state. Mechanical fixed-end actions enter through the elastic station resultants, and the full global fiber correction is differentiated for the element tangent.
12. Non-convex axial samples are never expanded. A conservative level-wise concave minorant may reduce capacities; raw capacity and reduction scale remain in every point trace.
13. Identical section/material/reinforcement/options snapshots share a cached PMM surface. Cache identity includes source content and every result-affecting numerical option, not only record IDs.

## Consequences

- Supported Phase 7 parametric sections participate in model-bound PMM/fiber Pushover without a second geometry definition.
- Existing direct-property sections remain executable through the M5 concentrated-hinge path but report that fiber PMM coupling was unavailable. Strict mode blocks those models.
- The element tangent may be general because PMM cross-coupling can make the condensed Jacobian nonsymmetric.
- Supported fiber-source or PMM-generation failures block production analysis by default. Only explicitly unsupported legacy geometry may remain on the concentrated-hinge path with a structured warning.
- Distributed fiber members currently reject end releases and cannot be combined with concentrated hinges on the same member.
- Component qualification is `candidate`. External correlation, large-model performance budgets, and pilot acceptance are still required before design transfer.

## Revisit Conditions

Revisit this ADR if P8-M7 chooses a coupled multi-axis return mapping, P8-M8 requires a different section-state serialization strategy, or P8-M11 evidence shows that radial PMM interpolation or finite-difference coupling sensitivities do not meet the accepted commercial comparison tolerances.
