# Phase 2 Implementation Backlog

source: user review package 2026-06-30
status: active backlog

이 백로그는 Phase 2 개발을 티켓 단위로 쪼갠 실행 목록이다. 우선순위는 다음 기준을 따른다.

| Priority | 의미 |
| --- | --- |
| P0 | 탄성해석 실무 검토 MVP에 필요. 바로 시작할 항목 |
| P1 | MVP 이후 실무성 강화 항목 |
| P2 | 플랫폼 확장 또는 정식 비선형/외부 연계 항목 |

## Phase 1. Practice Trust Foundation

| Ticket | Priority | 작업 | 파일/영역 | 완료 기준 |
| --- | --- | --- | --- | --- |
| T01 | P0 | 단위 시스템 고정 | `src/core/units.js`, schema, UI, report | 모든 입력/출력에 단위 표시 |
| T02 | P0 | 부호 convention 문서/그림 추가 | solver recovery, result UI, report | local axis와 member force sign 기준 표시 |
| T03 | P0 | schema version 강화 | `src/core/schema.js`, migration | 구버전 파일 자동 변환과 warning |
| T04 | P0 | validation engine 확장 | `src/core/validation.js` | error/warning 분리와 해석 전 차단 |
| T05 | P0 | solver benchmark 10개 우선 구축 | `src/examples/verification.js`, `tests/` | CI에서 자동 비교 |
| T06 | P0 | equilibrium audit 강화 | solver post/audit, report | 조합별 힘/모멘트 residual 표 출력 |

## Phase 2. Building Modeling Foundation

| Ticket | Priority | 작업 | 파일/영역 | 완료 기준 |
| --- | --- | --- | --- | --- |
| T07 | P0 | story 객체 추가 | `src/core/`, `src/design/serviceability.js`, UI | 층별 결과 생성 가능 |
| T08 | P1 | grid 객체 추가 | model schema, native modeler | grid frame 생성 가능 |
| T09 | P0 | member release 구현/검증 | `src/solver/`, model schema | release benchmark 통과 |
| T10 | P1 | rigid offset 구현 | solver element/recovery, design length | offset 적용 결과 비교 |
| T11 | P0 | rigid diaphragm 구현 | solver constraints, story model | diaphragm benchmark 통과 |
| T12 | P1 | semi-rigid/shell 준비 schema | schema, migration | future migration 가능 |

## Phase 3. Load Engine

| Ticket | Priority | 작업 | 파일/영역 | 완료 기준 |
| --- | --- | --- | --- | --- |
| T13 | P0 | load standard registry 골격 | `src/standards/` 예정, `src/design/` | 하중 trace가 기준 ID 참조 |
| T14 | P0 | gravity load module | `src/design/loadEstimation.js` | 층별 총하중 trace |
| T15 | P0 | tributary distribution | load distribution module | 분배 전후 총량 일치 |
| T16 | P0 | wind load v1 | load estimation, combinations | WX/WY 양방향 생성 |
| T17 | P1 | wind load v2 | standard registry, input UI | 상세 풍하중 산정 trace |
| T18 | P0 | seismic load v1 | load estimation, story mass | EX/EY 양방향 생성 |
| T19 | P1 | seismic load v2 | standard registry, modal/RSA link | 내진 입력 trace |
| T20 | P1 | snow/soil/water/uplift 하중 | load cases, foundation link | 기초/지하층 검토 연결 |

## Phase 4. Combination And Envelope

| Ticket | Priority | 작업 | 파일/영역 | 완료 기준 |
| --- | --- | --- | --- | --- |
| T21 | P0 | 조합군 분리 | `src/core/kdsLoadCombinations.js` | 조합별 group 저장 |
| T22 | P0 | rule-based 조합 생성 고도화 | combination engine | 방향/부호 조합 자동 생성 |
| T23 | P0 | combination coverage audit | audit/report | 누락 하중/조합 검출 |
| T24 | P0 | envelope engine 고도화 | solver post, result API | demand별 지배조합 출력 |

## Phase 5. Advanced Elastic Analysis

Direct Analysis addendum: add ticket `T26A` for geometric-stiffness P-Delta direct analysis (`Kt = Ke + Kg(N)`, tension-positive axial convention). Implementation details live in `P2_M5_DIRECT_ANALYSIS_IMPLEMENTATION_PLAN.md`; verification gate lives in `docs/verification/P2_M5_DIRECT_ANALYSIS_VERIFICATION.md`.

| Ticket | Priority | 작업 | 파일/영역 | 완료 기준 |
| --- | --- | --- | --- | --- |
| T25 | P0 | P-Delta method 명확화 | `src/solver/`, report | method와 limitation 표시 |
| T26 | P0 | P-Delta benchmark | verification/tests | 1차/2차 결과 비교 |
| T26A | P0 | Direct Analysis P-Delta mode | `src/solver/`, `src/results/`, UI, report | `Kt = Ke + Kg(N)` direct solve, convergence trace, design summary, verification gate |
| T27 | P1 | modal analysis 고도화 | `src/dynamics/` | mass participation 출력 |
| T28 | P1 | RSA v1 | `src/dynamics/` | RSA story response |
| T29 | P1 | RSA v2 | dynamics, seismic trace | base shear scaling과 우발편심 trace |

## Phase 6. Result Review

| Ticket | Priority | 작업 | 파일/영역 | 완료 기준 |
| --- | --- | --- | --- | --- |
| T30 | P0 | story result table | result post, report | 층중량/층전단/전도/drift 표 |
| T31 | P0 | member station force | solver recovery, design demand | 부재 중간 최대력 추출 |
| T32 | P0 | foundation reaction envelope | reaction post, foundation module | max/min/uplift 반력표 |
| T33 | P1 | result visual audit | result visuals, report export | 변위/부재력/하중분포 그림 export |

## Phase 7. Design Modules

| Ticket | Priority | 작업 | 파일/영역 | 완료 기준 |
| --- | --- | --- | --- | --- |
| T34 | P1 | RC beam v1 | `src/design/rc*` | beam schedule |
| T35 | P1 | RC column v1 | `src/design/rc*` | column schedule |
| T36 | P1 | RC wall v1 | wall result/design | wall schedule |
| T37 | P1 | steel member v1 | `src/design/steel*` | steel schedule |
| T38 | P1 | steel stability v2 | steel detailing/trace | 지배 limit state 표시 |
| T39 | P1 | foundation v1 | `src/design/connectionFoundation.js` 확장 | footing schedule |
| T40 | P2 | connection v1 | connection force/design | connection force table |

## Phase 8. Report And Review Workflow

| Ticket | Priority | 작업 | 파일/영역 | 완료 기준 |
| --- | --- | --- | --- | --- |
| T41 | P0 | calculation package 목차 재구성 | `src/report/calculationPackage.js` | 누락 장은 `not checked` 표시 |
| T42 | P0 | formula trace system | report/design trace modules | NG에 trace 연결 |
| T43 | P0 | issue list | report review model 예정 | open/resolved/accepted 상태 |
| T44 | P1 | revision history | model audit/report cover | 계산서 표지에 revision |
| T45 | P1 | reviewer approval | workflow state | 승인 후 수정 시 상태 해제 |

## Phase 9. Integration And Automation

| Ticket | Priority | 작업 | 파일/영역 | 완료 기준 |
| --- | --- | --- | --- | --- |
| T46 | P1 | spreadsheet export/import | tools/import/export 예정 | 사무소 검토용 표 |
| T47 | P2 | MGT import | `src/import/` 예정 | mapping audit |
| T48 | P2 | IFC import | BIM mapping 예정 | object mapping |
| T49 | P1 | AI QA reviewer | agent API, report review | QA summary 생성 |
| T50 | P0 | pilot project package | representative reports/harness | 대표 프로젝트 10종 비교보고서 |

## Dependency Notes

| 먼저 필요한 것 | 이후 가능한 것 |
| --- | --- |
| T01-T06 | 실무 검토 MVP의 신뢰성 기준 |
| T07, T11 | story result, drift, wind/seismic distribution |
| T13-T15 | 하중 trace와 기준식 registry |
| T21-T24 | 설계 demand와 지배조합 trace |
| T30-T32 | 설계 모듈과 계산서 결과표 |
| T41-T43 | reviewer workflow와 AI QA |
