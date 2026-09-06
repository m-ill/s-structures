# S-Structures Documentation Index

documentationVersion: 2026-08-28-phase17-strix21-case-qualification-v1

이 폴더는 Phase 2 개발부터 문서가 코드, 산출물, 임시 패키지와 섞이지 않도록 용도별로 나눈다. 새 문서를 추가할 때는 먼저 아래 분류 중 하나를 고른다.

## Folder Map

| 폴더 | 용도 | 작성 규칙 |
| --- | --- | --- |
| `user-manual/` | 사용자와 AI agent가 현재 프로그램을 사용하는 방법 | 현재 동작 기준만 작성. 오래된 마일스톤 설명은 넣지 않음 |
| `phase17/` | STRIX 공식 21개를 독립 사례 폴더에서 모델링부터 비교·캡처·보고서까지 재현하는 검증 계획 | 공식/custom 분모를 분리하고 한 사례씩 source·model·run·evidence·review gate로 닫음 |
| `phase16/` | 제품 실행영역과 검증 워크스페이스의 단계적 물리 분리 | 수치 변경 없이 freeze → 자산 → runner → 의존성 → source/test 순으로 이동 |
| `phase15/` | STRIX 1차 비교에서 확인된 검증결함·수치경로·증거강도를 교정하는 다음 production phase | 구현·모듈화·코드리뷰·독립자격·release를 분리하며 live 상태는 `IMPLEMENTATION_STATUS.md`만 관리 |
| `phase14/` | 자체 해석엔진의 10개 부분지원 capability 구현 기준선과 1차 benchmark 기록 | 구현·내부검증·1차 비교와 아직 미승인인 독립자격·릴리스를 분리해 추적 |
| `phase13/` | 탄성 실무 워크벤치 구현 기준선 | 구현 완료와 P13 qualification backlog를 Phase 14와 분리 |
| `phase11/` | 현재 active 계획 (한·영 시각 증거 구조해석 보고서 프로덕션화) | 공통 snapshot, 현지화, capture, PDF pair, 검증·evidence를 M0~M9로 추적 |
| `phase10/` | 탄성해석 실무 완성 구현 기준선 | 구현 완료와 외부 검증·release blocker를 분리해 참조 |
| `phase9/` | CPU/WASM/WebGPU 계산 확장과 프로덕션 리팩토링 기준선 | 계획과 구현 상태를 분리하고 요구사항-검증-evidence 추적성을 유지 |
| `phase8/` | 비선형해석 프로덕션 구현 기준선 | 구현 상태와 외부 검증 잔여 범위를 Phase 9에서 재사용하며 완료를 과장하지 않음 |
| `phase7/` | 실무형 모델링·하중 설정·탄성해석 완성 기준선 | 제품 사용성 및 탄성설계 기능의 이전 계획·검증 근거 |
| `phase6/` | 탄성해석 엔진 보강 계획과 구현 기준선 | Phase 7 해석 마감의 기술 참조. 실제 완료 여부는 코드와 검증 증빙으로 재판정 |
| `phase5/` | Phase 5 개발 계획 (전문 해석 UI 완성: 해석센터·하중·비선형·결과) | 이전 active planning. 참조용 유지 |
| `phase4/` | Phase 4(제품 완성: 실증·강화·출시) 계획 기록 | pre-beta 완료. 실증 WP 잔여, 참조용 유지 |
| `phase3/` | Phase 3(전 기능 구현, preliminary 수준 완료) 계획 기록 | 구현 완료. 참조용 유지 |
| `phase2/` | Phase 2(탄성 실무 검토 MVP, 완료) 계획 기록 | MVP 완료. 참조용 유지 |
| `product/` | PRD/TRD 같은 제품 요구사항과 기술 요구사항 | 큰 방향성이 바뀔 때만 수정 |
| `planning/` | UI 재구성, 리팩토링, 생성물 관리 같은 계획 문서 | 계획 단위 문서. 완료 후 archive 성격 유지 |
| `milestones/` | M3-M50 단계별 구현 기록 | append-only 기록. 새 기능 설명은 user manual 또는 phase2로 승격 |
| `../verification/specs/` | 수치 검증 schema·정책·solver 검증 근거 | 검증 정본은 저장소 최상위 `verification/` 워크스페이스에서 관리 |

## Do Not Mix

| 넣지 말 것 | 위치 |
| --- | --- |
| 실행 코드 | `src/` |
| 자동화/생성 스크립트 | `tools/` |
| 테스트 | `tests/` |
| 검증 evidence/benchmark 실행물 | `verification/evidence/`, `verification/benchmarks/` |
| 제품 생성 보고서/HTML/JSON | `reports/` |
| 검증 최종 PDF | `output/verification/` |
| 압축 패키지, 임시 공유 파일 | git 추적 제외. 필요하면 외부 저장 또는 release artifact |

## Phase 17 Reading Order (active STRIX21 case qualification plan)

Phase 17은 STRIX 공식 21개를 한 번에 숫자로 집계하지 않고, `SB1`부터 독립 사례 폴더에서 원자료·모델링·제품 실행·물리 자격·비교·화면·보고서를 한 개씩 재현한다.

`P17-M0`는 R2 source lock 21개와 checksum 51/51을 동결해 `COMPLETE_WITH_SOURCE_BLOCKERS`로 닫혔다. P17-M1 진입은 허용하지만 actual STRIX/MIDAS와 release는 계속 차단한다.

1. `docs/phase17/README.md`
2. `docs/phase17/CURRENT_STATE_AUDIT.md`
3. `docs/phase17/PRODUCTION_REQUIREMENTS.md`
4. `docs/phase17/CASE_FOLDER_CONTRACT.md`
5. `docs/phase17/MODEL_EQUIVALENCE_AND_REFERENCE_POLICY.md`
6. `docs/phase17/MILESTONE_EXECUTION_PLAN.md`
7. `docs/phase17/VERIFICATION_MATRIX.md`
8. `docs/phase17/RISK_REGISTER.md`
9. `docs/phase17/CODEBASE_REVIEW_PLAN.md`
10. `docs/phase17/IMPLEMENTATION_STATUS.md`
11. `docs/phase17/workpackages/README.md`
12. `docs/phase17/DISCREPANCY_REGISTER.md`
13. `docs/phase17/reviews/P17-M0-BASELINE-SOURCE-LOCK-REVIEW.md`
14. `docs/phase17/reviews/P17-M0-CODE-AND-ARTIFACT-REVIEW-ADDENDUM-R3.md`

## Phase 16 Reading Order (active repository separation)

Phase 16은 해석 수치식을 바꾸지 않고 프로그램 실행영역과 검증 자산·runner·source·test의 경계를 순서대로 분리한다.

1. `docs/phase16/README.md`
2. `docs/phase16/TARGET_FOLDER_ARCHITECTURE.md`
3. `docs/phase16/IMPLEMENTATION_STATUS.md`
4. `verification/README.md`
5. `verification/archive/legacy-layout-map.json`

## Phase 15 Reading Order (implemented, release blocked)

Phase 15는 1차 비교의 REVIEW와 false-PASS 위험을 교정한 구현 기준선이다. scoped 구현과 내부 회귀는 수행됐지만 독립 검토·외부 교차검증·release gate가 남아 있다.

1. `docs/phase15/README.md`
2. `docs/phase15/CURRENT_STATE_AUDIT.md`
3. `docs/phase15/PRODUCTION_REQUIREMENTS.md`
4. `docs/phase15/DISCREPANCY_REGISTER.md`
5. `docs/phase15/MODULE_ARCHITECTURE.md`
6. `docs/phase15/MODULARIZATION_PLAN.md`
7. `docs/phase15/MILESTONE_EXECUTION_PLAN.md`
8. `docs/phase15/QUALIFICATION_POLICY.md`
9. `docs/phase15/VERIFICATION_MATRIX.md`
10. `docs/phase15/REQUIREMENTS_TRACEABILITY.md`
11. `docs/phase15/RISK_REGISTER.md`
12. `docs/phase15/CODEBASE_REVIEW_PLAN.md`
13. `docs/phase15/IMPLEMENTATION_STATUS.md`
14. `docs/phase15/HANDOFF.md`
15. `docs/phase15/workpackages/WP-*.md`
16. 구현 후 `docs/phase15/reviews/P15-M*-CODE-REVIEW.md`

## Phase 14 Reading Order (implementation baseline)

Phase 14의 P14-M0~M11 production 구현과 내부검증 뒤 STRIX 공개값을 사용한 12개 1차 비교를 실행했다. 정식 independent qualification과 MIDAS/STRIX 동일 모델 재실행·release·설계전이는 아직 차단 상태이며, 후속 교정은 Phase 15가 소유한다.

1. `docs/phase14/README.md`
2. `docs/phase14/CURRENT_STATE_AUDIT.md`
3. `docs/phase14/PRODUCTION_REQUIREMENTS.md`
4. `docs/phase14/TARGET_ARCHITECTURE.md`
5. `docs/phase14/WINKLER_FOUNDATION_DESIGN.md`
6. `docs/phase14/QUALIFICATION_POLICY.md`
7. `docs/phase14/REFERENCE_BASIS.md`
8. `docs/phase14/MILESTONE_EXECUTION_PLAN.md`
9. `docs/phase14/VERIFICATION_MATRIX.md`
10. `docs/phase14/REQUIREMENTS_TRACEABILITY.md`
11. `docs/phase14/RISK_REGISTER.md`
12. `docs/phase14/IMPLEMENTATION_STATUS.md`
13. `docs/phase14/MODULE_ARCHITECTURE.md`
14. `docs/phase14/CODEBASE_REVIEW.md`
15. qualification에서 사용할 `docs/phase14/workpackages/WP-*.md`

## Phase 13 Reading Order (implementation baseline)

Phase 14가 재사용하는 Unified Run, ChangeSet, Model Check, result/report snapshot의 현재 기준선이다. 공식 source, full regression, office pilot과 설치·복구 qualification backlog는 Phase 13에서 별도 관리한다.

1. `docs/phase13/README.md`
2. `docs/phase13/CURRENT_STATE_AUDIT.md`
3. `docs/phase13/PRODUCTION_REQUIREMENTS.md`
4. `docs/phase13/TARGET_ARCHITECTURE.md`
5. `docs/phase13/MILESTONE_EXECUTION_PLAN.md`
6. `docs/phase13/VERIFICATION_MATRIX.md`
7. `docs/phase13/REQUIREMENTS_TRACEABILITY.md`
8. `docs/phase13/RISK_REGISTER.md`
9. `docs/phase13/IMPLEMENTATION_STATUS.md`

## Phase 11 Reading Order (current)

Phase 11은 하나의 해석 스냅샷에서 한국어·영어 PDF와 결정론적 화면 증거를 만드는 현재 계획이다.
authoritative 실행계획은 `MILESTONE_EXECUTION_PLAN.md`이며 실제 evidence가 생기기 전 상태는 모두 `planned`다.

1. `docs/phase11/README.md`
2. `docs/phase11/CURRENT_STATE_AUDIT.md`
3. `docs/phase11/PRODUCTION_REQUIREMENTS.md`
4. `docs/phase11/TARGET_ARCHITECTURE.md`
5. `docs/phase11/MILESTONE_EXECUTION_PLAN.md`
6. `docs/phase11/ROADMAP.md`
7. `docs/phase11/VERIFICATION_MATRIX.md`
8. `docs/phase11/REQUIREMENTS_TRACEABILITY.md`
9. `docs/phase11/RISK_REGISTER.md`
10. `docs/phase11/IMPLEMENTATION_STATUS.md`
11. 착수할 `docs/phase11/workpackages/WP-*.md`
12. 결정 gate의 `docs/phase11/adr/ADR-*.md`

## Phase 10 Reading Order (implementation baseline)

Phase 11 보고서가 표시해야 할 탄성해석 기능·제한·release eligibility의 기준선이다.

1. `docs/phase10/README.md`
2. `docs/phase10/CURRENT_STATE_AUDIT.md`
3. `docs/phase10/FORMULAS_AND_CRITERIA.md`
4. `docs/phase10/ROADMAP.md`
5. `docs/phase10/VERIFICATION_MATRIX.md`
6. `docs/phase10/IMPLEMENTATION_STATUS.md`

## Phase 9 Reading Order (compute baseline)

Phase 9 개발과 코드 정리를 검토할 때는 아래 순서로 읽는다. P9-M0~M10 구현은 완료됐으며 외부 장치·브라우저 검증 전까지 릴리스는 차단된다. 상세 상태는 `IMPLEMENTATION_STATUS.md`에서 확인한다.

1. `docs/phase9/README.md`
2. `docs/phase9/CURRENT_STATE_AUDIT.md`
3. `docs/phase9/PRODUCTION_REQUIREMENTS.md`
4. `docs/phase9/TARGET_ARCHITECTURE.md`
5. `docs/phase9/COMPUTE_PRECISION_POLICY.md`
6. `docs/phase9/ELASTIC_NONLINEAR_MIGRATION.md`
7. `docs/phase9/REFACTORING_AND_CODE_CLEANUP.md`
8. `docs/phase9/MILESTONE_EXECUTION_PLAN.md`
9. `docs/phase9/VERIFICATION_MATRIX.md`
10. `docs/phase9/REQUIREMENTS_TRACEABILITY.md`
11. `docs/phase9/PERFORMANCE_AND_QUALIFICATION.md`
12. `docs/phase9/RISK_REGISTER.md`
13. `docs/phase9/REFERENCE_BASIS.md`
14. `docs/phase9/IMPLEMENTATION_STATUS.md`
15. 착수할 결정의 `docs/phase9/adr/ADR-*.md`

## Phase 8 Reading Order (implementation baseline)

Phase 9가 확장하는 비선형해석 및 CPU/WASM 기준선을 확인할 때는 아래 순서로 읽는다. 외부 독립 검증은 사용자 결정에 따라 별도 수행하며 Phase 9 문서가 이를 자동으로 완료 처리하지 않는다.

1. `docs/phase8/README.md`
2. `docs/phase8/CURRENT_STATE_AUDIT.md`
3. `docs/phase8/PRODUCTION_REQUIREMENTS.md`
4. `docs/phase8/TARGET_ARCHITECTURE.md`
5. `docs/phase8/MODELING_ELASTIC_INTEGRATION.md`
6. `docs/phase8/MILESTONE_EXECUTION_PLAN.md`
7. `docs/phase8/VERIFICATION_MATRIX.md`
8. `docs/phase8/REQUIREMENTS_TRACEABILITY.md`
9. `docs/phase8/IMPLEMENTATION_STATUS.md`

## Phase 7 Reading Order (prior product baseline)

Phase 7 개발을 시작할 때는 아래 순서로 읽는다.

1. `docs/phase7/README.md`
2. `docs/phase7/CURRENT_STATE_AND_PRACTICE_GAPS.md`
3. `docs/phase7/PRODUCT_REQUIREMENTS.md`
4. `docs/phase7/MILESTONE_EXECUTION_PLAN.md`
5. `docs/phase7/VERIFICATION_MATRIX.md`
6. 착수할 마일스톤의 작업 패키지와 검증 증빙

## Phase 6 Reading Order (technical baseline)

Phase 6의 탄성해석 계획과 기존 구현 의도를 확인할 때는 아래 순서로 읽는다. 문서의 완료 주장은 Phase 7 현황 진단과 실제 코드·검증 결과를 우선한다.

1. `docs/phase6/README.md`
2. `docs/phase6/ENGINE_ASSESSMENT.md`
3. `docs/phase6/FORMULAS_AND_CRITERIA.md`
4. `docs/phase6/ROADMAP.md`
5. `docs/phase6/MILESTONE_EXECUTION_PLAN.md`
6. `docs/phase6/VERIFICATION_MATRIX.md`
7. 착수할 작업 패키지 (`docs/phase6/workpackages/WP-##.md`)

## Phase 5 Reading Order (archive)

Phase 5 개발을 시작할 때는 아래 순서로 읽는다.

1. `docs/phase5/README.md`
2. `docs/phase5/MILESTONE_STATUS.md`
2. `docs/phase5/CURRENT_UI_GAP_ASSESSMENT.md`
3. `docs/phase5/PRODUCT_REQUIREMENTS.md`
4. `docs/phase5/ARCHITECTURE.md`
5. 착수 트랙의 `docs/phase5/specs/SPEC-*.md`
6. `docs/phase5/ROADMAP.md`
7. `docs/phase5/IMPLEMENTATION_BACKLOG.md`
8. 착수할 작업 패키지 (`docs/phase5/workpackages/WP-##.md`)

## Phase 4 Reading Order (archive)

Phase 4 개발을 시작할 때는 아래 순서로 읽는다.

1. `docs/phase4/README.md`
2. `docs/phase4/CURRENT_STATE_ASSESSMENT.md`
3. `docs/phase4/ROADMAP.md`
4. `docs/phase4/TECH_DEBT_REGISTER.md`
5. 착수할 작업 패키지 (`docs/phase4/workpackages/WP-##.md`)
6. `docs/phase4/IMPLEMENTATION_BACKLOG.md`
7. 영역별 계획서 (`VALIDATION_PLAN.md`, `SECURITY_HARDENING_PLAN.md`, `RELEASE_PLAN.md` 등)

## Phase 3 Reading Order (archive)

Phase 3(전 기능 구현 완료) 근거를 볼 때는 아래 순서로 읽는다.

1. `docs/phase3/README.md`
2. `docs/phase3/PRODUCT_REQUIREMENTS.md`
3. `docs/phase3/ROADMAP.md`
4. `docs/phase3/ARCHITECTURE.md`
5. `docs/phase3/IMPLEMENTATION_BACKLOG.md`

## Phase 2 Reading Order (archive)

Direct Analysis addendum: when reviewing P2-M5 P-Delta work, read `docs/phase2/P2_M5_DIRECT_ANALYSIS_IMPLEMENTATION_PLAN.md` and `verification/specs/P2_M5_DIRECT_ANALYSIS_VERIFICATION.md` after the Phase 2 roadmap/backlog. These documents separate the planned geometric-stiffness direct mode from the existing equivalent-load iteration.

Phase 2(완료된 탄성 실무 검토 MVP) 근거를 볼 때는 아래 순서로 읽는다.

1. `docs/phase2/README.md`
2. `docs/phase2/ROADMAP.md`
3. `docs/phase2/IMPLEMENTATION_BACKLOG.md`
4. `docs/phase2/ELASTIC_PRACTICE_MVP.md`
5. `docs/phase2/STANDARD_ENGINE_PLAN.md`
6. `docs/phase2/P2_M5_DIRECT_ANALYSIS_IMPLEMENTATION_PLAN.md`
7. `docs/phase2/P2_M5_DIRECT_ANALYSIS_WORKPACKAGES.md`
8. `verification/specs/P2_M5_DIRECT_ANALYSIS_VERIFICATION.md`
9. `docs/phase2/DOCUMENTATION_GOVERNANCE.md`

## Maintenance Rule

코드가 바뀌면 관련 문서를 같이 갱신한다.

| 코드 변경 | 같이 확인할 문서 |
| --- | --- |
| Phase 17 case/source/reference/tolerance/probe/status 변경 | `phase17/README.md`, `CASE_FOLDER_CONTRACT.md`, `MODEL_EQUIVALENCE_AND_REFERENCE_POLICY.md`, `VERIFICATION_MATRIX.md`, `IMPLEMENTATION_STATUS.md`, 대응 case WP·report |
| Phase 17 product API·solver·evidence·report 경계 변경 | `phase17/PRODUCTION_REQUIREMENTS.md`, `MILESTONE_EXECUTION_PLAN.md`, `CODEBASE_REVIEW_PLAN.md`, `RISK_REGISTER.md` |
| Phase 15 discrepancy·numeric owner·reference·tolerance·release 변경 | `phase15/README.md`, `CURRENT_STATE_AUDIT.md`, `DISCREPANCY_REGISTER.md`, `PRODUCTION_REQUIREMENTS.md`, `VERIFICATION_MATRIX.md`, `IMPLEMENTATION_STATUS.md`, 대응 WP·review |
| Phase 15 공통 sparse·shell boundary·foundation recovery·stabilization module 변경 | `phase15/MODULE_ARCHITECTURE.md`, `MODULARIZATION_PLAN.md`, `CODEBASE_REVIEW_PLAN.md`, 대응 ADR·WP |
| Phase 14 capability·reference·tolerance·release 변경 | `phase14/README.md`, `PRODUCTION_REQUIREMENTS.md`, `QUALIFICATION_POLICY.md`, `VERIFICATION_MATRIX.md`, `IMPLEMENTATION_STATUS.md`, 대응 WP |
| Winkler foundation schema·정식화·결과 변경 | `phase14/WINKLER_FOUNDATION_DESIGN.md`, `workpackages/WP-01-winkler-foundation.md` |
| public API/action 변경 | `user-manual/AI_AGENT_GUIDE.md`, `user-manual/agent-contract.json` |
| 화면 사용 흐름 변경 | `user-manual/01-getting-started.md`, `user-manual/02-modeling-and-elastic-analysis.md` |
| 하중/조합/보고서 변경 | `user-manual/03-loads-design-and-reports.md` |
| Phase 11 보고서 snapshot·현지화·capture·PDF 변경 | `phase11/README.md`, `phase11/PRODUCTION_REQUIREMENTS.md`, `phase11/TARGET_ARCHITECTURE.md`, `phase11/MILESTONE_EXECUTION_PLAN.md`, `phase11/VERIFICATION_MATRIX.md`, `phase11/REQUIREMENTS_TRACEABILITY.md` |
| Phase 11 상태·위험·release gate 변경 | `phase11/IMPLEMENTATION_STATUS.md`, `phase11/RISK_REGISTER.md`, 대응 `phase11/workpackages/WP-*.md` |
| Phase 10 해석·eligibility 상태 변경 | `phase10/README.md`, `phase10/ROADMAP.md`, `phase10/VERIFICATION_MATRIX.md`, `phase10/IMPLEMENTATION_STATUS.md` |
| Phase 9 요구사항·백엔드·정밀도 변경 | `phase9/README.md`, `phase9/PRODUCTION_REQUIREMENTS.md`, `phase9/TARGET_ARCHITECTURE.md`, `phase9/COMPUTE_PRECISION_POLICY.md`, `phase9/VERIFICATION_MATRIX.md`, `phase9/REQUIREMENTS_TRACEABILITY.md` |
| Phase 9 리팩토링·레거시 제거 | `phase9/REFACTORING_AND_CODE_CLEANUP.md`, `phase9/MILESTONE_EXECUTION_PLAN.md`, `phase9/IMPLEMENTATION_STATUS.md` |
| Phase 7 요구사항·마일스톤 변경 | `phase7/README.md`, `phase7/PRODUCT_REQUIREMENTS.md`, `phase7/MILESTONE_EXECUTION_PLAN.md`, `phase7/VERIFICATION_MATRIX.md` |
| Phase 2 개발 범위 변경 | `phase2/README.md`, `phase2/DEVELOPMENT_FILE_MAP.md` |
| 새 검증 기준 추가 | `verification/` 또는 해당 milestone 문서 |
