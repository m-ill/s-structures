# P3-M6 To P3-M9 Input Pipeline Verification

date: 2026-07-03
status: preliminary import core locked

## Scope

This note reviews Stage B against `docs/phase3/IMPORT_DXF_DWG_PLAN.md`, `docs/phase3/IMPORT_POINT_CLOUD_PLAN.md`, and tickets P3-T26 to P3-T45.

## Verified Items

| Milestone | Evidence |
| --- | --- |
| P3-M6 DXF import v1 | `tests/p3-m6-dxf-import.mjs` covers parser, entities, unit scaling, layer audit, unsupported entity audit, candidate validation, and candidate-to-model analysis path. |
| P3-M7 DWG and plan recognition | `tests/p3-m7-dwg-plan.mjs` covers missing/configured converter contracts, preflight states, two-story plan assembly, recognition quality, and review readiness. |
| P3-M8 point-cloud load/viewer contract | `tests/p3-pointcloud-load.mjs` covers XYZ/PLY/PCD fixture loading, normalization, downsample, worker pipeline metadata, and viewer buffer contract. |
| P3-M9 point-cloud extraction | `tests/p3-pointcloud-extraction.mjs` and `tests/p3-pointcloud-e2e.mjs` cover synthetic story/column/beam/wall extraction, candidate validation, and elastic analysis path after review. |
| Agent review surface | `tests/p3-import-milestone-review.mjs` exposes `getPhase3ImportMilestoneReview()` for AI-agent inspection of M6 to M9 status and remaining field evidence. |

## Review Finding

The import plan requires drawing and point-cloud input to produce a reviewable `ImportCandidate`, not an automatically final analysis model. The import review UI already checks candidate validation before confirmation, but the candidate-to-model helper did not surface invalid candidate state strongly enough for downstream API and AI-agent inspection.

2026-07-03 candidate validation hardening: `importCandidateToModel()` now records `meta.importValidation` and marks invalid candidates as `meta.importReview.status = "invalid-candidate"`. Invalid candidates remain `required: true`, cannot become confirmed even when a caller passes `confirmed: true`, expose validation errors as blockers, and return `agentDecision = "fix-import-candidate-before-analysis"`.

## Remaining Limits

Stage B remains preliminary for production drawing and scan use. Required external evidence still includes real office DXF variants, configured DWG converter logs, visual overlay review evidence, large point-cloud performance evidence, binary LAS/PCD owner fixtures, and real scan beam/wall validation.
