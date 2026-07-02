# Phase 3 Implementation Audit

date: 2026-07-02
status: corrective audit before P3-M14

## Purpose

This audit re-checks the current code against the existing Phase 3 planning documents before continuing to P3-M14 to P3-M16.

Primary references:

- `ROADMAP.md`
- `IMPLEMENTATION_BACKLOG.md`
- `MATERIAL_SECTION_LIBRARY_PLAN.md`
- `ELASTIC_ENGINE_COMPLETENESS_PLAN.md`
- `NONLINEAR_ENGINE_PLAN.md`

## Summary

The current repository has useful Phase 3 scaffolding and several working core traces, but some milestones were implemented as preliminary slices while the planning documents describe larger P0 scopes. These must not be treated as fully complete.

The biggest correction is that P3-M14 to P3-M16 must follow `NONLINEAR_ENGINE_PLAN.md`, not a newly invented scope. Before that, the gaps in P3-M10 to P3-M13 should be explicitly tracked because nonlinear hinges, fiber sections, and NLTH depend on material, load, dynamic, and mass-source contracts.

## Stage A/B Status

| Milestone | Plan target | Current status | Audit result |
| --- | --- | --- | --- |
| P3-M0 | Phase 3 baseline, folders, version contracts | Present through docs and test harness | Partial but acceptable foundation |
| P3-M1 | server REST envelope, project/revision/file/import/approval APIs | Basic server/project/revision/auth persistence tests exist | Partial platform core |
| P3-M2 | account, login, token, role guard, lockout | Basic auth exists | Partial; lockout/rate policy needs review |
| P3-M3 | three-layer persistence, autosave, lineage warning | Persistence contract exists | Partial; lineage conflict should be revisited |
| P3-M4 | app shell, routes, project browser, viewer core | App shell and viewer core tests exist | Partial shell, not full production UI |
| P3-M5 | geometry core, classification, import candidate | Geometry cleaning/import candidate tests exist | Partial core |
| P3-M6 | DXF import v1 | ASCII group-code parser, LINE/LWPOLYLINE/POLYLINE/POINT/TEXT/INSERT+BLOCK mapping, unit scaling, layer audit, and fixtures exist | Core available; DWG and 2D plan recognition remain M7 |
| P3-M7 | DWG/plan recognition v2 | DWG converter contract, missing-converter guidance, circle/line plan recognition, and two-story plan assembly core exist | Preliminary core; real converter e2e and review UI remain |
| P3-M8 | point-cloud import pipeline | Planned shell only | Shell only |
| P3-M9 | point-cloud extraction v2 | No extraction benchmark found | Not implemented |

## Stage C Audit: P3-M10 To P3-M13

### P3-M10 Material And Section Library

| Ticket | Plan target | Current code | Audit result |
| --- | --- | --- | --- |
| P3-T46 | custom material schema + migration | `materials` arrays accepted, but no full material schema validator for `elastic/strength/nonlinear` object | Partial |
| P3-T47 | section DB, parametric, direct input | Parametric section properties for H/BOX/PIPE/RECT/CIRC exist | Partial; KS DB tables not present |
| P3-T48 | versioned registry + calculation trace | `id@version` resolver and audit exist | Partial; calculation report integration is light |
| P3-T49 | library edit UI + server storage + agent actions | No dedicated library UI/actions found | Not implemented |

### P3-M11 Element, Boundary, Load Expansion

| Ticket | Plan target | Current code | Audit result |
| --- | --- | --- | --- |
| P3-T68 | 6-DOF spring support + settlement | Solver has node springs and settlement force contribution | Partial; handcalc benchmark should be added |
| P3-T69 | truss/tension-only/compression-only elements | Schema allows member types, solver does not branch by type | Not implemented |
| P3-T70 | member end offset / rigid zone | No solver offset/rigid-zone implementation found | Not implemented |
| P3-T71 | partial/trapezoid/multiple point/member moment loads | Partial/trapezoid expands to point loads; member moment is rejected as unsupported | Partial |
| P3-T72 | uniform/gradient temperature loads | Schema recognizes shapes, validation rejects them until implemented | Not implemented |

### P3-M12 Wall And Slab

| Ticket | Plan target | Current code | Audit result |
| --- | --- | --- | --- |
| P3-T73 | wall mid-pier + pier force recovery | `wallToMidPierMember` creates an equivalent contract only | Partial |
| P3-T74 | shell element v1 | No shell solver found | Not implemented |
| P3-T75 | semi-rigid diaphragm | Summary and validation contract exist; solver only resolves rigid diaphragms | Partial |

### P3-M13 Loads v2 / Dynamics / Buckling

| Ticket | Plan target | Current code | Audit result |
| --- | --- | --- | --- |
| P3-T76 | KDS wind v2 | Simplified story wind trace only | Partial |
| P3-T77 | KDS seismic v2 + RSA scaling + torsion Ax | Simplified `wi*hi` story distribution and CQC helper exist | Partial |
| P3-T78 | snow/soil/water/uplift loads | Trace fields only, no model load generation/combo integration | Partial |
| P3-T79 | CQC modal combination | CQC helper exists and RSA can return CQC displacement | Partial |
| P3-T80 | linear eigenvalue buckling | Euler member buckling helper only, not global eigenvalue buckling | Partial |
| P3-T81 | modal superposition linear THA | SDOF Newmark helper only, not modal superposition | Partial |
| P3-T82 | mass source from loads | Node/member lumped mass exists; load-to-mass source contract absent | Not implemented |

## Stage D Required Scope: P3-M14 To P3-M16

P3-M14 to P3-M16 must follow `NONLINEAR_ENGINE_PLAN.md`.

### P3-M14 Required

| Ticket | Required output |
| --- | --- |
| P3-T50 | nonlinear analysis state/increment snapshot |
| P3-T51 | corotational beam + geometric stiffness contract |
| P3-T52 | Newton-Raphson, line search, convergence log contract |
| P3-T53 | B1/B2 benchmark gate registration |

### P3-M15 Required

| Ticket | Required output |
| --- | --- |
| P3-T54 | moment-rotation hinge backbone and hinge state trace |
| P3-T55 | displacement control and arc-length control traces |
| P3-T56 | formal pushover result contract, replacing preliminary wording where justified |

### P3-M16 Required

| Ticket | Required output |
| --- | --- |
| P3-T83 | PMM interaction hinge interpolation |
| P3-T84 | RC/steel fiber section and moment-curvature check |
| P3-T85 | Newmark NLTH with Rayleigh damping and step trace |
| P3-T86 | ground-motion record and scaling trace |

## Corrective Implementation Order

1. Do not label P3-M10 to P3-M13 as complete. Keep them as preliminary cores until the ticket gaps above are closed.
2. Before P3-M14 code, add Stage D modules using the exact layout in `NONLINEAR_ENGINE_PLAN.md`.
3. Add milestone tests for P3-M14, P3-M15, and P3-M16 as new runner entries after current `test:m77`.
4. Expose Stage D read APIs in the agent manifest only after the corresponding trace functions exist.
5. Update user/manual status so unsupported items are explicit and cannot be mistaken for final structural design output.

## Immediate Next Step

Proceed with P3-M14 only as defined by tickets P3-T50 to P3-T53:

- `src/nonlinear/state.js`
- `src/nonlinear/elements/corotationalBeam.js`
- `src/nonlinear/control/convergence.js`
- `src/nonlinear/control/newtonRaphson.js`
- `src/verification/nonlinearBenchmarks.js`
- `tests/p3-m14-nonlinear-geometry.mjs`

Exit condition: state snapshot, convergence log, geometric benchmark trace, and agent-readable nonlinear trace contract are present and tested.
