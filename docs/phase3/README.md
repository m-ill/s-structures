# Phase 3 Development Hub

phase: 3
status: complete (P3-M0..M20 implemented and tested; 7 proven / 13 preliminary / 1 manual — active planning moved to `docs/phase4/`)
source: user direction 2026-07-02, closed 2026-07-03

Phase 3 expands the current elastic-analysis MVP into a practical building-structure platform. The target workflow is drawing/scan input, 3D model candidate generation, human review, elastic and nonlinear analysis, detailed design trace, calculation output, approval workflow, and AI-agent-readable control.

## Vision

```text
DWG/DXF drawing, point cloud, or JSON model
 -> import candidate
 -> human review and model confirmation
 -> material and section libraries
 -> elastic and nonlinear analysis
 -> design trace and calculation package
 -> approval workflow and agent-readable state
```

## Pillars

| Pillar | Scope | Main documents |
| --- | --- | --- |
| Drawing import | DXF parser, DWG conversion path, 2D plan to 3D assembly | `IMPORT_DXF_DWG_PLAN.md` |
| Point-cloud import | point loading, viewer buffer, story/member extraction | `IMPORT_POINT_CLOUD_PLAN.md` |
| Material and section library | versioned material/section registry, nonlinear parameters | `MATERIAL_SECTION_LIBRARY_PLAN.md` |
| Elastic engine completeness | spring, settlement, truss, offset, wall/slab, wind/seismic v2, dynamics | `ELASTIC_ENGINE_COMPLETENESS_PLAN.md` |
| Nonlinear engine | geometry nonlinearity, hinges, control, fiber, nonlinear time history | `NONLINEAR_ENGINE_PLAN.md` |
| Detailed design | RC, steel, connection, foundation trace modules | `DESIGN_MODULES_PLAN.md` |
| Product hardening | server, persistence, frontend shell, packaging, QA, manuals | `ARCHITECTURE.md`, `QA_RELEASE_PLAN.md` |

## Baseline From Phase 2

1. Schema-versioned model and validation gate.
2. 3D elastic frame solver, analysis audit, and benchmark tests.
3. Story, load, combination, envelope, and report traces.
4. Representative building scenarios and calculation-package path.
5. Agent API contract and capability manifest.

Items excluded from implementation must be listed as limitations in the relevant plan, report, or manual.

## Milestone Map

| Stage | Milestones | Scope |
| --- | --- | --- |
| A Platform | P3-M0 to P3-M4 | server, account, persistence, app shell |
| B Import | P3-M5 to P3-M9 | geometry core, DXF/DWG, point cloud |
| C Elastic completeness | P3-M10 to P3-M13 | libraries, element/load expansion, wall/slab, dynamics |
| D Nonlinear | P3-M14 to P3-M16 | nonlinear geometry, hinges/control, fiber/NLTH |
| E Design | P3-M17 to P3-M18 | RC, steel, connection, foundation detailed trace |
| F Productization | P3-M19 to P3-M20 | integrated results, launch readiness |

## Active Documents

| Document | Role |
| --- | --- |
| `ROADMAP.md` | P3-M0 to P3-M20 milestone roadmap |
| `IMPLEMENTATION_BACKLOG.md` | P3-T## ticket backlog |
| `PRODUCT_REQUIREMENTS.md` | Phase 3 PRD |
| `ARCHITECTURE.md` | system architecture and technical decisions |
| `DEVELOPMENT_FILE_MAP.md` | folder and file routing |
| `P3_M6_M9_REBUILD_ORDER.md` | corrected restart order from P3-M6 |
| `IMPORT_DXF_DWG_PLAN.md` | DXF/DWG import specification |
| `IMPORT_POINT_CLOUD_PLAN.md` | point-cloud import specification |
| `MATERIAL_SECTION_LIBRARY_PLAN.md` | material and section registry plan |
| `ELASTIC_ENGINE_COMPLETENESS_PLAN.md` | elastic engine gap list and implementation plan |
| `NONLINEAR_ENGINE_PLAN.md` | nonlinear analysis plan |
| `DESIGN_MODULES_PLAN.md` | detailed design module plan |
| `QA_RELEASE_PLAN.md` | verification and release gates |
| `../user-manual/PHASE3_REMAINING_REVIEW.md` | remaining review map for users and AI agents |

## Reading Order

1. `PRODUCT_REQUIREMENTS.md`
2. `ROADMAP.md`
3. `ARCHITECTURE.md`
4. `P3_M6_M9_REBUILD_ORDER.md` when restarting from drawing/point-cloud import
5. The detailed plan for the active milestone
6. `IMPLEMENTATION_BACKLOG.md`
7. `DEVELOPMENT_FILE_MAP.md`

## Restart Rule From P3-M6

The correct restart point is P3-M6. Existing implementation should be reviewed and strengthened against the plan rather than deleted blindly.

| Milestone | First action |
| --- | --- |
| P3-M6 | lock DXF parser, wireframe mapping, layer audit, unsupported-entity audit |
| P3-M7 | lock DWG adapter contract, 2D plan recognition, import review UI core |
| P3-M8 | lock point-cloud loader, normalization, worker, and viewer buffer |
| P3-M9 | lock synthetic extraction, candidate-to-analysis E2E, real-scan limitation note |

## Phase 3 Gate

1. Public API or UI action changes update the agent contract.
2. User-facing workflow changes update `docs/user-manual/`.
3. Numerical logic has focused tests and workflow tests.
4. Reported values include source trace or limitation text.
5. Generated outputs stay under `reports/` or `output/`.
6. Imported models must pass validation before analysis.
7. Server API changes update both the API plan and tests.

## Repository Hygiene

| Item | Rule |
| --- | --- |
| Development repo | `s-structures-review/` is the active source repository |
| Generated data | use `data/`, `reports/`, or `output/` according to purpose |
| Uploaded files | keep outside git-tracked source unless they are compact fixtures |
| Large point clouds | store real samples outside git and keep deterministic generators/tests in repo |
