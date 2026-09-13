# Phase 3 Design Modules Plan

status: active
milestones: P3-M17(RC), P3-M18(철골/기초/접합)
source: P2 T34-T40 이월 — Phase 4 없음, Phase 3에서 완결

## Purpose

현재 설계 모듈은 간이 검토 수준이다 (`concrete.js`: 단면 휨/전단/축 개별 ratio, `steel.js`: 허용응력 비교, PM 상관/2축휨/LTB 상세 없음). 이를 **사무소 계산서에 그대로 실을 수 있는 상세 설계**로 확장한다. 모든 검토는 지배식 trace(P2 member design trace 계약)와 연결한다.

## Design Basis

| 항목 | 기준 |
| --- | --- |
| RC | KDS 14 20 (콘크리트구조), 강도설계법 |
| 철골 | KDS 14 31 (강구조), 한계상태설계법 |
| 기초 | KDS 14 20 + KDS 11 50 (지반 허용지지력은 입력값) |
| 기준식 관리 | `src/standards/` registry — 기준 ID, 조항, formula ID가 계산서에 출력 (P2 M3-1 계약 계승) |

demand는 P2 design demand package(지배조합 N/V/M + station)와 M11 clear length를 소비한다.

## P3-M17 RC Detailed Design

### RC 보 (P3-T87)

| 검토 | 내용 |
| --- | --- |
| 휨 | 단철근/복철근 소요 As, 최소/최대 철근비, 정/부모멘트 station별 |
| 전단 | Vc + Vs, 스터럽 간격 산정, 최소 전단철근 |
| 비틀림 | 임계 비틀림 초과 시 종/횡 보강 (v1: 검토 + warning) |
| 사용성 | 처짐(장기 포함 λΔ), 균열 간접 검토(철근 간격) |
| 배근 | 주근/스터럽 자동 선정 (기존 `selectLongitudinalBars` 확장), 정착/이음 길이 |
| 산출 | 보 일람표 (station 다이어그램 + 배근 schedule) |

### RC 기둥 (P3-T88)

| 검토 | 내용 |
| --- | --- |
| PM 상관 | 축력-모멘트 상관도 생성 (fiber strip 적분), 2축휨은 등가 1축 or 상관도 방식 |
| 세장 | 비지지길이, 모멘트 확대계수 (비횡구속/횡구속) |
| 전단/횡보강 | 띠철근/나선철근 간격, 내진 상세 옵션 |
| 산출 | 기둥 일람표 + PM 상관도 그림 데이터 |

### RC 벽체 (P3-T89)

M12 벽체 요소(pier force)의 demand를 소비한다.

| 검토 | 내용 |
| --- | --- |
| 축+휨 | pier 단면 PM 상관 (기둥 모듈 재사용) |
| 전단 | 면내 전단 (Vc+Vs), 수직/수평 철근비 |
| 경계요소 | 압축 연단 응력 기준 경계요소 필요성 검토 v1 |
| 산출 | 벽체 일람표 |

### RC 슬래브 (P3-T90)

| 검토 | 내용 |
| --- | --- |
| 1방향 | 계수 모멘트법 or 해석 모멘트, 휨/전단/처짐(두께 규정) |
| 2방향 | 직접설계법 v1 (제약조건 검사 포함), 뚫림전단(플랫) |
| 산출 | 슬래브 배근 schedule |

슬래브 demand는 v1에서 지판/보 경계 조건 기반 계수법 — 쉘 해석 연동(M12 T74)은 가능 시 연결.

## P3-M18 Steel / Foundation / Connection

### 철골 부재 (P3-T91)

| 검토 | 내용 |
| --- | --- |
| 단면 분류 | 조밀/비조밀/세장 판폭두께비 (KDS 14 31 표) |
| 압축 | 휨좌굴/비틀림좌굴, 유효좌굴길이 K (입력 + 정렬도표 옵션) |
| 휨 | 소성/LTB — Lb, Cb 반영 구간별 공칭강도 |
| 전단 | 웨브 전단 |
| 조합력 | P-M 상관식 (H1) 1축/2축 |
| 사용성 | 처짐 한계 (L/기준) |
| 산출 | 철골 일람표 + 지배 limit state 표시 |

### 철골 가새/접합 (P3-T92)

| 검토 | 내용 |
| --- | --- |
| 가새 | 인장(총단면/유효순단면/블록전단), 압축좌굴, 세장비 제한 |
| 볼트 접합 | 전단/지압/인장, 표준 볼트군 (단순 접합 v1) |
| 용접 | 필릿 목두께 검토 v1 |
| base plate | 지압 + 판 두께 + 앵커 인발 v1 |
| 산출 | 접합부 demand/검토 표 (P2 connection 예비 대체) |

### 기초 (P3-T93)

| 검토 | 내용 |
| --- | --- |
| 독립 확대기초 | 지지력(허용 입력), 편심 반영 접지압, 1방향/뚫림 전단, 휨 배근 |
| 복합 기초 | 2주 복합 v1 |
| 매트 v1 | 스프링 지지(M11 T68) 반력 → 대상 스트립 검토 |
| 말뚝 v1 | 말뚝 반력 분배(강체 캡), 허용지지력 비교, 캡 검토 |
| 산출 | 기초 일람표. demand는 foundation reaction envelope(P2 M6-3) 소비 |

### 일람표/계산서 통합 (P3-T94)

- RC/철골/기초 일람표를 calculation package 장으로 편입, 각 행은 지배조합·지배식 formula ID 링크.
- NG 항목은 issue registry(P2 T43)로 자동 유입.
- `not checked` 표기는 유지하되, Phase 3 완료 시 기본 목차에서 미검토 장이 없어야 한다 (launch gate 항목).

### 사용성 통합 (P3-T95)

- 보/슬래브 처짐, 층간변위(기존), 간이 바닥진동 지표(고유진동수 기준 v1)를 사용성 장으로 통합.

## Module Layout

```text
src/design/
  rc/        beam.js, column.js (PM), wall.js, slab.js, rebar.js(정착/이음), pmCurve.js
  steel/     classify.js, compression.js, flexureLTB.js, interaction.js, brace.js
  connection/ bolt.js, weld.js, basePlate.js
  foundation/ footing.js, combined.js, mat.js, pile.js
  (기존 파일은 어댑터로 유지 후 단계 대체 — m5/m6/m39/m40/m41 테스트 green 유지)
src/standards/
  kds1420.js, kds1431.js   # 조항/formula registry (P2 STANDARD_ENGINE_PLAN 이행)
```

## Verification

| 모듈 | 방법 |
| --- | --- |
| RC 보/기둥/벽 | 교과서/예제집 수계산 10케이스 tolerance 비교 (`tests/p3-design-rc.mjs`) |
| PM 상관도 | 대표 단면 상관도 점 (P0, Pb, M0) 수계산 비교 |
| 철골 | KDS 예제/강구조편람 수계산 케이스 (`tests/p3-design-steel-foundation.mjs`) |
| 기초/접합 | 수계산 케이스 (`tests/p3-design-steel-foundation.mjs`) |
| 통합 | 대표건물 10종 일람표 생성 회귀 + NG→issue 유입 확인 |

수계산 근거는 `verification/specs/DESIGN_MODULE_VERIFICATION.md`에 케이스별로 기록한다.

## Out Of Scope (명시)

| 항목 | 대체 |
| --- | --- |
| 배근도/샵도면 생성 | 일람표(schedule)까지만 |
| 내진 성능설계 상세 (특수모멘트골조 상세 등) | 일반 상세 + 내진 옵션 v1, 한계 명시 |
| PC(프리캐스트) 설계 | 미지원 명시 |
| 목구조/조적 설계 | 미지원 명시 |
