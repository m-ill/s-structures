# P3-M8 Point Cloud Load Verification

date: 2026-07-02
status: preliminary core locked

## Scope

This note verifies P3-M8 against `docs/phase3/IMPORT_POINT_CLOUD_PLAN.md`.

## Verified Items

| Plan item | Evidence |
| --- | --- |
| XYZ/TXT, PLY, PCD compact loaders | `src/import/pointcloud/loaders.js`, `tests/p3-pointcloud-load.mjs` |
| Loader audit metadata | `parsePointCloudWithAudit()` records detected format, line count, parsed count, rejected count, and color count |
| Normalization metadata | `src/import/pointcloud/normalize.js` records bbox, origin, and scale |
| Voxel downsample | `src/import/pointcloud/voxel.js` and worker audit counts |
| Sparse outlier filtering | `src/import/pointcloud/outlier.js` and worker audit stages |
| Worker-safe pipeline contract | `src/import/pointcloud/worker.js` returns processed points and audit |
| Viewer buffer contract | `src/viewer/pointCloudLayer.js` returns typed positions/colors |
| Agent-readable import state | `summarizePointCloudImport()` returns counts, normalization, stages, viewer buffer, and warnings |
| Stage-level audit rows | worker audit exposes parse/normalize/downsample/outlier input, output, and dropped counts |
| Viewer buffer metadata | viewer output exposes typed-array names, byte counts, input/filtered counts, and z-filter state |
| Origin shift trace | normalization audit exposes `bboxSize`, `originShift`, and `pointcloud-origin-shifted` warning for large-coordinate scans |

## Added Review Finding

The P3-M8 modules had separate worker and viewer contracts, but no single summary that an AI agent could read to decide whether the point cloud is ready for review. `POINT_CLOUD_IMPORT_SUMMARY_VERSION` now provides that contract.

2026-07-02 review update: The worker pipeline now carries loader audit metadata through the import summary. AI agents can inspect the detected point-cloud format and rejected point count before deciding whether a file is suitable for review or needs re-export.

2026-07-02 follow-up: P3-M8 now exposes step-level pipeline rows and viewer buffer metadata. `processPointCloudText()` records `stageRows`, and `buildPointCloudLayerData()` returns typed-array metadata so UI and AI agents can verify the render buffer without inspecting binary arrays directly.

2026-07-02 contract update: `summarizePointCloudImport()` now exposes a P3-M8 `contract`, readiness flags, transferable viewer-buffer metadata, performance-budget targets, pending binary/LAS formats, and real-scan validation status. This keeps compact fixture readiness separate from large-field-file proof and prevents AI agents from treating P3-M8 as completed production scan validation.

2026-07-02 origin-shift review: `normalizePointCloud()` now records `bboxSize` and `originShift`, the worker normalize stage carries the same trace, and `summarizePointCloudImport()` exposes it under `normalization`. Shifted field-coordinate scans now add `pointcloud-origin-shifted` so AI agents can distinguish a normal small fixture from a large-coordinate import that was moved near the local origin.

## Current Test Gate

`tests/p3-pointcloud-load.mjs` verifies:

1. Text fixture loading for XYZ, PLY, and PCD.
2. Normalize, voxel downsample, and outlier-filter audit counts.
3. Viewer buffer length and filtered count.
4. Agent manifest data contract for point-cloud viewer buffer and import summary.
5. Stage-level worker rows and typed viewer buffer metadata.
6. P3-M8 contract tickets, transferable buffer readiness, performance-budget pending status, and real-scan pending status.
7. Origin shift trace for large-coordinate point-cloud inputs.

## Remaining Limits

P3-M8 remains preliminary. Large-file performance, binary point-cloud formats, LAS, and real scan validation require owner-provided field files or agreed sample data.

2026-07-03 practice-validation update: `getPhase3PointCloudValidationReview` now records loader/worker/viewer readiness, real-scan evidence, and large-file performance records. `test:p3pointcloud` keeps the P3-M8 large-field-file requirements visible while compact XYZ/PLY/PCD fixtures remain the automated regression path.
