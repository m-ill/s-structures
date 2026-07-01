# Phase 3 Point Cloud Import Plan

status: active
milestones: P3-M8(로드/뷰어), P3-M9(구조 추출)

## Goal

현장 스캔 점군에서 층/기둥/보/벽을 검출해 현황 모델 **후보**를 만들고, 점군 위에 겹쳐 검토·확정한다. 리모델링/안전진단 시나리오(PRD S2)가 기준이다.

## Formats

| 포맷 | 상태 | 비고 |
| --- | --- | --- |
| XYZ/TXT (x y z [r g b]) | v1 | 구분자 자동 감지 |
| PLY (ascii, binary LE) | v1 | vertex 요소만 사용 |
| PCD (ascii, binary) | v1 | |
| LAS 1.2-1.4 비압축 | v1.5 (P3-T37) | point format 0-3 |
| LAZ, E57 | 미지원 | CloudCompare/PDAL 변환 안내 문구 제공 |

로더는 스트리밍 chunk 파싱으로 구현하고 좌표는 SoA `Float32Array`(x,y,z 인터리브)로 적재한다. 색상은 옵션 `Uint8Array`.

## Pipeline (Web Worker)

```text
file
 -> [worker] parse (chunk streaming, 진행률 이벤트)
 -> [worker] 정규화: 단위 추정(bbox), z-up 확인, 원점 이동(대좌표 GPS계 offset 제거)
 -> [worker] voxel downsample (기본 50mm, 뷰어용 별도 예산 2e6점)
 -> [worker] statistical outlier removal (kNN 거리 표준편차 기준)
 -> [main] 뷰어 버퍼 전달 (Transferable)
 -> [worker] 구조 추출 (M9, 아래)
 -> [main] ImportCandidate + confidence -> 검토 UI
```

성능 예산 (NFR-01/02): 1e7점 로드+전처리 30초, 뷰어 2e6점 60fps, 메인스레드 블로킹 없음.

## Structure Extraction (M9)

### 1. 층 검출 (P3-T41)

```text
z-히스토그램 (bin 20mm)
 -> 피크 = 바닥/천장 슬래브 후보
 -> 피크 주변 점으로 수평면 RANSAC (법선 z 허용 오차 5도)
 -> 슬래브 상면 z -> story levels (바닥-천장 쌍으로 층고 산정)
```

기존 `src/core/storyLevels.js` 계약과 동일한 story 출력으로 정규화한다.

### 2. 기둥 검출 (P3-T42)

```text
층 슬래브 사이 구간 점 추출
 -> xy 평면 투영 -> grid 셀 밀도 클러스터링 (DBSCAN, eps 100mm)
 -> 클러스터별 수직 연속성 검사 (z 커버리지 > 층고의 70%)
 -> 단면 추정: 클러스터 xy bbox/PCA -> 원형/사각 + 치수
 -> 기둥 축 = 클러스터 중심 수직선
```

### 3. 보/벽 검출 (P3-T43)

| 대상 | 방법 |
| --- | --- |
| 보 | 천장 슬래브 하부 구간 점 → 수평 선형 클러스터 (PCA 1축 지배) → 축선 + 춤/폭 추정 |
| 벽 | 수직 평면 RANSAC (법선 수평) → 폐합/연속 패널 → P2 wall panel 준비 계약과 연결 |

### 출력

모든 후보는 `ImportCandidate` 공통 계약(ARCHITECTURE)으로 출력하며 confidence와 evidence(지지 점 수, 잔차, 커버리지)를 포함한다. 검출 실패 구간은 빈 후보가 아니라 `uncovered regions` audit으로 표시한다.

## Confidence Model

| 요소 | confidence 근거 |
| --- | --- |
| story | 피크 점 수 / RANSAC inlier 비율 |
| column | 수직 커버리지 × 단면 적합 잔차 |
| beam | 선형성(PCA 고유값 비) × 길이 |
| wall | inlier 비율 × 패널 면적 |

0.8 이상 자동 체크(확정 대기), 0.5-0.8 검토 필요 표시, 0.5 미만 기본 해제. 임계값은 설정 가능.

## Synthetic Benchmark (P3-T44)

실측 점군은 크고 비결정적이므로, **대표건물 모델 → 표면 샘플링 점군** 생성기로 ground-truth 벤치마크를 만든다.

```text
tools/generate-synthetic-pointcloud.mjs
  대표건물 model
   -> 부재 표면 메쉬화 (단면 치수 반영)
   -> 표면 균일 샘플 (밀도 파라미터)
   -> 가우시안 노이즈 (σ 5/10/20mm) + 랜덤 결측 (occlusion 시뮬레이션)
   -> PLY 출력 + ground-truth JSON (stories, columns, beams)
```

| 지표 | 목표 (σ=10mm, 결측 20%) |
| --- | --- |
| story 검출 | 층수 일치, elevation 오차 < 30mm |
| column recall / precision | ≥ 0.9 / ≥ 0.9 |
| column 축 위치 오차 | < 50mm |
| beam recall | ≥ 0.75 |

결과는 `reports/pointcloud-benchmark/`에 생성하고 `tests/p3-pointcloud-extraction.mjs`가 tolerance 게이트로 실행한다.

## Numeric Utilities (자체 구현, 의존성 없음)

| 유틸 | 위치 | 비고 |
| --- | --- | --- |
| voxel grid | `src/import/pointcloud/voxel.js` | 해시 맵 기반 |
| kNN (grid 가속) | `pointcloud/knn.js` | outlier 제거용 |
| RANSAC plane | `pointcloud/ransac.js` | 시드 고정 옵션 (테스트 결정성) |
| DBSCAN | `pointcloud/dbscan.js` | grid 인덱스 가속 |
| PCA 3x3 | `pointcloud/pca.js` | Jacobi 고유분해 |

모든 무작위 알고리즘은 seed 옵션을 받아 테스트에서 결정적으로 돈다.

## Tests

1. `tests/p3-pointcloud-load.mjs` — 포맷별 로더, 정규화, downsample 수치.
2. `tests/p3-pointcloud-extraction.mjs` — 합성 벤치마크 tolerance 게이트.
3. `tests/p3-pointcloud-e2e.mjs` — 합성 점군 → 후보 → 확정 → validation 통과 모델 → 탄성해석 ok.
4. fixture: `tests/fixtures/pointcloud/`에는 소형(수만 점) 파일만 커밋, 대형은 생성기로.
