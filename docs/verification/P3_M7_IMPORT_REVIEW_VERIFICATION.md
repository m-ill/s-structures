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
| DWG command plan | `createDwgConversionPlan()` now returns output DXF path, executable, command args, and audit metadata without running the external converter |
| DWG failure envelope | `createDwgConversionFailureResult()` records failed conversion code, stderr, exit code, and the original command plan |
| DWG CLI planning tool | `tools/convert-dwg.mjs` prints the same JSON conversion contract for agent/operator workflows |
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

2026-07-02 review update: The DWG adapter now exposes a non-executing command plan with target DXF path and failure envelope. This keeps the proprietary-format conversion step explicit, reviewable, and controllable by AI agents without pretending that a local converter is always installed.

## Current Test Gate

P3-M7 is covered by:

| Test | Coverage |
| --- | --- |
| `tests/p3-m7-dwg-plan.mjs` | DWG contract, plan recognition, two-story assembly, review summary |
| `tests/p3-m7-import-review-ui.mjs` | import review screen, confirm/reject actions, agent adjustment history |

## Remaining Limits

P3-M7 remains preliminary. Real DWG conversion requires an installed external converter. Plan recognition needs more office drawing fixtures and visual overlay evidence before it can be considered production-grade.
