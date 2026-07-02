# Phase 3 DXF/DWG Import Plan

status: active
milestones: P3-M5 geometry core, P3-M6 DXF import v1, P3-M7 DWG and plan recognition v2

## Goal

건축구조 도면에서 해석 가능한 3D 구조 모델 후보를 만든다. 자동 인식 결과는 바로 확정 모델이 아니라 `ImportCandidate`로 남기고, 사용자가 검토 UI에서 확인한 뒤 해석 모델로 변환한다.

## Input Paths

| Path | Milestone | Method |
| --- | --- | --- |
| 3D wireframe DXF | P3-M6 | 구조 축선을 LINE/POLYLINE으로 읽어 노드와 부재 후보로 매핑 |
| 2D floor-plan DXF | P3-M7 | 층별 평면, 층고, 기둥/보 라벨을 조합해 3D 골조 후보 생성 |
| DWG | P3-M7 | 외부 변환기로 ASCII DXF를 만든 뒤 동일 파이프라인 사용 |

DWG는 직접 바이너리 파서를 만들지 않는다. 변환기가 없으면 사용자가 CAD에서 DXF로 저장하도록 안내하고, 결과에는 변환기 미설치 사유를 명확히 남긴다.

## P3-M6 DXF Parser

ASCII DXF group-code/value 스트림을 자체 파싱한다.

| Part | Output |
| --- | --- |
| HEADER | `$INSUNITS`, `$EXTMIN`, `$EXTMAX`, `$ACADVER` |
| TABLES | LAYER 이름, 색상, 상태 |
| BLOCKS | INSERT 전개용 블록 정의 |
| ENTITIES | 구조 후보로 변환 가능한 기본 형상 |

Supported v1 entities:

| Entity | Use |
| --- | --- |
| LINE | 기둥, 보, 가새 축선 후보 |
| LWPOLYLINE / POLYLINE | 연속 부재, 평면 외곽, 벽체 후보 |
| POINT | 기준점 또는 보조 노드 후보 |
| CIRCLE | 평면 기둥 후보 |
| INSERT + BLOCK | 반복 기둥/부재 블록 전개 |
| TEXT / MTEXT | 그리드, 층, 부재 라벨 후보 |

미지원 entity는 버리지 않고 audit에 종류와 수량을 기록한다.

## Normalization

| Item | Rule |
| --- | --- |
| Unit | `$INSUNITS`를 우선 사용하고, 없으면 bbox 크기로 mm/m 의심 경고 기록 |
| Axis | 모델은 z-up 기준으로 정규화 |
| Origin | 큰 좌표 도면은 선택적으로 bbox 기준 원점 이동 |
| Tolerance | P3-M5 geometry core의 병합 tolerance 사용 |

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

기본 분류 기준은 `|dz| / length`이다. 수직에 가까우면 column, 수평에 가까우면 beam, 그 외는 brace 후보로 둔다. 최종 종류와 단면은 layer map에서 보정한다.

## Layer Mapping

Layer 이름에서 구조 종류, 단면, 재료를 추정하되 사용자가 검토 UI에서 수정할 수 있어야 한다.

```js
{ layer: 'S-COL-H400', kind: 'column', section: 'H-400x200x8x13', material: 'SS275' }
```

Coverage audit는 다음을 포함한다.

| Field | Meaning |
| --- | --- |
| layers | 도면 전체 layer 목록 |
| mappedLayers | 매핑이 적용된 layer |
| unmappedEntityCount | 미매핑 entity 수 |
| unknownKindMembers | 종류가 불명확한 부재 후보 |

## P3-M7 Plan Recognition

2D 평면 인식은 완전 자동 확정이 아니라 검토 가능한 후보 생성이 목표다.

| Step | Method |
| --- | --- |
| Grid detection | 장직선, 축선 layer, TEXT 라벨 조합 |
| Column detection | CIRCLE, 폐합 polyline, 기둥 block INSERT, grid 교차 근처 후보 |
| Beam detection | 평행선 중심선, beam layer, span 라벨 조합 |
| Story assembly | 층별 elevation 입력 또는 라벨로 3D 조립 |
| Label mapping | G1, B2, C1 같은 부재 라벨을 단면표와 연결 |

초기 목표는 대표 fixture에서 기둥 recall 0.9 이상, 보 recall 0.8 이상이다. 실도면에서는 검토 UI에서 보완하는 흐름을 기본으로 한다.

## DWG Adapter

```text
DWG file
 -> configured external converter
 -> ASCII DXF
 -> standard DXF parser
 -> ImportCandidate
```

필수 결과:

| Case | Required behavior |
| --- | --- |
| converter configured | 변환 명령 계획과 대상 DXF 경로 반환 |
| converter missing | 명확한 missing-converter result 반환 |
| conversion failed | 실패 로그와 사용자가 할 수 있는 DXF 저장 안내 반환 |

## Import Audit Contract

```js
{
  counts: { lines, polylines, inserts, texts, ignored: {} },
  units: { declared, applied, suspicion },
  bbox: { min, max, sizeM },
  merge: { nodesBefore, nodesAfter, shortSegmentsDropped, duplicatesDropped },
  mapping: { layers, mappedLayers, unmappedEntityCount },
  orphans: { nodes, unknownKindMembers },
  warnings: []
}
```

Audit는 모델 생성 이력과 보고서 trace에 남아야 하며, AI agent가 import 품질을 판단할 수 있는 읽기 API에 노출한다.

## Fixtures And Tests

| Test | Scope |
| --- | --- |
| `tests/p3-m6-dxf-import.mjs` | parser, entities, block/polyline, unit scaling, layer audit |
| `tests/p3-m7-dwg-plan.mjs` | DWG adapter contract, 2D plan recognition, two-story assembly |
| `tests/fixtures/dxf/min-frame.dxf` | 최소 3D wireframe fixture |
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
