# Phase 21 실제 진행 상태

```yaml
schema: p21-status-v1
updated: 2026-09-11
status: m0-m5-contract-complete-m6-verifying
planning_baseline_commit: d8ae7af7af3d20b9a5c0977f210e5d1b26991ace
pilot_runtime_commit: fefde822ae27a024ea8a834642b8aac10a24bd77
implementation_baseline_commit: d8ae7af7af3d20b9a5c0977f210e5d1b26991ace
candidate_commit: 78e8e5a
implemented_milestones: [M0, M1, M2, M3, M4, M5]
phase21_numeric_test_runs: 1
phase21_release_status: not-created
pages_status: unchanged-phase20-runtime
production_qualification: unchanged-not-qualified
independent_review_owner: user
```

| 단계 | 상태 | 증거/미충족 조건 |
|---|---|---|
| 계획 | DOCUMENTED | 코드 책임·기존 결함·메모리 관측을 검토하고 개발·검증 계획 작성 |
| M0 강체 다이어프램 Direct | COMPLETE-CPU-SCOPE | e15e8b4 고정 후보 117/117. 같은 runtime의 추가 임계하중·90도 회전·MPC·spring 시험 통과. 실제 GPU 미자격 차단 |
| M1 RC 수치 | COMPLETE-PRELIMINARY-SCOPE | a06fc55 고정 후보 집중 회귀 5/5. 실제 배근 상세 설계 자격 제외 |
| M2 입력·저장 | COMPLETE-CONTRACT-SCOPE | 64e5101 고정 후보 7/7. 조회 자동 저장 제거, draft 충돌, 환경 입력 보존, 실제 import 라우팅·alias 주입 방지 구현 |
| M3 실행·결과 선택 | COMPLETE-CONTRACT-SCOPE | c28624e 고정 후보 10/10. 실제 Worker 20조합→단일 요청 1solve, 공통 표시 선택, 실패 잔존 차단, Direct 평형 상태 보정 |
| M4 검토·보고서 | COMPLETE-CONTRACT-SCOPE | c3d66df 고정 후보10/10. canonical checks/messages, N_A, report source/summary, SHA-256 원본 조각 조회 구현 |
| M5 메모리·복구 | COMPLETE-CONTRACT-SCOPE | 37aced6 고정 후보 집중 검증 18/18. 공통 예산·취소·원본 체크포인트·재개. 실제 IndexedDB/M 규모는 M6 gate |
| M6 전체 업무 재시험 | VERIFYING | 78e8e5a 전체 회귀 124/124. 실제 IAB 22회 해석, RC 검토, 3포맷 다운로드 SHA, 52.5MB 저장/reload/복원·중단/변조 시험 통과. 일반 Chrome·M 규모 gate 진행 중 |
| M7 공개·배포 | PLANNED | CI·패키지 준비 중. M6 필수 gate 미충족으로 main 병합/Pages 배포 금지 |

`DOCUMENTED`는 계획 문서 상태이며 개발 마일스톤 완료가 아니다. 제안 시험·예산은 실행 전 확정하고 결과로만 상태를 변경한다. Phase20의 112/112와 RUN-001의 부분적인 정상 수치를 Phase21 PASS로 세지 않는다.

## 다음 작업

M6 실제 UI·native WebMCP·저장 복구와 전체 회귀를 수행한다. 실제 GPU의 강체 Direct는 자격 미검증으로 제품 경로에서 차단한다. 기존 상가주택은 복원 입력으로 X 방향 수렴을 확인했으며 원래 입력 hash의 재현 또는 최종 설계 검증이라고 하지 않는다.

M0 증거: [고정 후보 회귀](../../verification/evidence/phase21/m0/r1/validation.json), [전체 fixture suite 단일 프로세스 메모리 관측](../../verification/evidence/phase21/m0/r1/memory-observation.json). 최대 RSS 184,812KiB는 import·CPU·reference hybrid를 포함한 한 번의 관측이며 반복 leak 또는 M-tier 자격 검증이 아니다.

## 2026-09-11 추가 기록

M5 단일 작은 저장 시험 통과 뒤 M6 full pilot에서 저장 예산 초과를 실제 재현했다. 전체 복제 경로를 v2 원자적 분할 저장과 immutable 복원으로 수정했고, 전체 회귀 124/124 및 실제 IndexedDB 재검증으로 확인했다. 최초 실패와 이후 통과를 각각 m6-full-r1/r2, browser-r1/r2에 보존한다. [시험 보고서](PILOT_RETEST_REPORT.md)는 별도 검증 PDF이며 제품 자동 PDF는 BLOCKED다.

M7 CI는 Phase21 전체 목록을 Windows/Ubuntu에서 실행하도록 준비하고 Pages에 명시적 release gate를 추가한다. 필수 검증이 미충족인 상태에서 main을 병합해 배포하지 않는다.
