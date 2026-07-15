# S-Structures Documentation Index

documentationVersion: 2026-07-15-phase9-m2

이 폴더는 Phase 2 개발부터 문서가 코드, 산출물, 임시 패키지와 섞이지 않도록 용도별로 나눈다. 새 문서를 추가할 때는 먼저 아래 분류 중 하나를 고른다.

## Folder Map

| 폴더 | 용도 | 작성 규칙 |
| --- | --- | --- |
| `user-manual/` | 사용자와 AI agent가 현재 프로그램을 사용하는 방법 | 현재 동작 기준만 작성. 오래된 마일스톤 설명은 넣지 않음 |
| `phase9/` | 현재 active 개발 계획 (CPU/WASM/WebGPU 계산 확장, 프로덕션 리팩토링·정리) | 계획과 구현 상태를 분리하고 요구사항-검증-evidence 추적성을 유지 |
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
| `verification/` | 수치 검증, solver 검증 근거 | 테스트와 수학적 검증 근거 중심. Phase 4 실증 증빙의 1차 저장소 |

## Do Not Mix

| 넣지 말 것 | 위치 |
| --- | --- |
| 실행 코드 | `src/` |
| 자동화/생성 스크립트 | `tools/` |
| 테스트 | `tests/` |
| 생성 보고서/HTML/JSON | `reports/` |
| 생성 PDF | `output/pdf/` |
| 압축 패키지, 임시 공유 파일 | git 추적 제외. 필요하면 외부 저장 또는 release artifact |

## Phase 9 Reading Order (current)

Phase 9 개발과 코드 정리를 시작할 때는 아래 순서로 읽는다. P9-M0 기준선은 구현됐으며 이후 마일스톤의 실제 구현·통합·검증 상태는 `IMPLEMENTATION_STATUS.md`에서 확인한다.

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

Direct Analysis addendum: when reviewing P2-M5 P-Delta work, read `docs/phase2/P2_M5_DIRECT_ANALYSIS_IMPLEMENTATION_PLAN.md` and `docs/verification/P2_M5_DIRECT_ANALYSIS_VERIFICATION.md` after the Phase 2 roadmap/backlog. These documents separate the planned geometric-stiffness direct mode from the existing equivalent-load iteration.

Phase 2(완료된 탄성 실무 검토 MVP) 근거를 볼 때는 아래 순서로 읽는다.

1. `docs/phase2/README.md`
2. `docs/phase2/ROADMAP.md`
3. `docs/phase2/IMPLEMENTATION_BACKLOG.md`
4. `docs/phase2/ELASTIC_PRACTICE_MVP.md`
5. `docs/phase2/STANDARD_ENGINE_PLAN.md`
6. `docs/phase2/P2_M5_DIRECT_ANALYSIS_IMPLEMENTATION_PLAN.md`
7. `docs/phase2/P2_M5_DIRECT_ANALYSIS_WORKPACKAGES.md`
8. `docs/verification/P2_M5_DIRECT_ANALYSIS_VERIFICATION.md`
9. `docs/phase2/DOCUMENTATION_GOVERNANCE.md`

## Maintenance Rule

코드가 바뀌면 관련 문서를 같이 갱신한다.

| 코드 변경 | 같이 확인할 문서 |
| --- | --- |
| public API/action 변경 | `user-manual/AI_AGENT_GUIDE.md`, `user-manual/agent-contract.json` |
| 화면 사용 흐름 변경 | `user-manual/01-getting-started.md`, `user-manual/02-modeling-and-elastic-analysis.md` |
| 하중/조합/보고서 변경 | `user-manual/03-loads-design-and-reports.md` |
| Phase 9 요구사항·백엔드·정밀도 변경 | `phase9/README.md`, `phase9/PRODUCTION_REQUIREMENTS.md`, `phase9/TARGET_ARCHITECTURE.md`, `phase9/COMPUTE_PRECISION_POLICY.md`, `phase9/VERIFICATION_MATRIX.md`, `phase9/REQUIREMENTS_TRACEABILITY.md` |
| Phase 9 리팩토링·레거시 제거 | `phase9/REFACTORING_AND_CODE_CLEANUP.md`, `phase9/MILESTONE_EXECUTION_PLAN.md`, `phase9/IMPLEMENTATION_STATUS.md` |
| Phase 7 요구사항·마일스톤 변경 | `phase7/README.md`, `phase7/PRODUCT_REQUIREMENTS.md`, `phase7/MILESTONE_EXECUTION_PLAN.md`, `phase7/VERIFICATION_MATRIX.md` |
| Phase 2 개발 범위 변경 | `phase2/README.md`, `phase2/DEVELOPMENT_FILE_MAP.md` |
| 새 검증 기준 추가 | `verification/` 또는 해당 milestone 문서 |
