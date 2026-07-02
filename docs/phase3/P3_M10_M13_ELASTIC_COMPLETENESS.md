# P3-M10 To M13 Elastic Completeness

date: 2026-07-02
status: implemented-preliminary-core

## Completed Scope

- M10: versioned material and section registry, `id@version` references, and parametric H/BOX/PIPE/RECT/CIRC section properties.
- M11: spring support stiffness, spring settlement load vector, advanced distributed load expansion for partial/trapezoid member loads, load handcalc trace rows, source-range station recovery, and member-moment station recovery.
- M12: mid-pier wall equivalent contract, shell frame-link assembly contract, and semi-rigid diaphragm equivalent-brace redistribution contract.
- M13: wind/seismic/environmental load trace contract, RSA base-shear scaling, torsion Ax trace, CQC close-mode report, global buckling trace, Euler buckling screening helper, and linear modal-superposition time-history trace helper.

## Engineering Boundary

This step keeps the existing 3D frame solver stable. It does not replace the frame solver with a shell/plate finite-element engine. A preliminary global frame eigenvalue buckling trace is now available for elastic member axial reference forces; shell buckling, follower loads, construction sequence, and nonlinear stability remain formal numerical verification tasks under later Phase 3 hardening gates.

Temperature, temperature-gradient, and member-moment load records now have preliminary fixed-end action paths. Uniform and gradient temperature records expose handcalc trace rows, and partial/trapezoid/member-moment records expose graph/report station recovery. These are still preliminary solver-hardening contracts, not final code-calculation sign-off.

## Agent And Data Contracts

| Milestone | Export | Read API | Data contract |
| --- | --- | --- | --- |
| M10 | `buildLibraryAudit` | `getMaterialSectionRegistry` | `phase3MaterialSectionRegistry` |
| M11 | `expandAdvancedLoads` | `getElasticExpansionTrace` | `phase3ElasticExpansionTrace` |
| M12 | `summarizeSemiRigidDiaphragm` | `getWallSlabEquivalentTrace` | `phase3WallSlabEquivalentTrace` |
| M13 | `buildLoadsV2Trace`, `generateEnvironmentalLoadsV2`, `scaleRsaBaseShear`, `computeTorsionAmplificationAx` | `getLoadsV2Trace` | `phase3LoadsV2Trace` |
| M13 | `buildCqcCombinationReport`, `estimateGlobalBucklingTrace`, `estimateModelBucklingTrace`, `runLinearSdofTha`, `runModalSuperpositionTha` | `getDynamicCompletenessTrace` | `phase3DynamicCompletenessTrace`, `globalBucklingTrace` |

The browser command bridge allow-list includes the same read APIs, so AI control can call them through DOM events, postMessage, or the URL command hash.

## 2026-07-02 Contract Review Update

M10 to M13 now expose an agent-readable elastic milestone review contract through
`getPhase3ElasticMilestoneReview`.

The contract separates:

- automated regression evidence for P3-M10 to P3-M13,
- the read APIs and data contracts that an AI agent should inspect,
- remaining engineering validation required before production structural-design use.

This keeps the implemented material library, elastic expansion, wall/slab
equivalent models, and loads/dynamics helpers available for review while making
the preliminary boundaries explicit.

## Review Fixes

- Strict numeric validation now rejects `null` and blank strings instead of coercing them to zero.
- Partial and trapezoid load ranges require `0 <= from < to <= 1`.
- Semi-rigid diaphragms require at least two node references and positive `inPlaneStiffness`; the solver now expands them into generated equivalent truss braces for preliminary in-plane redistribution.
- Shell frame links and semi-rigid diaphragm braces size their direct sections from the generated member material modulus, so equivalent axial stiffness remains traceable when concrete or project materials are used.
- Modal mass uses the same effective member section/material path as stiffness, including member-level custom properties.
- Mass-source trace now converts vertical nodal loads, member point loads, and member UDL records from selected load cases into nodal mass rows for modal/RSA and story mass summaries.
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

## 2026-07-03 Executable Review Update

The P3-M10 to P3-M13 elastic-completeness contract is now locked by
`node tests/p3-elastic-milestone-review.mjs`.

The Phase 3 runner includes this check in the P3-M13 group because the review
contract covers the full Stage C elastic engine scope. This keeps material
registry, spring/settlement/load expansion, wall/slab equivalents, and
loads/dynamics traces discoverable for AI agents through
`getPhase3ElasticMilestoneReview` while preserving the engineer-review boundary.

## 2026-07-03 Exit-Criteria Review Update

`getPhase3ElasticMilestoneReview()` now exposes the M10 to M13 plan exit criteria
as agent-readable `exitCriteria` rows. Each row records the source plan,
requirement text, and automated evidence file for material registry, spring and
advanced-load expansion, wall/slab equivalents, loads v2, CQC, buckling, modal
time-history, and mass-source trace coverage.

This does not change the production boundary. M10 to M13 remain preliminary
until office-grade material/catalog policy, project-specific KDS exception
review, dynamic benchmark expansion, shell buckling, follower load, and
construction-sequence exclusions are reviewed by an engineer or owner.

## 2026-07-03 M10 Custom Material Source Trace Update

P3-M10 material validation now emits a review warning when a `custom` material
has no `source.note`. The material-library report exposes this as
`materialWarningCount`, `auditSummary.materialWarnings`, and
`customMaterialSourceReviewRequired` so AI agents can keep custom project
materials traceable without blocking elastic registry resolution.

## 2026-07-03 M11 Member Moment Handcalc Update

P3-M11 elastic expansion now records `mmoment` loads in the handcalc trace with
the member axis, station, input moment, and fixed-end split to i/j ends. This
keeps member moment loads aligned with the G5 requirement for fixed-end and
station recovery traces.
