# Phase 3 DXF/DWG Import Plan

status: active
milestones: P3-M5 geometry core, P3-M6 DXF import v1, P3-M7 DWG and plan recognition v2

## Goal

Drawing input must produce a reviewable structural `ImportCandidate`, not an automatically final analysis model. The import path should extract useful structural geometry from DXF/DWG drawings, record the basis and warnings, show the candidate in the review UI, and convert it to an analysis model only after user or agent confirmation.

## Input Paths

| Path | Milestone | Method |
| --- | --- | --- |
| 3D wireframe DXF | P3-M6 | Parse LINE/POLYLINE/INSERT geometry and map it to node/member candidates. |
| 2D floor-plan DXF | P3-M7 | Detect grids, columns, beams, labels, and story heights, then assemble a 3D candidate. |
| DWG | P3-M7 | Use a configured external converter to produce ASCII DXF, then run the same DXF pipeline. |

DWG binary parsing is not implemented directly. If no converter is configured, the system must return a clear missing-converter result and guide the user to export DXF from CAD.

## P3-M6 DXF Parser

The ASCII DXF group-code stream is parsed in-house.

| Part | Output |
| --- | --- |
| HEADER | `$INSUNITS`, `$EXTMIN`, `$EXTMAX`, `$ACADVER` |
| TABLES | layer name, color, state |
| BLOCKS | block definitions for later INSERT expansion |
| ENTITIES | supported drawing entities and unsupported-entity audit |

Supported v1 entities:

| Entity | Use |
| --- | --- |
| LINE | primary beam, column, brace, and grid segment candidate |
| LWPOLYLINE / POLYLINE | continuous member or plan outline candidate |
| POINT | reference node or audit-only point evidence |
| CIRCLE | column or reference marker evidence |
| INSERT + BLOCK | repeated column/member block expansion |
| TEXT / MTEXT | grid, story, section, or member label evidence |

Unsupported entities must be counted and listed in the audit. They must not disappear silently.

## Normalization

| Item | Rule |
| --- | --- |
| Unit | Prefer `$INSUNITS`; if missing, record scale suspicion from drawing size. |
| Axis | Normalize to z-up model coordinates. |
| Origin | Optionally shift by drawing bbox minimum for large-coordinate files. |
| Tolerance | Reuse the P3-M5 geometry merge tolerance. |

## Wireframe Mapping

```text
DXF entities
 -> geometry segments
 -> endpoint tolerance merge
 -> short/duplicate segment cleanup
 -> vertical/horizontal/inclined member classification
 -> story/grid candidate extraction
 -> layer mapping
 -> ImportCandidate
```

Classification starts from member axis ratio. Layer mapping can override the inferred kind, section, material, and review label.

Example layer map:

```js
{ layer: 'S-COL-H400', kind: 'column', section: 'H-400x200x8x13', material: 'SS275' }
```

## Audit Contract

```js
{
  counts: { lines, polylines, inserts, texts, points, circles, ignored, ignoredDetails },
  units: { declared, applied, suspicion },
  normalization: { origin, sourceBbox },
  bbox: { min, max, sizeM },
  merge: { nodesBefore, nodesAfter, shortSegmentsDropped, duplicatesDropped },
  mapping: { layers, mappedLayers, unmappedEntityCount, unmappedSegmentCount },
  orphans: { nodes, unknownKindMembers },
  warnings: []
}
```

AI agents and the import review UI must use this audit before accepting a candidate.

## P3-M7 Plan Recognition

2D plan recognition creates a candidate for review, not a final automatic model.

| Step | Method |
| --- | --- |
| Grid detection | combine axis layers and text labels |
| Column detection | use circles, closed polylines, blocks, and grid intersections |
| Beam detection | use beam layers, span labels, and grid-centerline relationships |
| Story assembly | combine floor plans with user-entered or label-derived story heights |
| Label mapping | connect names such as G1, B2, C1 to member or section candidates |

Initial target for deterministic fixtures: column recall >= 0.9 and beam recall >= 0.8. Real office drawings remain review-required until owner-supplied fixtures are validated.

## DWG Adapter

```text
DWG file
 -> configured external converter
 -> ASCII DXF
 -> standard DXF parser
 -> ImportCandidate
```

| Case | Required behavior |
| --- | --- |
| converter configured | return conversion command plan and generated DXF path |
| converter missing | return explicit missing-converter result |
| conversion failed | return failure log and fallback DXF-export guidance |

## Fixtures And Tests

| Test | Scope |
| --- | --- |
| `tests/p3-m6-dxf-import.mjs` | parser, entities, block/polyline, unit scaling, layer audit |
| `tests/p3-m7-dwg-plan.mjs` | DWG adapter contract, 2D plan recognition, two-story assembly |
| `tests/p3-m7-import-review-ui.mjs` | import review accept/reject UI contract |
| `tests/fixtures/dxf/min-frame.dxf` | minimal 3D wireframe fixture |
| `tests/fixtures/dxf/block-polyline.dxf` | block INSERT and polyline fixture |
| `tests/fixtures/dxf/plan-story-*.dxf` | two-story plan assembly fixture |

## Exit Criteria

P3-M6 can close only when:

1. ASCII DXF parser reads required headers, layers, blocks, and supported entities.
2. Wireframe DXF converts to a valid `ImportCandidate`.
3. Unit scaling and layer coverage audit are present.
4. Unsupported entities are reported, not silently ignored.
5. The generated candidate can be converted to a model and analyzed in a follow-up path.

P3-M7 can close only when:

1. DWG converter contract handles configured and missing converter states.
2. Two 2D floor-plan fixtures assemble into a 3D candidate.
3. Import review UI can show candidate counts, warnings, and accept/reject state.

## Current Limit

The current implementation is a preliminary import core. Production claims require real office DXF/DWG fixtures, visual overlay review evidence, and owner sign-off.
