# P3-M10 To M13 Elastic Completeness

date: 2026-07-02
status: implemented-preliminary-core

## Completed Scope

- M10: versioned material and section registry, `id@version` references, and parametric H/BOX/PIPE/RECT/CIRC section properties.
- M11: spring support stiffness, spring settlement load vector, and advanced distributed load expansion for partial/trapezoid member loads.
- M12: mid-pier wall equivalent contract and semi-rigid diaphragm summary contract.
- M13: wind/seismic/other load trace contract, CQC modal combination output, Euler buckling trace helper, and linear SDOF time-history trace helper.

## Engineering Boundary

This step keeps the existing 3D frame solver stable. It does not yet replace the frame solver with a shell/plate finite-element engine, nor does it add a full generalized eigenvalue buckling solver. Those remain formal numerical verification tasks under the later Phase 3 gates.

Temperature, temperature-gradient, and member-moment load records are reserved schema shapes only. They are rejected by validation until equivalent fixed-end actions are implemented, so the solver cannot silently ignore them.

## Agent And Data Contracts

| Milestone | Export | Read API | Data contract |
| --- | --- | --- | --- |
| M10 | `buildLibraryAudit` | `getMaterialSectionRegistry` | `phase3MaterialSectionRegistry` |
| M11 | `expandAdvancedLoads` | `getElasticExpansionTrace` | `phase3ElasticExpansionTrace` |
| M12 | `summarizeSemiRigidDiaphragm` | `getWallSlabEquivalentTrace` | `phase3WallSlabEquivalentTrace` |
| M13 | `buildLoadsV2Trace` | `getLoadsV2Trace` | `phase3LoadsV2Trace` |
| M13 | `estimateMemberEulerBuckling`, `runLinearSdofTha` | `getDynamicCompletenessTrace` | `phase3DynamicCompletenessTrace` |

The browser command bridge allow-list includes the same read APIs, so AI control can call them through DOM events, postMessage, or the URL command hash.

## Review Fixes

- Strict numeric validation now rejects `null` and blank strings instead of coercing them to zero.
- Partial and trapezoid load ranges require `0 <= from < to <= 1`.
- Semi-rigid diaphragms require at least two node references and positive `inPlaneStiffness`.
- Modal mass uses the same effective member section/material path as stiffness, including member-level custom properties.
- User-defined material/section records take precedence over built-ins when the same `id@version` is supplied.
- Seismic v2 story distribution uses `wi*hi/sum(wi*hi)` and assigns zero force to zero-height base rows.
- Linear SDOF time-history trace now uses Newmark average acceleration instead of explicit Euler.

## Verification

- `npm.cmd test -- --from=74 --to=77`
- Full regression suite before commit.
