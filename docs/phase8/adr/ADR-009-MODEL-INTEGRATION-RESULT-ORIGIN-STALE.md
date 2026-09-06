# ADR-009: Model Integration, Result Origin, and Stale Policy

```yaml
status: accepted
accepted_at: 2026-07-14
milestone: P8-M9
qualification: candidate
verification: P8-M9-INTEGRATION-RECOVERY
```

## Context

The production Pushover and NLTH kernels already used the canonical Phase 8 domain, but several Phase 7 modeling features did not yet have one enforced nonlinear capability contract or one result-recovery contract. In particular, support springs, settlement, generated wall/shell/diaphragm members, result dimensions, and stale propagation could otherwise diverge between solver, UI, API, and run records.

## Decision

1. Every linear, Direct P-Delta, modal, RSA, Pushover, and NLTH adapter is bound to one canonical identity containing topology, properties, constraints, mass, nonlinear properties, origin map, metadata, and units.
2. Production Pushover and NLTH always run the exported nonlinear integration capability preflight before preprocessing or solution. Unsupported combinations return the same structured reason code from direct API use and production execution.
3. Six-DOF linear support springs are assembled into the nonlinear tangent and internal-force vector. Constant spring settlement is a reference displacement, and spring force, support reaction, and strain energy are recovered explicitly.
4. Tension-only and compression-only members are fail-closed with `NONLINEAR_UNILATERAL_ACTIVE_SET_UNSUPPORTED` until a committed/trial active-set algorithm is implemented. Static member releases remain supported; dynamic releases are fail-closed.
5. Native and generated members share one result adapter. Node displacement/reaction, member end and station force, hinge/fiber state, story response, source origin, and audit data retain stable model IDs.
6. Wall, shell, and semi-rigid diaphragm objects remain preliminary equivalent frame formulations. Equivalent link or pier forces may be reported, but shell stress, shell strain, and nonlinear shell FEM claims are forbidden.
7. Global force/moment equilibrium, reduced residual, element-node assembly closure, released-force zero checks, and station-end closure are separate auditable records. Corotational reference-axis station recovery records and applies the linear span correction needed to close current/reference geometric end-force terms.
8. Result dependencies contain source and canonical granular hashes. A topology, property, constraint, load, mass, nonlinear, output, origin, metadata, unit, or case change marks only matching result dependencies stale. Stale, failed, preliminary, design-blocked, or domain-mismatched results cannot transfer to design.
9. Pushover capacity steps and NLTH history use the same result adapter. Pushover retains the latest full integrated state and compacts prior steps to immutable hash/provenance references. NLTH records node/member/story envelopes and hinge/fiber event provenance with source output step and time. Dynamic story shear and torsion are recovered from the full mass matrix and absolute acceleration; structured-envelope completeness is explicit when raw chunks are not retained.

## Consequences

- Rigid and semi-rigid diaphragms, rigid offsets, local axes, nodal/member/self-weight loads, support springs, settlement, truss members, and generated equivalents now have explicit supported or blocked behavior.
- Existing Phase 7 IDs and canonical object IDs remain stable through nonlinear results and run records.
- Preliminary equivalents cannot be mistaken for shell stress results.
- Candidate Pushover and NLTH results remain design-blocked until P8-M11 independent comparison and pilot qualification.
- Future unilateral support requires a real active-set implementation; removing the preflight without that implementation is prohibited.

## Rejected Alternatives

- Inferring support reactions after solution without assembling spring stiffness was rejected because it does not satisfy equilibrium or energy closure.
- Maintaining separate Pushover and NLTH result schemas was rejected because it breaks ID continuity and stale handling.
- Silently treating unilateral members as truss members was rejected because the force state can be physically wrong.
- Publishing equivalent shell-link forces as shell stress was rejected because no shell stress recovery exists.
