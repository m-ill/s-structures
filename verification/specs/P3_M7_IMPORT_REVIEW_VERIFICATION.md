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
| DWG readiness decision | `buildDwgConversionReadiness()` records missing converter/input/output fields and agent decision |
| DWG host preflight decision | `buildDwgConversionPreflight()` separates unknown host checks, blocked execution, and ready-for-execution states |
| DWG CLI planning tool | `tools/convert-dwg.mjs` prints the same JSON conversion contract for agent/operator workflows |
| 2D plan recognition | `src/import/dxf/planRecognition.js` detects column and beam candidates from floor-plan fixtures |
| Two-story assembly | `src/import/planAssembly.js` stacks columns and beams into a valid `ImportCandidate` |
| Import review UI core | `src/app/views/importReview.js`, `tests/p3-m7-import-review-ui.mjs` |
| Agent-readable review state | `summarizeImportEntry()` now returns source, counts, layer audit, plan assembly, confirmable state, and review reasons |
| Plan recognition quality trace | `recognitionQuality` records expected/actual column and beam counts, recall, targets, and review status |
| Column stack continuity trace | `columnContinuity` records incomplete floor-to-floor column stacks and review status |
| Plan assembly review decision | `planAssembly.review` records confirmable status, hold reasons, evidence, and agent decision |
| Plan label and unused-layer evidence | `recognizePlanDxf()` records TEXT/MTEXT labels, recognized layers, unused layers, and layer usage rows for AI review |
| Plan overlay evidence | `planAssembly.overlayEvidence` records source layers, candidate counts, unused layers, candidate member rows, and review decision |

## Added Review Finding

The import review model previously showed only generic candidate counts and warnings. P3-M7 needs AI and UI review to understand whether a drawing import is confirmable and why. The review summary now exposes:

1. `review.confirmable`
2. `review.requiresHumanReview`
3. `review.reasons`
4. `review.layerAudit`
5. `review.planAssembly`
6. `review.planAssembly.overlayEvidence`

2026-07-02 review update: The DWG adapter now exposes a non-executing command plan with target DXF path and failure envelope. This keeps the proprietary-format conversion step explicit, reviewable, and controllable by AI agents without pretending that a local converter is always installed.

2026-07-02 follow-up: Plan recognition now exposes fixture-quality recall traces. `recognizePlanDxf()` records expected/actual column and beam counts, recall, and target thresholds, `assemblePlansToImportCandidate()` carries the minimum recall into the candidate audit, and `summarizeImportEntry()` flags `plan-recognition-quality-review-required` when the recognition quality falls below the documented P3-M7 gate.

2026-07-02 decision-state update: `summarizeImportEntry()` now exposes `decision` state for pending, confirmed, and rejected imports. The import review screen renders this state in its audit JSON, and the M7 UI test covers both confirm and reject paths so AI agents can verify accept/reject status without inferring it from button state.

2026-07-02 column-continuity review: `assemblePlansToImportCandidate()` now records `planAssembly.columnContinuity` with expected story count, stack count, and incomplete stacks. `summarizeImportEntry()` flags `column-stack-continuity-review-required` so AI agents and reviewers do not silently confirm a 2D plan assembly where a column appears on one floor but not another.

2026-07-03 server API review contract: `/api/projects/:id/imports` save, list, read, and decision responses now include the same `review` summary returned by `summarizeImportEntry()`. API-driven agents can read source, counts, validation, warnings, confirmable state, and accepted/rejected/pending decision state without opening the browser import review screen.

2026-07-03 in-page agent import contract: `window.SStructuresAgent` now implements `listImportCandidates`, `resolveImportCandidate`, `confirmImport`, and `rejectImport`. Confirmed imports can be applied to the current model only after the shared import review model reports the candidate as confirmable, so browser-control agents follow the same review-before-model rule as the server import API.

2026-07-02 readiness-decision update: DWG conversion plans now include `audit.readiness` with `ready-to-convert` or `external-converter-required` status. 2D plan assemblies now include `planAssembly.review` with `candidate-ready-for-import-review-ui` or `hold-import-for-plan-review`. This lets AI agents branch on explicit import decisions instead of reinterpreting counts and warnings.

2026-07-03 P3-M7 rebuild review update: floor-plan recognition now carries label evidence and full layer-use evidence. `recognizePlanDxf()` exposes `labelEvidence`, `recognizedLayers`, `unusedLayers`, and `layerUsage`, while `assemblePlansToImportCandidate()` summarizes per-story labels under `planAssembly.labelEvidence`. This supports the plan's label-mapping and human-review requirements without auto-confirming drawing interpretation.

2026-07-03 DWG preflight update: `buildDwgConversionPreflight()` now records whether the converter file, source DWG, and output directory have been host-checked. `tools/convert-dwg.mjs` includes that preflight result in its JSON output, performs host file/directory checks when explicit booleans are not supplied, and exposes `readyToExecute` separately from `ok`. AI agents can therefore distinguish "plan is structurally ready" from "safe to execute on this machine." The drawing validation review preserves this preflight row under each DWG conversion evidence item.

2026-07-03 closed-polyline column update: `recognizePlanDxf()` now detects small closed polyline loops on column layers as column candidates and records `closedPolylineColumns` in the audit counts. This covers the P3-M7 plan requirement for closed-polyline column detection while keeping the result as reviewable candidate evidence.

2026-07-03 plan-unit review: `recognizePlanDxf()` now applies `$INSUNITS` scaling before column, beam, label, and closed-polyline recognition. The audit exposes `units` with declared code, unit name, scale, and missing-unit suspicion, and `tests/p3-m7-dwg-plan.mjs` verifies that a millimeter floor plan produces meter-space column and beam coordinates.

2026-07-03 import server validation: `server/routes/imports.mjs` now validates both saved `candidate` payloads and `resolvedCandidate` payloads with the shared `ImportCandidate` contract before persistence. `tests/p3-m7-import-review-ui.mjs` covers invalid initial import saves and invalid confirmed-resolution candidates, matching the plan rule that import audit records are saved only after candidate validation.

2026-07-03 plan overlay evidence update: `assemblePlansToImportCandidate()` now records `planAssembly.overlayEvidence` with per-story source layers, recognized and unused layers, candidate counts, candidate member rows, and an agent decision. `summarizeImportEntry()` carries this into `review.planAssembly.overlayEvidence` so browser-control and API agents can inspect the same overlay-review basis before confirming a 2D plan assembly.

## Current Test Gate

P3-M7 is covered by:

| Test | Coverage |
| --- | --- |
| `tests/p3-m7-dwg-plan.mjs` | DWG contract, plan recognition, two-story assembly, review summary |
| `tests/p3-m7-import-review-ui.mjs` | import review screen, confirm/reject actions, agent adjustment history |

## Remaining Limits

P3-M7 remains preliminary. Real DWG conversion requires an installed external converter. Plan recognition needs more office drawing fixtures and visual overlay evidence before it can be considered production-grade.

2026-07-03 practice-validation update: `getPhase3DrawingImportValidationReview` now records DWG conversion readiness/log evidence and import review decision rows. The new `test:p3drawing` runner entry keeps drawing validation evidence in the P3-M7 gate while preserving the external-converter and owner-review requirements.
