# Phase 2 Roadmap

source: user review package 2026-06-30
status: active planning

Phase 2의 방향은 해석 기능을 무작정 늘리는 것이 아니라, 구조설계자가 결과를 믿고 검토할 수 있는 흐름을 만드는 것이다.

```text
model
-> load basis
-> load combinations
-> elastic analysis
-> result audit
-> design review
-> calculation package
-> issue / review / approval record
```

해석 엔진과 기준 엔진은 분리한다. 기준식, 기준 버전, 적용 조건, 입력값, 산정 trace는 versioned registry로 관리하고, solver는 검증 가능한 수치해석 엔진으로 유지한다.

## Roadmap Summary

| Milestone | 목표 | 핵심 결과물 |
| --- | --- | --- |
| P2-M0 | 제품 기준선 고정 | 단위, 부호, schema, migration, QA 원칙 |
| P2-M1 | 해석 신뢰성 확보 | solver benchmark, validation, analysis audit |
| P2-M2 | 실무 모델링 기반 | story, grid, release, offset, diaphragm, wall/shell 준비 |
| P2-M3 | 하중 산정 엔진 | load standard registry, gravity, wind, seismic, distribution |
| P2-M4 | 하중조합 엔진 | strength/service/seismic/foundation 조합군, coverage audit, envelope |
| P2-M5 | 탄성해석 고도화 | P-Delta method, modal, response spectrum |
| P2-M6 | 결과 후처리 | story result, member station force, foundation reaction envelope |
| P2-M7 | RC 설계 모듈 | material/detailing basis, beam, column, wall, slab |
| P2-M8 | 철골 설계 모듈 | section database, member design, brace design, stability |
| P2-M9 | 기초/접합 모듈 | footing, mat, pile, base plate, connection force |
| P2-M10 | 계산서/보고서 고도화 | 실무 목차, formula trace, warning/NG action list |
| P2-M11 | 구조사무소 workflow | project/revision, reviewer, approval state |
| P2-M12 | import/export | spreadsheet, MGT, IFC/BIM 연계 |
| P2-M13 | AI agent 실무 자동화 | QA checklist, report explanation, control contract |
| P2-M14 | 베타/파일럿 | 대표 프로젝트 10종, 비교검증, 검토 의견 반영 |

## P2-M0 Product Baseline

목적: 기능 추가 전 단위, 부호, schema, 기준 버전, 검토 흐름을 고정한다.

| Subtask | 구현 범위 | 완료 기준 |
| --- | --- | --- |
| M0-1 Unit system | 내부 단위, 표시 단위, 저장 단위, import 변환 audit | 저장/복원 후 물리량 동일, 보고서 모든 표에 단위 표시 |
| M0-2 Coordinate/sign convention | 전역/로컬축, 부재단력, 반력, 하중 부호, convention diagram | 부재 결과표와 보고서에 local axis와 부호 기준 표시 |
| M0-3 Schema versioning | model schema version, migration, deprecated field warning, API contract test | 구버전 모델 자동 변환, 필수 필드 누락은 해석 전 error |

## P2-M1 Solver Trust

목적: solver가 맞다는 근거를 기능보다 먼저 확보한다.

| Subtask | 구현 범위 | 완료 기준 |
| --- | --- | --- |
| M1-1 Benchmark suite | 단순보, 캔틸레버, portal, release, modal, P-Delta 등 20개 benchmark | 자동 실행, hand calculation 또는 기준 결과와 tolerance 비교 |
| M1-2 Validation expansion | 중복/분리/기구/강성비/축 모호성/하중참조/단위 의심 검출 | error면 solver 진입 금지, warning은 계산서에 표시 |
| M1-3 Analysis audit | 조합별 힘/모멘트 평형, 반력 합계, 최대 변위/부재력, matrix 정보 | `analysis.ok`와 별도 `analysis.audit.ok` 제공 |

## P2-M2 Practice Modeling Foundation

목적: 노드/부재 중심 모델을 건축물 모델로 확장한다.

| Subtask | 구현 범위 | 완료 기준 |
| --- | --- | --- |
| M2-1 Story object | story ID, elevation, height, diaphragm, mass/load/drift summary | z좌표 기반 자동 story detection, story table 보고서 출력 |
| M2-2 Grid system | X/Y grid, spacing, snap, label, member location | grid frame 생성, grid mismatch warning |
| M2-3 Member release | start/end release, partial fixity, truss/brace preset | release benchmark 통과, release 단부력 회복 검증 |
| M2-4 Rigid/end offset | member end offset, rigid zone factor, clear span | offset 적용/미적용 결과 비교, 설계용 clear length 제공 |
| M2-5 Diaphragm | rigid diaphragm, CM, master DOF, eccentricity, future semi-rigid | diaphragm benchmark 통과, 층간변위 story 기준 계산 |
| M2-6 Wall/shell preparation | wall panel, equivalent frame, future shell schema | wall pier force를 별도 결과로 추출 가능한 구조 |

## P2-M3 Load Estimation Engine

목적: 하중을 입력값, 기준식, 산정 trace, model load entity로 분리한다.

| Subtask | 구현 범위 | 완료 기준 |
| --- | --- | --- |
| M3-1 Load standard registry | standard ID, clause, formula ID, input/output schema, applicability | 기준 버전과 formula ID가 계산서에 출력 |
| M3-2 Gravity module | self weight, superimposed D, partition, live, roof, equipment, facade | 층별 총량 검산과 trace 출력 |
| M3-3 Distribution engine | area load to member/nodal load, tributary area, total reconciliation | 분배 전후 총량 일치 audit |
| M3-4 Wind module | v1 equivalent story wind, v2 exposure/importance/height pressure | WX/WY 양방향 생성과 산정 trace |
| M3-5 Seismic module | seismic weight, base shear, story distribution, v2 site/R/Cd/period | EX/EY 양방향 생성과 입력 trace |
| M3-6 Other loads | snow, soil, water, uplift, thermal, construction, crane | foundation/basement review와 연결 가능한 load cases |

## P2-M4 Combination And Envelope Engine

| Subtask | 구현 범위 | 완료 기준 |
| --- | --- | --- |
| M4-1 Combination groups | strength, service, seismic, foundation, construction | 조합마다 group/purpose 저장 |
| M4-2 Rule-based generation | available load cases 기반 부호/방향 조합 생성 | 누락 하중과 누락 조합 coverage audit |
| M4-3 Envelope engine | member/reaction/displacement/drift envelope | demand별 지배조합과 위치 출력 |

## P2-M5 Advanced Elastic Analysis

Direct Analysis addendum: P2-M5 now includes a separate geometric-stiffness P-Delta path. Implement it from `P2_M5_DIRECT_ANALYSIS_IMPLEMENTATION_PLAN.md` and verify it with `docs/verification/P2_M5_DIRECT_ANALYSIS_VERIFICATION.md`. This is not a replacement for the current equivalent-load P-Delta method.

| Subtask | 구현 범위 | 완료 기준 |
| --- | --- | --- |
| M5-1 P-Delta method clarity | P-Delta, small/large displacement, geometric stiffness 범위 명시 | 보고서에 method, limitation, convergence 표시 |
| M5-1A Direct Analysis mode | `Kt = Ke + Kg(N)` geometric-stiffness elastic second-order analysis | direct-analysis settings, convergence trace, story/member design summary, report/API method trace |
| M5-2 Modal analysis | eigen period, mode shape, participation mass | 참여질량과 모드별 결과표 출력 |
| M5-3 Response spectrum | spectrum table/function, SRSS/CQC, base shear scaling | RSA story response와 scaling trace |

## P2-M6 Result Postprocessing

| Subtask | 구현 범위 | 완료 기준 |
| --- | --- | --- |
| M6-1 Story result module | story weight, shear, overturning, drift, torsion | 층별 결과표 |
| M6-2 Member station force | station별 N/V/M, max at span, governing combo | 보 설계용 최대 모멘트와 전단력 추출 |
| M6-3 Foundation reaction processor | max/min/uplift, service/strength envelope | 기초 설계 모듈 입력으로 사용 가능 |

## P2-M7 To P2-M9 Design Modules

| Milestone | 범위 | 완료 기준 |
| --- | --- | --- |
| P2-M7 RC design | material/detailing basis, beam, column, wall, slab | RC schedule과 지배식 trace |
| P2-M8 Steel design | section database, compression/flexure/shear/interaction, brace | steel schedule과 limit state 표시 |
| P2-M9 Foundation/connection | footing, mat, pile, base plate, connection force | foundation/connection schedule과 demand trace |

## P2-M10 To P2-M14 Workflow And Platform

| Milestone | 범위 | 완료 기준 |
| --- | --- | --- |
| P2-M10 Calculation package | 실무 목차, formula trace, warning/NG action list | 누락 장은 `not checked`로 표시, NG는 trace와 연결 |
| P2-M11 Office workflow | project/revision, review state, approval lock | 승인 후 수정 시 approval state 해제 |
| P2-M12 Import/export | spreadsheet, MGT, IFC/BIM | mapping audit와 round-trip 검증 |
| P2-M13 AI automation | agent QA checklist, report explanation | AI가 모델/하중/조합/결과를 자동 점검하고 summary 생성 |
| P2-M14 Pilot | 대표 프로젝트 10종, 타 프로그램/수계산 비교 | 차이 큰 항목 원인 분석과 검토 의견 반영 |

## Development Principles

1. 기능보다 trace를 우선한다.
2. 해석 성공과 설계 적합을 분리한다.
3. preliminary 기능은 명확히 표시한다.
4. 모든 warning은 계산서에 남긴다.
5. 기준식은 versioned registry로 관리한다.
6. 대표 모델과 benchmark가 없으면 기능 완료로 보지 않는다.
