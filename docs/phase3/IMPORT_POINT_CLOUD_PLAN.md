# Phase 3 Point Cloud Import Plan

status: active
milestones: P3-M8 point-cloud load/viewer, P3-M9 structural extraction

## Goal

현장 스캔 점군에서 층, 기둥, 보, 벽 후보를 추출해 `ImportCandidate`를 만든다. 실제 점군은 결측, 노이즈, 가림이 많기 때문에 자동 확정이 아니라 검토 가능한 후보와 confidence/evidence를 제공하는 것이 목표다.

## Supported Formats

| Format | Status | Note |
| --- | --- | --- |
| XYZ/TXT | v1 | `x y z` 또는 `x y z r g b` |
| PLY | v1 | vertex 좌표와 선택 색상 |
| PCD | v1 | ascii 우선, binary는 확장 대상 |
| LAS | planned | 실제 파일 확보 후 검증 |
| LAZ/E57 | not v1 | CloudCompare 또는 PDAL 변환 안내 |

대형 파일은 chunk parsing과 worker 처리를 전제로 한다. 뷰어에는 downsample된 버퍼를 전달하고, 원본은 추출 worker가 별도로 사용한다.

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

좌표는 z-up, meter 기준으로 정규화한다. 큰 현장 좌표는 원점 이동 offset을 trace에 남긴다.

## P3-M8 Load And Viewer

| Module | Responsibility |
| --- | --- |
| `src/import/pointcloud/loaders.js` | XYZ/PLY/PCD text loader |
| `src/import/pointcloud/normalize.js` | bbox, unit, origin normalization |
| `src/import/pointcloud/voxel.js` | voxel downsample |
| `src/import/pointcloud/outlier.js` | sparse outlier filtering |
| `src/import/pointcloud/worker.js` | worker-safe pipeline contract |
| `src/viewer/pointCloudLayer.js` | render buffer contract |

P3-M8의 목적은 “큰틀 준비”다. 실제 현장 파일 성능 검증은 대표 파일을 받은 뒤 별도 evidence로 닫는다.

## P3-M9 Structure Extraction

### Story Detection

```text
z histogram
 -> dominant slab/ceiling peaks
 -> horizontal plane evidence
 -> story level candidates
```

층 검출 결과는 `src/core/storyLevels.js` 계열과 호환되는 story level 형식으로 정규화한다.

### Column Detection

```text
between-story point slice
 -> xy clustering
 -> vertical continuity check
 -> bbox/PCA section estimate
 -> column candidate with confidence
```

confidence는 수직 커버리지, 단면 치수 안정성, cluster density를 근거로 계산한다.

### Beam Detection

```text
near ceiling band
 -> linear cluster or synthetic fixture evidence
 -> span axis estimate
 -> beam candidate
```

현재 자동화는 synthetic fixture 중심이다. 실제 점군에서는 천장 가림과 설비 간섭 때문에 검토 UI 보정이 필수다.

### Wall Detection

벽체는 plane extraction과 panel grouping이 필요하다. P3-M9의 완전 완료 조건에는 포함하지만, 실제 scan 검증 전에는 preliminary로 표시한다.

## Confidence Model

| Candidate | Evidence |
| --- | --- |
| story | histogram peak strength, plane inlier ratio |
| column | vertical coverage, section fit, density |
| beam | linearity, length, ceiling-band support |
| wall | plane inlier ratio, panel area, story continuity |

Default thresholds:

| Range | Meaning |
| --- | --- |
| >= 0.8 | high-confidence candidate, still requires review |
| 0.5 - 0.8 | review-required candidate |
| < 0.5 | audit-only evidence |

## Synthetic Benchmark

실제 점군 파일을 받기 전에는 대표 건물 모델에서 synthetic point cloud를 생성해 회귀 테스트를 유지한다.

```text
representative model
 -> structural surface sampling
 -> noise and occlusion
 -> point cloud
 -> ground-truth JSON
 -> extraction benchmark
```

Target at light noise:

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
| `tests/p3-pointcloud-load.mjs` | loader, normalize, downsample |
| `tests/p3-pointcloud-extraction.mjs` | synthetic story/column extraction benchmark |
| `tests/p3-pointcloud-e2e.mjs` | point cloud candidate to model to elastic analysis |
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
