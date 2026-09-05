# Phase 15 — Solver Qualification Repair & Production Hardening

```yaml
version: p15-phase-charter-v1
phase: 15
title: 검증 결함 복구·해석엔진 프로덕션 하드닝
plan_status: executed-release-blocked
created_at: 2026-08-27
milestones: [P15-M0, P15-M1, P15-M2, P15-M3, P15-M4, P15-M5, P15-M6, P15-M7, P15-M8, P15-M9]
status_authority: docs/phase15/IMPLEMENTATION_STATUS.md
predecessor: docs/phase14/README.md
runtime_solver_owner: S-Structures in-house engine
external_solver_runtime_dependency: forbidden
final_design_transfer_allowed: false
```

## 1. Phase 결정

Phase 14에서 10개 부분지원 capability의 production 구현과 내부시험을 완료하고 STRIX 공개 검증군 12개를 1차 실행했다. 결과는 `PASS 6`, `CUSTOM_PASS 1`, `REVIEW 5`였지만, 후속 코드·수치 감사에서 REVIEW 원인이 서로 다르며 기존 PASS의 증거 강도도 동일하지 않음이 확인됐다.

Phase 15는 새 요소나 설계기능을 늘리는 단계가 아니다. **검증 하네스 오류와 실제 엔진 결함을 분리하고, 필요한 코드만 수정한 뒤 독립 reference·수렴·평형·변형시험·희소/밀집 동등성으로 qualification을 다시 세우는 교정 Phase**다.

핵심 판정은 다음과 같다.

- SB2·SB3: QM6-EAS 수식이 아니라 benchmark 전역조립 오류이며 SB2에는 정련 부족이 추가된다.
- SB5: MITC4 수식보다 과소 메시와 IC(0)-CG 실패가 지배적이다.
- SB6: `hard simply-supported` 기준을 `w-only soft` 경계로 실행했다.
- SB7: Winkler 강성 kernel이 아니라 station 복구의 foundation 단부력 누락이 원인이다.
- P3S2-SS: 실제 구조물 정적·모달 재해석이 아닌 합성 self-test다.
- 기존 PASS 6건은 수치가 유망하지만 독립 qualification과 release 근거는 아직 부족하다.

따라서 QM6-EAS 응축식, MITC4 bending/shear 정식화와 Winkler consistent Hermite stiffness를 benchmark 숫자에 맞춰 보정하지 않는다.

## 2. 목표

1. benchmark reference·tolerance·probe·축·부호·단위를 production 코드에서 분리해 사전 동결한다.
2. dense 중복 조립을 공통 희소 조립기로 교체하고 SPD 해법의 스케일링·fallback·잔차 계약을 닫는다.
3. SB2·SB3의 전역 membrane 조립과 고밀도 정련을 production 경로로 재실행한다.
4. 판의 hard/soft support를 별도 canonical 계약으로 만들고 SB5·SB6을 수렴 기반으로 재검증한다.
5. Winkler 결과에서 `structuralEnd`, `foundationEnd`, `equilibriumEnd`를 분리하고 station 양단 closure를 보장한다.
6. shell stabilization을 실제 정적·고유치 재해석, 질량가중 MAC와 에너지 기준으로 검증한다.
7. 기존 PASS 6건의 부호·성분·모드·수렴·독립성 약점을 보강한다.
8. 수치 owner·verification owner·report owner를 모듈 경계로 고정하고 코드리뷰 결과를 milestone별로 남긴다.
9. capability별로만 qualification·release를 승격하며 최종 설계전이는 별도 구조전문가 승인 전까지 차단한다.

## 3. 비목표

- benchmark 값을 맞추기 위한 요소 강성계수 조정
- MIDAS·STRIX·OpenSees를 runtime solver 또는 expected-value generator로 연결
- SB12 twoNodeLink, SH1 PMM hinge 같은 신규 요소 개발
- 비선형 지반, uplift/contact, 일반 fiber/P-M-M, nonlinear THA 추가
- 21개 전부를 한 번에 PASS로 표시하거나 `CUSTOM_PASS`를 독립자격으로 승격
- Phase 14의 과거 evidence를 덮어쓰기

## 4. 마일스톤

| ID | 이름 | 주 대상 | 완료 결과 |
| --- | --- | --- | --- |
| P15-M0 | Baseline & Discrepancy Freeze | 전체 | dirty baseline, discrepancy, reference/tolerance 계약 동결 |
| P15-M1 | Benchmark & Evidence Integrity | 전체 | 독립 manifest, deterministic artifact, signed metric, 실제 gate |
| P15-M2 | Shared Sparse Numeric Infrastructure | SB2·SB5·SB7 | 공통 triplet 조립, SPD solve policy, dense/sparse parity |
| P15-M3 | Membrane Assembly Repair | SB2·SB3 | 전역 QM6 membrane 조립, 고밀도 정련, 회전불변성 |
| P15-M4 | Plate Boundary & Workflow Repair | SB5·SB6 | hard/soft 경계, short-side 정규화, sparse plate 수렴 |
| P15-M5 | Winkler Recovery Repair | SB7 | foundation 단부력·station closure·P-Delta parity |
| P15-M6 | Real Stabilization Qualification | P3S2-SS 대응 | 실제 정적·모달 sweep과 custom R5 판정 |
| P15-M7 | Preliminary PASS Hardening | SB1·SB8·SB9·SB10·PD1·SM5 | 부호·성분·모드·수렴·독립성 보강 |
| P15-M8 | Module Extraction & Codebase Review | 전체 | 중복 제거, import 경계, 성능·회귀 리뷰, High 이상 0 |
| P15-M9 | Integrated Qualification & Release | 전체 | 재실행 evidence, capability manifest, 선택적 release 판정 |

마일스톤 상태는 이 문서에서 갱신하지 않고 [Implementation Status](IMPLEMENTATION_STATUS.md)만 따른다.

## 5. 실행 원칙

```text
Baseline·계약 동결
  → 실패를 재현하는 시험
  → behavior-preserving 모듈 추출
  → 최소 코드 수정
  → 내부 불변식·변형시험
  → R1~R3 독립자격
  → R4 교차비교
  → 코드리뷰·NFR
  → capability별 release
```

모든 work package는 두 lane을 따로 완료한다.

- Development lane: schema/API → numeric owner → assembly/recovery → result → CLI/Agent/UI/report
- Qualification lane: invariant → negative control → metamorphic → independent reference → cross-solver → release

`implementation-complete`는 benchmark PASS가 아니며, 외부 프로그램과 일치해도 독립 기준·수렴·평형·단위·회전시험이 없으면 `independently-qualified`로 승격하지 않는다.

## 6. 불변 원칙

1. 모든 production 해석은 S-Structures 자체 엔진이 수행한다.
2. expected/reference 값은 verification/test artifact에만 존재한다.
3. benchmark ID에 따른 production 분기와 보정계수를 금지한다.
4. tolerance는 계산 전에 fraction 단위로 동결하고 `%`는 표시값으로만 파생한다.
5. 부호를 무시하는 비교는 quantity가 명시적으로 magnitude일 때만 허용한다.
6. timestamp·hardware metadata는 deterministic calculation hash에서 제외한다.
7. 실패·timeout·fallback 실패·부분 결과·stale evidence는 PASS가 아니다.
8. 변경 영향 capability는 자동 `INVALIDATED` 처리한다.
9. 수치식 수정과 모듈 추출을 같은 PR에서 섞지 않는다.
10. unresolved Critical/High finding이 있으면 다음 release gate로 이동하지 않는다.

## 7. 문서 체계와 읽는 순서

1. [Current State Audit](CURRENT_STATE_AUDIT.md)
2. [Production Requirements](PRODUCTION_REQUIREMENTS.md)
3. [Discrepancy Register](DISCREPANCY_REGISTER.md)
4. [Module Architecture](MODULE_ARCHITECTURE.md)
5. [Modularization Plan](MODULARIZATION_PLAN.md)
6. [Milestone Execution Plan](MILESTONE_EXECUTION_PLAN.md)
7. [Qualification Policy](QUALIFICATION_POLICY.md)
8. [Verification Matrix](VERIFICATION_MATRIX.md)
9. [Requirements Traceability](REQUIREMENTS_TRACEABILITY.md)
10. [Risk Register](RISK_REGISTER.md)
11. [Codebase Review Plan](CODEBASE_REVIEW_PLAN.md)
12. [Implementation Status](IMPLEMENTATION_STATUS.md)
13. [Benchmark Execution Guide](BENCHMARK_EXECUTION_GUIDE.md)
14. [M9 Release Runbook](P15_M9_RELEASE_RUNBOOK.md)
15. [Handoff](HANDOFF.md)
16. [Work Packages](workpackages/README.md)
17. [Review Records](reviews/README.md)
18. [Architecture Decisions](adr/README.md)

## 8. 현재 판정

Phase 15 scoped 코드·schema·test·evidence와 M9 fail-closed gate는 구현됐다. 현재 first-batch는 12건 중 `PASS 9`, `CUSTOM_PASS 1`, `BLOCKED 2`이고 수치 metric은 `52/52 PASS`다. PD1 stage work balance와 SM5 independent reference mode vector가 없어 두 사례는 qualification BLOCKED다.

전체 `src` import cycle과 internal root barrel import는 0이고 sparse·plate boundary·foundation recovery·unsupported-rotation owner는 각각 하나다. 3회 결정론과 source-bound 전체 `npm.cmd test` planned 364건도 fail/skip/timeout/flake 없이 통과했다. 그러나 M0 독립 승인·성능 기준선, M8 High 52건, 독립 clean environment, mutation·product-surface parity, 동일 환경 10회 NFR, 독립 review, PD1·SM5 자격 증거와 MIDAS·STRIX R4 원본이 남아 모든 capability의 `releaseAllowed=false`, `finalDesignTransferAllowed=false`를 유지한다. live 판정은 [Implementation Status](IMPLEMENTATION_STATUS.md)를 따른다.
