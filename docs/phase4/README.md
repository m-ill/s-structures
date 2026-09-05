# Phase 4 Development Hub — 제품 완성

phase: 4
status: active
start: 2026-07-03
mission: 기능 추가 없이, 구현된 전 기능을 "출시 가능한 제품"으로 끌어올린다.

## Why Phase 4

Phase 3는 목표했던 전 범위(P3-M0~M20)를 구현하고 테스트로 잠갔다. 그러나 코드에 내장된 완성도 감사(`getPhase3CompletionAuditReview`) 기준으로 21개 마일스톤 중 **proven 7 / preliminary 13 / manual 1**이다. preliminary는 "구현과 자동 테스트는 있으나, 실무 투입 근거(실측 데이터, 수계산 검증서, 외부 대조, 성능 실증)가 부족하다"는 뜻이다.

Phase 4는 이 간극을 닫는 단계다. **신규 해석/설계 기능은 Phase 4 범위가 아니다** — Phase 3 문서의 "Phase 4 없음" 선언은 "기능 범위를 늘리는 후속 단계는 없다"로 유지되며, Phase 4는 오직 실증(Validation), 강화(Hardening), 출시(Release)만 다룬다.

```text
Phase 3 결과물 (preliminary 구현)
  -> Stage V  실증: preliminary 13개 -> proven 승격
  -> Stage H  강화: 보안/성능/프론트 완성, 기술부채 상환
  -> Stage R  출시: 패키징, 문서, 베타, GA
```

## Success Definition

Phase 4의 완료(=출시)는 아래 4개 조건의 동시 만족이다.

1. 완성도 감사에서 **preliminary 0건** — 전 마일스톤 proven 또는 (M20 한정) 증빙 완료된 manual.
2. `TECH_DEBT_REGISTER.md`의 **P0/P1 부채 0건**.
3. `RELEASE_PLAN.md`의 출시 체크리스트 전 항목 통과 + 설치본으로 클린 머신 smoke 성공.
4. 베타 파일럿(실사용 시나리오)에서 **blocker 0건** 종료 리포트.

## Document Set

| 문서 | 역할 | 갱신 주기 |
| --- | --- | --- |
| `CURRENT_STATE_ASSESSMENT.md` | 2026-07-03 기준 자산/한계 분석 (Phase 4의 근거) | 고정 (스냅샷) |
| `ROADMAP.md` | P4-M0~M11 마일스톤과 exit criteria | 마일스톤 완료 시 |
| `IMPLEMENTATION_BACKLOG.md` | P4-T## 티켓 (수용 기준 포함) | 상시 |
| `TECH_DEBT_REGISTER.md` | 확인된 기술부채 TD-## 목록과 상환 계획 | 상시 |
| `VALIDATION_PLAN.md` | preliminary→proven 실증 방법론과 증빙 규격 | Stage V 중 |
| `SECURITY_HARDENING_PLAN.md` | 보안 강화 항목과 검증 | Stage H 중 |
| `RELEASE_PLAN.md` | 패키징, 버전, 배포, 라이선스, 출시 체크리스트 | Stage R 중 |
| `OPERATIONS_RUNBOOK.md` | 설치/백업/복구/업그레이드/장애 대응 절차 | 출시 전 확정 |
| `BETA_PROGRAM_PLAN.md` | 베타 파일럿 운영 계획 | Stage R 중 |
| `DOCUMENTATION_PLAN.md` | 사용자 매뉴얼/튜토리얼/온보딩 완성 계획 | Stage R 중 |
| `PRE_BETA_EXECUTION_AUDIT.md` | 현재 요청 범위의 WP-05~WP-09 완료 증거와 제외 게이트 정리 | pre-beta 범위 완료 시 |
| `RISK_REGISTER.md` | 리스크와 대응 | 상시 |
| `workpackages/WP-01..WP-10` | 실행 단위 작업 패키지 (세부 작업문서) | 착수 시 상세화, 완료 시 결과 기록 |

## Work Package Map

작업은 WP 단위로 착수한다. 각 WP 문서에 범위/단계/수용기준/검증이 정의되어 있다.

| WP | 이름 | Stage | 대상 마일스톤 |
| --- | --- | --- | --- |
| WP-01 | 탄성해석 실증 | V | P4-M1 (P3-M10~M13 승격) |
| WP-02 | 비선형해석 실증 | V | P4-M2 (P3-M14~M16 승격) |
| WP-03 | 설계모듈 실증 | V | P4-M3 (P3-M17~M18 승격) |
| WP-04 | 도면/점군 import 실증 | V | P4-M4 (P3-M7~M9 승격) |
| WP-05 | 플랫폼/보안 강화 | H | P4-M5 |
| WP-06 | 성능/규모 실증 | H | P4-M6 |
| WP-07 | 모델러 통합·프론트 완성 | H | P4-M7 |
| WP-08 | 패키징/배포 | R | P4-M8 |
| WP-09 | 사용자 문서/온보딩 | R | P4-M9 |
| WP-10 | 베타 파일럿·출시 운영 | R | P4-M10~M11 |

## Working Agreements (Phase 4 게이트)

Phase 2/3 게이트를 계승하고 다음을 추가한다.

1. **증빙 우선**: 실증 작업의 산출물은 코드가 아니라 증빙이다. 모든 실증은 `verification/specs/`(방법·근거) + `verification/evidence/validation/`(생성 결과)에 남기고, 해당 마일스톤 review 계약이 이를 읽어 상태를 판정한다.
2. **부채 즉시 등재**: 작업 중 발견한 결함/한계는 그 자리에서 `TECH_DEBT_REGISTER.md`에 TD 번호로 등재한다. "나중에"는 없다.
3. **회귀 불변**: 모든 커밋은 `npm test` full green. 실증으로 기준값이 바뀌면 기준 고정 커밋을 분리한다.
4. **기능 동결**: 신규 해석/설계 기능 요구는 backlog의 `out-of-scope` 섹션에 기록만 하고 구현하지 않는다. 해제는 사용자(제품 오너) 승인 필요.
5. **문서 동기**: 사용자 노출 동작 변경 시 같은 커밋에서 `user-manual/` 갱신.

## Reading Order

1. `CURRENT_STATE_ASSESSMENT.md` — 무엇이 있고 무엇이 부족한가
2. `ROADMAP.md` — 어떤 순서로 닫는가
3. `TECH_DEBT_REGISTER.md` — 알려진 결함
4. 착수 WP 문서 — 오늘 할 일
5. `IMPLEMENTATION_BACKLOG.md` — 티켓 상태
