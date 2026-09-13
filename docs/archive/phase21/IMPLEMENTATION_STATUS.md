# Phase 21 실제 진행 상태

```yaml
schema: p21-status-v1
updated: 2026-09-11
status: m0-m5-contract-complete-m6-verifying
planning_baseline_commit: d8ae7af7af3d20b9a5c0977f210e5d1b26991ace
pilot_runtime_commit: fefde822ae27a024ea8a834642b8aac10a24bd77
implementation_baseline_commit: d8ae7af7af3d20b9a5c0977f210e5d1b26991ace
candidate_commit: 931dce1
implemented_milestones: [M0, M1, M2, M3, M4, M5]
phase21_numeric_test_runs: 1
phase21_release_status: local-drafts-only
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
| M6 전체 업무 재시험 | PARTIAL | 931dce1 Windows 124/124. IAB pilot/원본 보고서/저장 복원 통과. 중간 규모 8회 해석·ledger 해제 통과. 후반 취소5.004초/다음 Worker 실행 통과. Chrome 동일 pilot·Ubuntu·전체 heap·고정환경 성능 미충족 |
| M7 공개·배포 | LOCAL-DRAFT / BLOCKED | 931dce1 소스·runtime·124건 evidence ZIP 및 Pages 정적 파일 생성. 해시 검증 통과. 필수 gate와 공개 승인 미충족으로 push/main/Pages 미수행 |

`DOCUMENTED`는 계획 문서 상태이며 개발 마일스톤 완료가 아니다. 제안 시험·예산은 실행 전 확정하고 결과로만 상태를 변경한다. Phase20의 112/112와 RUN-001의 부분적인 정상 수치를 Phase21 PASS로 세지 않는다.

## 다음 작업

M6 실제 UI·native WebMCP·저장 복구와 전체 회귀를 수행한다. 실제 GPU의 강체 Direct는 자격 미검증으로 제품 경로에서 차단한다. 기존 상가주택은 복원 입력으로 X 방향 수렴을 확인했으며 원래 입력 hash의 재현 또는 최종 설계 검증이라고 하지 않는다.

M0 증거: [고정 후보 회귀](../../../verification/evidence/phase21/m0/r1/validation.json), [전체 fixture suite 단일 프로세스 메모리 관측](../../../verification/evidence/phase21/m0/r1/memory-observation.json). 최대 RSS 184,812KiB는 import·CPU·reference hybrid를 포함한 한 번의 관측이며 반복 leak 또는 M-tier 자격 검증이 아니다.

## 2026-09-11 추가 기록

M5 단일 작은 저장 시험 통과 뒤 M6 full pilot에서 저장 예산 초과를 실제 재현했다. 전체 복제 경로를 v2 원자적 분할 저장과 immutable 복원으로 수정했고, 전체 회귀 124/124 및 실제 IndexedDB 재검증으로 확인했다. 최초 실패와 이후 통과를 각각 m6-full-r1/r2, browser-r1/r2에 보존한다. [시험 보고서](PILOT_RETEST_REPORT.md)는 별도 검증 PDF이며 제품 자동 PDF는 BLOCKED다.

M7 CI는 Phase21 전체 목록을 Windows/Ubuntu에서 실행하도록 준비하고 Pages에 명시적 release gate를 추가한다. 필수 검증이 미충족인 상태에서 main을 병합해 배포하지 않는다.

## 2026-09-11 후속 후보 823591f

중간 규모 정적 case의 암묵적 동적 해석으로 결과 등록이 실패함을 재현하고 실행 범위를 수정했다. Node FIRST/Direct 등록 PASS, peak managed125063936 bytes, maxRSS1146408 KiB. Direct는 약5분이 걸리고 진행 통지 공백이 남아 응답성·메모리 자격과 단순 완료를 구분한다. 실제 IAB 예열3회/측정5회 반복은 진행 중이다.

같은 후보 Node pilot r5에서22회·원본3포맷·저장복원 PASS. 이전 r4와 변위/반력/부재력66개 묶음 해시 동일. 823591f 전체 회귀는 m6-full-r3로 수행한다. 기존78e8e5a IAB와124/124 증거를 새 후보의 동일 버전 검증으로 소급하지 않는다.

M7은 공개 push 자동 승인 거부와 M6 잔여 gate로 BLOCKED. Windows의 WSL 배포판 목록이 비어 있어 로컬 Ubuntu 결과도 없다. 원격 CI 결과는 실제 실행 전까지 미실행이다.

## 2026-09-11 최종 로컬 후보 202d293

Windows 전체 회귀 124/124 통과. 18aa643은 사용자 정의 결과 케이스의 리본 연결과 실제 상태 문구 접근성을 수정했고, 296e8b8은 WebMCP raw 변위의 m 단위와 화면 mm를 분리했다. 실제 raw 0.009505956274493006 m와 화면 9.505956 mm를 확인했다. 202d293은 Direct 증폭을 선택 조합의 절점 성분 최대 비율로 표시한다. 이 값 1.116은 두 전역 최대변위의 비율이 아니다. 수치 엔진 결과를 임의 보정하지 않았다.

IAB 중간 규모 125절점·260부재·750 full DOF: 예열 3회+측정 5회, FIRST/Direct 16회 모두 성공. 매회 dispose 후 관리 ledger 0, peak 125064722 bytes. 해당 문서는 823591f 수치 모듈을 로드했고 202d293까지 compute/core/solver/design/dynamics/nonlinear 변경 없음이 확인됐다. 화면/단위 최신 수정의 전체 검증은 별도 r4-r6 증거다. 프레임 p95 18.1ms 및 초기 취소 응답 약0.2ms는 동시 작업 환경 관측값이며 성능 합격선 검증으로 쓰지 않는다. 강제 GC 후 renderer/Worker 합산 heap 검증은 미완료다.

추가 취소 시험은 recovery-envelope-design-audit 통지 대기 15초에서 두 번 실패했다. 두 번째는 다른 부하 종료 후 단독 실행했다. 이는 취소 동작의 실패나 해석 비수렴을 확정하지 않으며, 목표 단계 취소가 미검증이라는 뜻이다. 초기 Worker 실행 후 취소 시험은 별도 범위로 기록한다. 원 실패 002/003과 성공/추가 실패를 덮어쓰지 않는다.

로컬 공개 초안 output/phase21/m7-draft-202d293은 검증된 202d293 commit/tree에 고정된다. ZIP 내부 전 파일 SHA와 CRC를 검증했다. 별도 Pages 파일 716개를 생성했다. 이후 증거·문서 정리는 이 실행 후보와 구분한다. 일반 Chrome 동일 pilot, Ubuntu CI, 전체 메모리 자격, 후반 취소 및 공개 승인 미충족으로 release gate는 BLOCKED다. 현재 Pages는 변경하지 않았다.

초기 Worker contract-ready 통지 100ms 후 취소 시험 PASS: running → cancelled, ack 약0.4ms, dispose 약0.3ms, 결과 미등록, ledger 0. 후반 단계는 600초 대기 제한으로 별도 재시험하며 이전 15초 실패 2건을 보존한다.

## 2026-09-11 취소 수정 후보 931dce1 최종 기록

Windows 전체124/124 PASS. 실제 IAB 중간 규모 Direct의 recovery-envelope-design-audit 통지 후 취소: ACK 0.5ms, 실행 대기 종료5004ms, 취소 결과 미등록. 같은 bridge에서 M-FIRST를 후속 실행하여 완료한 뒤 dispose ledger0. native Worker 종료까지 기다린 후 새 service를 생성하는 경로를 검증했다. 이전 15초 단계 대기 실패2건과 수정 전 장시간 대기 기록은 보존한다. 006의 ok:true는 최종 정리만 검사했으므로5초 종료 gate 통과로 해석하지 않는다.

823591f 반복8회 증거는 동일 수치 엔진의 관측이고931dce1의 변경은 취소/Worker 수명이다. 최신124건 회귀와 실제 후반 취소·후속 해석으로 변경 경로를 재검증했다. 기존 pilot 수치·3포맷 hash·저장 복원은 각 기록의 후보 ID를 유지하며 최신 후보에서 모든 단계를 다시 실행한 것으로 소급하지 않는다.

M0–M5 계약 구현 완료. M6 PARTIAL: Chrome 동일 pilot 비교, Ubuntu CI, renderer/Worker 합산 heap 및 고정 환경 성능 자격은 미충족. M7 LOCAL-DRAFT/BLOCKED: 최종 코드931dce1과 정확히 같은 회귀 증거로 ZIP/Pages 로컬 초안을 생성. 이후 문서·증거 commit과 실행 후보를 구분한다. 공개 push/main/Pages는 미수행이다. 외부 비교2건·pilot5건·독립 검토는 사용자 담당이며 최종 구조설계 자격은 미승인이다.
