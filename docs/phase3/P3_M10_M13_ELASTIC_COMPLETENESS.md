# P3-M10 To M13 Elastic Completeness

date: 2026-07-02
status: implemented-preliminary-core

## Completed Scope

- M10: versioned material and section registry, `id@version` references, and parametric H/BOX/PIPE/RECT/CIRC section properties.
- M11: spring support stiffness, spring settlement load vector, and advanced distributed load expansion for partial/trapezoid member loads.
- M12: mid-pier wall equivalent contract and semi-rigid diaphragm equivalent-brace redistribution contract.
- M13: wind/seismic/environmental load trace contract, RSA base-shear scaling, torsion Ax trace, CQC close-mode report, global buckling trace, Euler buckling screening helper, and linear modal-superposition time-history trace helper.

## Engineering Boundary

This step keeps the existing 3D frame solver stable. It does not replace the frame solver with a shell/plate finite-element engine. A preliminary global frame eigenvalue buckling trace is now available for elastic member axial reference forces; shell buckling, follower loads, construction sequence, and nonlinear stability remain formal numerical verification tasks under later Phase 3 hardening gates.

Temperature, temperature-gradient, and member-moment load records now have preliminary fixed-end action paths. Detailed member-station recovery and hand-calculation coverage remain light.

## Agent And Data Contracts

| Milestone | Export | Read API | Data contract |
| --- | --- | --- | --- |
| M10 | `buildLibraryAudit` | `getMaterialSectionRegistry` | `phase3MaterialSectionRegistry` |
| M11 | `expandAdvancedLoads` | `getElasticExpansionTrace` | `phase3ElasticExpansionTrace` |
| M12 | `summarizeSemiRigidDiaphragm` | `getWallSlabEquivalentTrace` | `phase3WallSlabEquivalentTrace` |
| M13 | `buildLoadsV2Trace`, `generateEnvironmentalLoadsV2`, `scaleRsaBaseShear`, `computeTorsionAmplificationAx` | `getLoadsV2Trace` | `phase3LoadsV2Trace` |
| M13 | `buildCqcCombinationReport`, `estimateGlobalBucklingTrace`, `estimateModelBucklingTrace`, `runLinearSdofTha`, `runModalSuperpositionTha` | `getDynamicCompletenessTrace` | `phase3DynamicCompletenessTrace`, `globalBucklingTrace` |

The browser command bridge allow-list includes the same read APIs, so AI control can call them through DOM events, postMessage, or the URL command hash.

## Review Fixes

- Strict numeric validation now rejects `null` and blank strings instead of coercing them to zero.
- Partial and trapezoid load ranges require `0 <= from < to <= 1`.
- Semi-rigid diaphragms require at least two node references and positive `inPlaneStiffness`; the solver now expands them into generated equivalent truss braces for preliminary in-plane redistribution.
- Modal mass uses the same effective member section/material path as stiffness, including member-level custom properties.
- User-defined material/section records take precedence over built-ins when the same `id@version` is supplied.
- Seismic v2 story distribution uses `wi*hi/sum(wi*hi)` and assigns zero force to zero-height base rows.
- RSA base-shear scaling and torsion Ax are now explicit trace objects instead of implicit notes.
- Snow, soil, water, and uplift loads can now be generated as preliminary nodal load cases for review.
- CQC output now includes a close-mode report so SRSS/CQC differences are visible.
- Linear SDOF time-history trace now uses Newmark average acceleration instead of explicit Euler.
- Linear modal-superposition time-history now combines per-mode Newmark traces for elastic review.

## Verification

- `npm.cmd test -- --from=74 --to=77`
- Full regression suite before commit.
