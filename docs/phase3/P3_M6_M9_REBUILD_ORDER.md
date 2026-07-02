# P3-M6 To M9 Rebuild Order

date: 2026-07-02
status: working plan

## Decision

Phase 3 work should restart from P3-M6, but not by deleting all existing code. The current repository already has a usable P3-M5 geometry core and passing P3-M6 to P3-M9 import tests. The right approach is to lock each milestone against the original plan, close gaps, and keep preliminary items clearly labeled.

## Order

| Step | Milestone | Build target | Review gate |
| --- | --- | --- | --- |
| 1 | P3-M6 | DXF v1 parser, entity mapping, layer audit, wireframe candidate | `tests/p3-m6-dxf-import.mjs` |
| 2 | P3-M7 | DWG converter contract, 2D plan recognition, two-story assembly, review UI core | `tests/p3-m7-dwg-plan.mjs` and import review checks |
| 3 | P3-M8 | point-cloud loaders, normalization, worker contract, viewer buffer | `tests/p3-pointcloud-load.mjs` |
| 4 | P3-M9 | synthetic extraction, story/column/beam candidate, candidate-to-analysis E2E | `tests/p3-pointcloud-extraction.mjs`, `tests/p3-pointcloud-e2e.mjs` |

## Current Verification

The current code passes the core M6 to M9 test files:

| Test | Meaning |
| --- | --- |
| `tests/p3-m6-dxf-import.mjs` | DXF parser and wireframe import are functional |
| `tests/p3-m7-dwg-plan.mjs` | DWG adapter contract and 2D plan assembly are functional |
| `tests/p3-pointcloud-load.mjs` | compact point-cloud loading path is functional |
| `tests/p3-pointcloud-extraction.mjs` | synthetic story/column extraction is functional |
| `tests/p3-pointcloud-e2e.mjs` | extracted candidate can become an elastic analysis model |

## Gaps To Keep Visible

| Milestone | Gap |
| --- | --- |
| P3-M6 | More real-world DXF variants, richer unsupported-entity audit, candidate-to-viewer usability review |
| P3-M7 | Real DWG conversion depends on external converter path; plan recognition needs more office drawing fixtures |
| P3-M8 | Large point-cloud performance and binary LAS/PCD paths need real files |
| P3-M9 | Wall extraction and beam extraction need real scan evidence; synthetic benchmark is not field proof |

## Next Implementation Rule

When continuing from P3-M6, each milestone must include:

1. Code review against its plan document.
2. Focused tests before moving to the next milestone.
3. Agent-readable metadata or API exposure when the result affects AI control.
4. A short verification note under `docs/phase3/` or `docs/verification/`.
5. No claim of final structural design automation unless real fixtures and owner review prove it.

## 2026-07-02 Contract Review Update

M6 to M9 now expose an agent-readable import milestone review contract through
`getPhase3ImportMilestoneReview`.

The contract separates:

- automated regression evidence for P3-M6 to P3-M9,
- external field-file evidence still required before production import claims,
- the import review APIs an AI agent should use (`listImportCandidates`,
  `resolveImportCandidate`, `confirmImport`).

This keeps the current DXF, DWG-adapter, and point-cloud pipeline usable for
development while preventing synthetic point-cloud and missing-converter results
from being interpreted as final field validation.

## 2026-07-03 Executable Review Update

The P3-M6 restart path is now locked by a dedicated import milestone review
test: `node tests/p3-import-milestone-review.mjs`.

The Phase 3 runner includes this check in the P3-M9 group because the review
contract covers the full M6 to M9 input pipeline. This means
`node tools/run-milestone-tests.mjs --phase3 --from=P3-M6 --to=P3-M9`
now verifies both the individual import implementations and the combined
agent-readable review contract.

## 2026-07-03 M6 Entity Coverage Update

The P3-M6 DXF regression now explicitly covers `MTEXT` label entities in
addition to `TEXT`, `LINE`, `LWPOLYLINE`, `POLYLINE`, `POINT`, `CIRCLE`, and
`INSERT`/`BLOCK`. This locks the supported-entity list in
`IMPORT_DXF_DWG_PLAN.md` to automated evidence rather than relying only on the
parser implementation.
