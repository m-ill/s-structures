# Phase 17 - STRIX21 Case-Isolated Reproducible Qualification

```yaml
version: p17-strix21-case-isolated-qualification-charter-v1
phase: 17
title: STRIX 21개 독립 사례 재현·교차검증
created_at: 2026-08-28
status: p17-m1-contract-ready-no-benchmark-runs
status_authority: docs/phase17/IMPLEMENTATION_STATUS.md
predecessor: docs/phase16/README.md
official_case_count: 21
custom_case_count: 1
official_case_folders_created: 21
custom_case_folders_created: 1
benchmark_execution_count: 0
solver_execution_count: 0
official_pass_count: 0
terminal_authorization_enabled: false
release_allowed: false
final_design_transfer_allowed: false
```

## 1. 목적

Phase 17은 STRIX 공개 검증군 21개를 한 번에 숫자만 대조하는 단계가 아니다. 각 사례를 독립 폴더로 만들고 다음 과정을 처음부터 재현한다.

1. 원문·출전·판본과 기준값을 동결한다.
2. 형상, 요소, 재료, 단면, 축, 지점, 하중, 질량, 감쇠, 메시와 해석 옵션을 모델링한다.
3. 모델링 선택과 STRIX 모델과의 차이를 명시한다.
4. S-Structures 제품 공개 해석 경로로 실행한다.
5. 독립 기준해와 STRIX 공개 결과를 서로 다른 비교열로 평가한다.
6. 평형·수렴·에너지·모드 직교성 등 사례별 물리 gate를 확인한다.
7. Chrome 제품 화면에서 모델, 지점·하중, 결과 화면을 캡처한다.
8. 원시 결과, 비교값, 오차, 실패 원인과 코드 영향 범위를 사례별 보고서로 남긴다.

목표는 21개를 억지로 `PASS`시키는 것이 아니다. `21/21` 폴더에 재현 가능한 모델·실행·증거·판정 또는 명시적 blocker가 존재하도록 만드는 것이 목표다.

## 2. 현재 구현 상태

`P17-M1`은 `CONTRACT_READY_NO_BENCHMARK_RUNS`로 닫혔다. 공식 21개와 별도 custom 1개 사례 폴더, 사례별 19개 필수 파일, 419개 결정론적 scaffold, 16개 runtime schema, 공개 제품 adapter, data-only result extractor, process-isolated runner, external-custody-aware append-only evidence store와 evidence-only report 계약이 준비됐다.

공식+custom canonical wrapper의 contract smoke는 `22/22`지만 실제 모델·solver·benchmark 실행은 0건이다. 일반 child exit code 0은 `CHILD_SUCCEEDED_UNQUALIFIED`이고 `CONTRACT_VALIDATED`도 benchmark PASS가 아니다. 구조 모델, engineering result, Chrome capture, 사례 보고서와 공식 PASS도 0이다. M1 terminal authorization은 강제로 `false`이며 `QUALIFICATION_CANDIDATE`를 terminal PASS로 승격할 수 없다.

P17 active runtime은 product→verification import 0, product deep import 0, public root import 1, P17-specific reference leakage 0, report→solver 0, cycle 0을 만족한다. repository 전역에는 legacy deep import 133건/54개 파일과 generic production expected-value 2개 finding이 release debt로 남는다.

P17-M2는 official orchestrator/receipt, pinned external custodian trust registry, reference byte audit, extraction/comparison replay, physics/mutation replay, 서로 다른 외부 custody 3회 run, deterministic PDF·화면 parity, scoped reviewer attestation의 8개 terminal gate를 먼저 구현한다. 이 gate를 우회해 M1의 terminal 차단만 해제해서는 안 된다.

## 3. 현재 기준선과 승계 금지

Phase 15 aggregate runner는 공식 사례 11개와 S-Structures 자체 사례 `P3S2-SS` 1개를 실행했다. 공식 사례 결과는 수치 `PASS 9`, 자격 `BLOCKED 2(PD1, SM5)`이고, 52개 수치 metric 자체는 모두 허용오차 안에 있다.

이 결과는 Phase 17의 역사 기준선일 뿐 다음 항목을 자동으로 증명하지 않는다.

- 공식 STRIX 21개 독립 검증 완료
- STRIX 프로그램의 실제 동일 모델 재실행
- MIDAS와의 실제 동일 모델 비교
- 제품 release 또는 최종 구조설계 전이 승인

모든 Phase 17 사례 상태는 `NOT_STARTED`에서 다시 시작한다. 기존 PASS 숫자와 모델 코드는 참고할 수 있지만 새 source·model·run·evidence hash 없이 승계하지 않는다.

## 4. 공식 검증군과 custom 분리

공식 분모는 다음 21개뿐이다.

`SB1, SB2, SB3, SB5, SB6, SB7, SB8, SB9, SB10, SB12, PD1, SM5, SM5b, SM6, SR1, SR2, SR2b, P3S2, SP1, SH1, TH1`

`P3S2-SS`는 S-Structures 자체 안정화 qualification이다. 공식 `P3S2`를 대체하지 않으며 `verification/benchmarks/strix21/custom/`에서 별도 집계한다.

## 5. 검증 주장 계층

각 사례는 하나의 PASS 문자열 대신 다음 상태를 독립 관리한다.

| 상태 | 의미 |
| --- | --- |
| `sourceStatus` | 원문·출전·판본·페이지·checksum이 충분한가 |
| `modelStatus` | 동등 모델 mapping과 모델 hash가 승인됐는가 |
| `sstructuresRunStatus` | 자체 엔진 제품 경로로 실행됐는가 |
| `independentQualificationStatus` | 이론해·NAFEMS·CSI·ASME 등 독립 기준을 통과했는가 |
| `strixComparisonStatus` | STRIX 공개값 또는 실제 export와 비교됐는가 |
| `midasComparisonStatus` | MIDAS 실제 동일 모델 export와 비교됐는가 |
| `performanceComparisonStatus` | 동일 조건 성능 측정이 완료됐는가 |
| `reportStatus` | 증거 기반 사례 보고서가 검토됐는가 |
| `releaseStatus` | 해당 capability의 release 조건이 충족됐는가 |

`S-Structures 실행 성공`, `독립 수치 자격`, `상용 프로그램 교차비교`, `속도 비교`, `제품 release`를 서로 대신 사용하지 않는다.

## 6. 단일 사례 작업 원칙

- WIP limit은 1이다. 한 시점에 공식 사례 하나만 활성화한다.
- 다음 사례는 현재 사례가 `PASS`, `FAIL`, `BLOCKED_*` 또는 `CROSS_CHECK_ONLY` 중 하나로 증거와 함께 닫힌 뒤 시작한다.
- 기준값·probe·tolerance·모델 mapping은 S-Structures 결과 실행 전에 hash로 동결한다.
- 계산 실패가 제품 결함이면 사례 폴더에 discrepancy를 만들고 production owner에서 수정한 뒤 전체 영향 회귀와 사례 재실행을 수행한다.
- 입력이 부족하면 추정값을 만들지 않고 `BLOCKED_SOURCE`로 닫는다.
- product source에는 benchmark expected 값, tolerance 또는 reference oracle을 넣지 않는다.
- 검증 runner는 승인된 product service만 호출한다. 내부 solver deep import를 새로 추가하지 않는다.
- 화면 캡처는 모델링과 결과 전달을 설명하는 시각 증거이며 수치 판정 정본은 immutable JSON evidence다.

## 7. 기준 자료

현재 로컬에는 통합 매뉴얼, 21개 개별 HTML·PDF, catalog와 checksum이 있다.

- `STRIX-verification-21/documents/StrixVerificationManual.pdf`
- `STRIX-verification-21/reports/<CASE_ID>.pdf`
- `STRIX-verification-21/html/<CASE_ID>.html`
- `STRIX-verification-21/benchmark-catalog.json`
- `STRIX-verification-21/checksums.sha256`

통합 매뉴얼은 Engine v1.0.2, 2026-07-11 판본이고 현재 개별 HTML catalog는 Engine v1.0.4를 표시한다. M0에서 판본 우선순위와 수치 차이를 먼저 조정하지 않으면 어느 값을 기준으로 삼았는지 불명확해진다.

## 8. 완료 정의

Phase 17 완료는 다음을 모두 요구한다.

1. 공식 21개 case folder와 machine-readable manifest가 존재한다.
2. 각 folder에 원자료, 모델링 결정, 실행 기록, 비교 결과, 화면 증거와 판정 또는 원인코드가 있다.
3. 공식 21개와 custom 사례의 집계가 분리된다.
4. 기존 aggregate runner의 모델·reference·실행 결합이 사례별 책임으로 분해된다.
5. production→verification import와 verification→product deep import가 모두 0이다.
6. 보고서는 evidence만 읽으며 solver를 재실행하지 않는다.
7. source·reference·tolerance·probe·model·build·result·report의 hash chain이 완전하다.
8. 전체 회귀, 결정론, case isolation과 codebase/module review가 수행된다.
9. `BLOCKED`가 있으면 전체 검증 완료율과 release가 fail-closed로 표시된다.
10. 별도 구조 책임자 승인 전 `finalDesignTransferAllowed=false`를 유지한다.

## 9. 비목표

- 결과를 본 뒤 tolerance, probe, mesh 또는 reference를 조정해 PASS 만들기
- STRIX 반올림 표를 full-precision 실제 실행 결과로 표시하기
- 다른 요소 정식화·질량·감쇠·경계조건을 동일 모델이라고 주장하기
- 외부 solver를 S-Structures 자체 엔진 실행 경로에 몰래 사용하기
- 정확도 조건을 통과하기 전에 프로그램 속도 우열을 주장하기
- BLOCKED, CUSTOM 또는 self-test를 공식 21 PASS에 포함하기

## 10. 문서 읽기 순서

1. [Current State Audit](CURRENT_STATE_AUDIT.md)
2. [Production Requirements](PRODUCTION_REQUIREMENTS.md)
3. [Case Folder Contract](CASE_FOLDER_CONTRACT.md)
4. [Model Equivalence and Reference Policy](MODEL_EQUIVALENCE_AND_REFERENCE_POLICY.md)
5. [Milestone Execution Plan](MILESTONE_EXECUTION_PLAN.md)
6. [Verification Matrix](VERIFICATION_MATRIX.md)
7. [Risk Register](RISK_REGISTER.md)
8. [Codebase Review Plan](CODEBASE_REVIEW_PLAN.md)
9. [Implementation Status](IMPLEMENTATION_STATUS.md)
10. [Workpackage Index](workpackages/README.md)
11. [Discrepancy Register](DISCREPANCY_REGISTER.md)
12. [P17-M0 Review](reviews/P17-M0-BASELINE-SOURCE-LOCK-REVIEW.md)
13. [P17-M0 Code & Artifact Review Addendum R3](reviews/P17-M0-CODE-AND-ARTIFACT-REVIEW-ADDENDUM-R3.md)
14. [P17-M0 Documentation Qualification Addendum R4](reviews/P17-M0-CODE-AND-ARTIFACT-REVIEW-ADDENDUM-R4.md)
15. [WP-01 Case Contract & Shared Harness](workpackages/WP-01-case-framework.md)
16. [P17-M1 Code & Artifact Review R1](reviews/P17-M1-CODE-AND-ARTIFACT-REVIEW-R1.md)
17. [WP-02 SB1](workpackages/WP-02-SB1.md)
18. [P17-M2 SB1 Readiness Review R1](reviews/P17-M2-SB1-READINESS-REVIEW-R1.md)
