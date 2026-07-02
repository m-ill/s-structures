# P3-M7 Import Review Verification

date: 2026-07-02
status: preliminary core locked

## Scope

This note verifies P3-M7 against `docs/phase3/IMPORT_DXF_DWG_PLAN.md` and `docs/phase3/FRONTEND_PLAN.md`.

## Verified Items

| Plan item | Evidence |
| --- | --- |
| DWG converter contract | `src/import/dwg/adapter.js`, `tests/p3-m7-dwg-plan.mjs` |
| Missing converter guidance | `createDwgMissingConverterResult()` returns a stable code and DXF guidance |
| 2D plan recognition | `src/import/dxf/planRecognition.js` detects column and beam candidates from floor-plan fixtures |
| Two-story assembly | `src/import/planAssembly.js` stacks columns and beams into a valid `ImportCandidate` |
| Import review UI core | `src/app/views/importReview.js`, `tests/p3-m7-import-review-ui.mjs` |
| Agent-readable review state | `summarizeImportEntry()` now returns source, counts, layer audit, plan assembly, confirmable state, and review reasons |

## Added Review Finding

The import review model previously showed only generic candidate counts and warnings. P3-M7 needs AI and UI review to understand whether a drawing import is confirmable and why. The review summary now exposes:

1. `review.confirmable`
2. `review.requiresHumanReview`
3. `review.reasons`
4. `review.layerAudit`
5. `review.planAssembly`

## Current Test Gate

P3-M7 is covered by:

| Test | Coverage |
| --- | --- |
| `tests/p3-m7-dwg-plan.mjs` | DWG contract, plan recognition, two-story assembly, review summary |
| `tests/p3-m7-import-review-ui.mjs` | import review screen, confirm/reject actions, agent adjustment history |

## Remaining Limits

P3-M7 remains preliminary. Real DWG conversion requires an installed external converter. Plan recognition needs more office drawing fixtures and visual overlay evidence before it can be considered production-grade.
