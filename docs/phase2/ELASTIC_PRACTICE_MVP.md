# Elastic Practice Review MVP

status: next execution target

1차 목표는 "탄성해석 실무 검토 MVP"다. 최종 설계 자동화가 아니라, 구조설계사무소에서 해석 검토용 플랫폼으로 시험할 수 있는 수준을 목표로 한다.

## MVP Scope

MVP는 아래 조건을 만족해야 한다.

```text
해석 가능한 모델을 만들 수 있다.
하중 산정 trace가 있다.
조합 누락 여부를 확인할 수 있다.
해석 결과의 평형이 검증된다.
층별 결과와 부재별 지배조합을 볼 수 있다.
P-Delta 적용 범위를 명확히 알 수 있다.
보고서에 warning/NG가 숨겨지지 않는다.
대표 건물 10종이 자동 검증된다.
```

## Required Items

| Order | Ticket | 기능 | 이유 |
| ---: | --- | --- | --- |
| 1 | T01 | 단위 시스템 고정 | 모든 결과와 보고서의 신뢰 기준 |
| 2 | T02 | 부호 convention | 부재력/반력 해석 결과 해석 오류 방지 |
| 3 | T03 | schema version | 장기 개발과 import 대비 |
| 4 | T04 | validation 확장 | 잘못된 모델의 solver 진입 차단 |
| 5 | T05 | solver benchmark | 기능 완료 기준을 수치 검증으로 고정 |
| 6 | T06 | equilibrium audit | 해석 성공과 결과 신뢰성 분리 |
| 7 | T07 | story 객체 | 층전단, drift, 하중분배의 기준 |
| 8 | T09 | member release | 실무 골조 모델의 기본 조건 |
| 9 | T11 | rigid diaphragm | 건축물 횡하중/층변위 검토 기반 |
| 10 | T14-T18 | gravity/wind/seismic v1 | 자동 하중 산정 trace |
| 11 | T21-T23 | 조합군/coverage audit | 조합 누락 방지 |
| 12 | T24 | envelope engine | 지배조합과 설계 demand 연결 |
| 13 | T30 | story result table | 실무 결과 검토표 |
| 14 | T31 | member station force | 부재 설계용 최대력 |
| 15 | T25-T26 | P-Delta 명확화와 benchmark | 2차효과 적용 범위 투명화 |
| 16 | T41 | calculation package 재구성 | 실무 계산서 목차 |
| 17 | T43 | issue list | warning/NG 검토 흐름 |
| 18 | T50 | 대표 프로젝트 10종 검증 | 실제 유형별 검증 |

## First Execution Slice

가장 먼저 진행할 slice는 기반 신뢰성 6개 티켓이다.

| Slice | 포함 티켓 | 목표 |
| --- | --- | --- |
| MVP-S1 Baseline contracts | T01, T02, T03 | 단위/부호/schema를 문서와 코드 계약으로 고정 |
| MVP-S2 Validation and audit | T04, T06 | solver 진입 전 검증과 해석 후 audit 분리 |
| MVP-S3 Benchmark gate | T05 | 최소 10개 benchmark 자동화 |

## Suggested Milestone Names

현재 저장소의 기존 milestone 번호와 혼동하지 않기 위해 Phase 2 작업은 `P2-MVP-S#` 또는 `P2-T##` 형식으로 관리한다.

| New milestone | Scope | Exit |
| --- | --- | --- |
| P2-MVP-S1 | T01-T03 | 단위/부호/schema 계약 문서와 regression test |
| P2-MVP-S2 | T04, T06 | validation/audit 결과가 보고서와 agent API에 노출 |
| P2-MVP-S3 | T05 | benchmark 10개와 자동 비교 harness |
| P2-MVP-S4 | T07, T09, T11 | story/release/diaphragm 모델링 기반 |
| P2-MVP-S5 | T14-T18, T21-T24 | 하중 trace, 조합군, coverage, envelope |
| P2-MVP-S6 | T25-T26, T30-T31, T41-T43, T50 | 실무 검토 계산서와 대표 프로젝트 검증 |

## Acceptance Checklist

MVP 완료 판단은 feature count가 아니라 검토 가능성으로 한다.

| Check | Pass condition |
| --- | --- |
| Model health | validation error가 있으면 solver가 실행되지 않음 |
| Unit clarity | 모든 입력/결과/보고서 표에 단위 표시 |
| Sign clarity | 부재력/반력 부호 convention이 결과와 보고서에 연결 |
| Solver trust | benchmark tolerance 통과 |
| Analysis audit | 조합별 힘/모멘트 residual 표시 |
| Load trace | 하중 entity가 산정 trace row와 연결 |
| Combination audit | 누락 하중/조합 warning 생성 |
| Design demand | demand별 지배조합과 위치 확인 |
| Report review | warning/NG가 action item으로 남음 |
| Pilot | 대표 프로젝트 10종 자동 검증 산출물 생성 |

## Progress

| Milestone | Status | Note |
| --- | --- | --- |
| P2-MVP-S1 | implemented | See `P2_MVP_S1_BASELINE_CONTRACT.md` |
| P2-MVP-S2 | implemented | See `P2_MVP_S2_VALIDATION_AUDIT.md` |
| P2-MVP-S3 | implemented | See `P2_MVP_S3_BENCHMARK_GATE.md` |
| P2-MVP-S4 / T07 | implemented | See `P2_MVP_S4_STORY_MODEL.md`; T09/T11 remain |
| P2-MVP-S4 / T09 | implemented | See `P2_MVP_S4_MEMBER_RELEASE.md`; T11 remains |
| P2-MVP-S4 / T11 | implemented | See `P2_MVP_S4_RIGID_DIAPHRAGM.md`; S4 base is complete |
| P2-MVP-S5 / T18 | implemented | See `P2_MVP_S5_STORY_MASS_CENTER.md`; accidental eccentricity remains future work |
