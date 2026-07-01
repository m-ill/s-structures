# Phase 3 DXF/DWG Import Plan

status: active
milestones: P3-M5(공통 기하), P3-M6(DXF v1), P3-M7(DWG/평면 인식 v2)

## Goal

건축구조 도면(DXF/DWG)을 넣으면 해석 가능한 3D 모델 **후보**를 생성하고, human-in-loop 검토로 확정한다. 자동 인식은 후보일 뿐이며 확정 없이 model이 되지 않는다 (Phase 3 원칙 2).

## Input Paths

| 경로 | 상태 | 방법 |
| --- | --- | --- |
| A. 3D wireframe DXF | v1 (M6) | 구조 모델을 라인으로 그린 도면 → 직접 부재 매핑 |
| B. 2D 층별 평면 DXF | v2 (M7) | 평면 n장 + 층고 → 3D 조립 |
| C. DWG | v2 (M7) | ODA File Converter로 DXF 변환 후 A/B 경로 |

DWG는 사유 포맷이므로 직접 파싱하지 않는다 (ARCHITECTURE D8). 변환기 미설치 시 "CAD에서 DXF로 저장" 안내를 1급 UX로 제공한다.

## DXF Parser (P3-T26~T27)

ASCII DXF를 자체 파싱한다. group code(정수)/value 쌍 스트림 → 섹션 → entity.

| 단계 | 모듈 | 내용 |
| --- | --- | --- |
| tokenize | `src/import/dxf/parser.js` | 2줄 단위 (code, value) 스트림, 인코딩 cp949/utf8 감지 |
| HEADER | 〃 | `$INSUNITS`(단위), `$EXTMIN/$EXTMAX`(범위), `$ACADVER` |
| TABLES | 〃 | LAYER 테이블 (이름, 색, 동결 여부) |
| BLOCKS | 〃 | 블록 정의 저장 (INSERT 전개용) |
| ENTITIES | `entities.js` | 아래 entity를 geometry로 정규화 |

지원 entity v1:

| Entity | 용도 |
| --- | --- |
| LINE | 부재 축 후보 |
| LWPOLYLINE / POLYLINE(3D) | 연속 부재, 폐합이면 기둥/벽 단면 후보 |
| POINT | 노드 힌트 |
| CIRCLE | 원형 기둥 심볼 (2D 평면) |
| ARC | 참고 (v1은 무시하되 audit에 카운트) |
| INSERT + BLOCK | 변환(이동/회전/스케일) 적용 후 내부 entity 전개 |
| TEXT / MTEXT | grid 라벨, 층고/부재 라벨 힌트 |

바이너리 DXF는 v1 미지원 (audit에 안내). 미지원 entity는 무시하지 않고 audit에 종류별 카운트를 남긴다.

## Normalization (P3-T28)

| 항목 | 규칙 |
| --- | --- |
| 단위 | `$INSUNITS` → 내부 단위(m) 변환. 없으면 bbox 크기로 mm/m 추정 + `unitSuspicion` warning |
| 축 | 도면 z-up 가정. 2D 평면은 z=0 → 층 elevation으로 이동 |
| 원점 | bbox 최소점 기준 이동 옵션 (대좌표 도면의 수치 안정성) |
| 정밀도 | tolerance merge는 M5 공통 유틸 사용 (기본 5mm, 사용자 조정) |

## Path A: Wireframe Mapping (P3-T29)

```text
lines
 -> tolerance merge (endpoint -> node)
 -> 중복/미소 선분 제거
 -> 방향 분류: |dz|/len > 0.85 기둥, < 0.15 보, 그 외 가새
 -> z-클러스터 -> story 후보
 -> x/y 정렬 라인 -> grid 후보
 -> ImportCandidate 출력 (confidence: merge 품질/길이/직교성 기반)
```

## Layer Mapping (P3-T30)

layer 이름 → 부재 종류/단면/재료 매핑 테이블. 프로젝트에 저장되어 재사용된다.

```js
{ layer: 'S-COL-H400', kind: 'column', section: 'H-400x200x8x13', material: 'SS275' }
```

| 규칙 | 내용 |
| --- | --- |
| 초기 추정 | 이름 패턴(COL/GIR/BEAM/BRC, 치수 토큰) 휴리스틱으로 초안 생성 |
| 편집 | import 검토 UI 매핑 패널에서 수정 |
| coverage audit | 미매핑 layer의 entity 수를 audit에 표시. 미매핑은 kind=unknown 후보로 유지 |

## Path B: 2D Plan Recognition (P3-T33~T34)

| 단계 | 방법 |
| --- | --- |
| grid 인식 | 긴 직선 + 축선 layer + 원문자 라벨(TEXT) 조합 → X/Y grid |
| 기둥 인식 | CIRCLE, 폐합 사각 폴리라인, 기둥 블록 INSERT → grid 교차점 스냅 |
| 보 인식 | 평행 이중선(플랜지 폭) 또는 단선 중심선 + 보 라벨 → grid span |
| 층 조립 | 평면별 elevation 입력(층고표) → 기둥 상하 연결, 보 배치 |
| 라벨 매핑 | 부재 라벨 텍스트(예: G1, B2, C1) → 부재 일람 매핑 테이블 |

인식률 목표: 대표 평면 fixture에서 기둥 recall ≥ 0.9, 보 recall ≥ 0.8 (검토 UI에서 보완 전제). 결과 리포트는 `reports/import-recognition/`에 생성.

## DWG Adapter (P3-T32)

```text
tools/convert-dwg.mjs
 1. 설정된 ODA File Converter 경로 확인 (server config 또는 로컬 설정)
 2. 임시 폴더에서 DWG -> DXF (ACAD2018, ASCII) 변환 실행
 3. 변환 DXF를 표준 파이프라인에 전달
 4. 실패/미설치 -> IMPORT_DWG_CONVERTER_MISSING 안내 (DXF 저장 가이드 링크)
```

Electron 배포에서는 변환기 경로를 앱 설정에서 지정한다. 웹 배포에서는 서버 측 변환(업로드된 DWG를 서버가 변환) 옵션을 제공한다 — 서버에 변환기가 설치된 경우만.

## Import Audit (P3-T31)

```js
{
  counts: { lines, polylines, inserts, texts, ignored: { arc: 3, ... } },
  units: { declared, applied, suspicion },
  bbox: { min, max, sizeM },
  merge: { nodesBefore, nodesAfter, shortSegmentsDropped, duplicatesDropped },
  mapping: { layers, mappedLayers, unmappedEntityCount },
  orphans: { nodes, unknownKindMembers },
  warnings: [...],
}
```

audit은 import 기록과 함께 서버에 저장하고, 확정 모델의 derivation trace에 `source: dxf-import` 참조를 남긴다.

## Fixtures And Tests

| Fixture | 내용 |
| --- | --- |
| `tests/fixtures/dxf/min-frame.dxf` | 라인 8개 단층 프레임 (손으로 작성한 최소 ASCII DXF) |
| `tests/fixtures/dxf/block-insert.dxf` | INSERT 변환 전개 검증 |
| `tests/fixtures/dxf/units-mm.dxf` | 단위 변환/의심 검출 |
| `tests/fixtures/dxf/plan-2story/*.dxf` | 평면 2장 + 층고 조립 (M7) |
| 생성기 | `tools/generate-dxf-fixtures.mjs` — 대표건물 모델 → wireframe DXF 역생성 (round-trip 검증) |

테스트: `tests/p3-import-dxf.mjs` (파서/정규화/매핑/audit), `tests/p3-import-plan.mjs` (M7). 역생성 round-trip: 대표건물 → DXF → import → 노드/부재 수, 좌표 오차 검증.
