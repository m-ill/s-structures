# Phase 3 Point Cloud Import Plan

status: active
milestones: P3-M8 point-cloud load/viewer, P3-M9 structural extraction

## Goal

Point-cloud input should help create a reviewable structural `ImportCandidate` from existing building scans. The system must expose confidence, evidence, and limitations. It must not claim fully automatic field modeling until owner-provided real scans are validated.

## Supported Formats

| Format | Status | Note |
| --- | --- | --- |
| XYZ/TXT | v1 | `x y z` or `x y z r g b` text rows |
| PLY | v1 | vertex coordinates and optional color |
| PCD | v1 | ASCII first; binary remains later work |
| LAS | planned owner-file validation | validate when real samples are supplied |
| LAZ/E57 | not v1 | guide user through external conversion such as CloudCompare or PDAL |

Large files must be chunk-parsed and processed through a worker-safe pipeline. The viewer receives downsampled buffers while extraction can use separate prepared data.

## Pipeline

```text
file
 -> worker parse
 -> normalize units and origin
 -> voxel downsample
 -> outlier filtering
 -> viewer buffer
 -> story/column/beam/wall extraction
 -> ImportCandidate
 -> human review
```

Coordinates are normalized to meter and z-up. Any origin shift must be recorded in the audit trace.

## P3-M8 Load And Viewer

| Module | Responsibility |
| --- | --- |
| `src/import/pointcloud/loaders.js` | XYZ/PLY/PCD text loader |
| `src/import/pointcloud/normalize.js` | bbox, unit, and origin normalization |
| `src/import/pointcloud/voxel.js` | voxel downsample |
| `src/import/pointcloud/outlier.js` | sparse outlier filtering |
| `src/import/pointcloud/worker.js` | worker-safe pipeline contract |
| `src/viewer/pointCloudLayer.js` | render buffer contract |

P3-M8 closes the skeleton for file loading and review. Large real-file performance evidence must be added separately when sample files are available.

## P3-M9 Structure Extraction

### Story Detection

```text
z histogram
 -> dominant slab/ceiling peaks
 -> horizontal plane evidence
 -> story level candidates
```

Story candidates should be compatible with the existing story-level model contract.

### Column Detection

```text
between-story point slice
 -> xy clustering
 -> vertical continuity check
 -> bbox/PCA section estimate
 -> column candidate with confidence
```

Column confidence is based on vertical coverage, section fit, and point density.

### Beam Detection

```text
near ceiling band
 -> linear cluster or synthetic fixture evidence
 -> span axis estimate
 -> beam candidate
```

Current automated beam extraction is mostly synthetic-fixture driven. Real scans require review UI correction because ceiling clutter and services can hide beams.

### Wall Detection

Wall extraction requires plane extraction and panel grouping. P3-M9 may expose preliminary wall evidence, but real scan validation is required before production use.

## Confidence Model

| Candidate | Evidence |
| --- | --- |
| story | histogram peak strength, plane inlier ratio |
| column | vertical coverage, section fit, density |
| beam | linearity, length, ceiling-band support |
| wall | plane inlier ratio, panel area, story continuity |

| Range | Meaning |
| --- | --- |
| >= 0.8 | high-confidence candidate, still review-required |
| 0.5 - 0.8 | review-required candidate |
| < 0.5 | audit-only evidence |

## Synthetic Benchmark

Before owner scan files arrive, the automated gate uses deterministic synthetic point clouds.

```text
representative model
 -> structural surface sampling
 -> noise and occlusion
 -> point cloud
 -> ground-truth JSON
 -> extraction benchmark
```

| Metric | Target |
| --- | --- |
| story count | exact |
| story elevation error | < 30 mm |
| column recall / precision | >= 0.9 / >= 0.9 |
| column axis error | < 50 mm |
| beam recall | >= 0.75 |

## Fixtures And Tests

| Test | Scope |
| --- | --- |
| `tests/p3-pointcloud-load.mjs` | loader, normalization, downsample |
| `tests/p3-pointcloud-extraction.mjs` | synthetic story/column/beam/wall extraction benchmark |
| `tests/p3-pointcloud-e2e.mjs` | point-cloud candidate to model to elastic analysis |
| `tests/fixtures/pointcloud/*` | compact deterministic fixtures |

## Exit Criteria

P3-M8 can close only when:

1. XYZ/PLY/PCD fixtures load deterministically.
2. Normalization, downsample, and worker pipeline return auditable metadata.
3. Viewer buffer contract is stable for AI and UI inspection.

P3-M9 can close only when:

1. Synthetic benchmark passes story and column extraction gates.
2. Extracted candidate validates as `ImportCandidate`.
3. Candidate converts to an analysis model and elastic analysis runs.
4. Real scan validation status is explicit if no owner-provided scan file exists.

## Current Limit

P3-M9 remains preliminary until real owner point-cloud files are supplied and reviewed.
