# Phase 4 Roadmap

status: active
start: 2026-07-03

## Current Pre-Beta Execution Status

This section is the current execution status for the user-requested pre-beta
scope. The validation WPs and beta/GA WPs are intentionally left unstarted.

| Milestone | Status | Completed | Evidence |
| --- | --- | --- | --- |
| P4-M0 | complete | 2026-07-03 | Phase 4 document set exists and the full regression suite is green. |
| P4-M1~M4 | deferred-by-scope | - | Validation WPs are excluded from the current user request. |
| P4-M5 | complete | 2026-07-03 | WP-05 complete; TD-02..06, TD-09, TD-12, TD-13 fixed and covered by P4 tests. |
| P4-M6 | complete | 2026-07-03 | WP-06 complete; project-meta cache, independent I/O, perf budget, and scale evidence covered by P4 tests. |
| P4-M7 | complete | 2026-07-03 | WP-07 complete; modeler host, revision save flow, import overlay, library UI, and preview validation covered by P4 tests. |
| P4-M8 | complete-for-pre-beta | 2026-07-03 | WP-08 complete for pre-beta packaging; release build, version sync, license, backup, and smoke records exist. |
| P4-M9 | complete-for-pre-beta | 2026-07-03 | WP-09 complete for pre-beta documentation; coverage, onboarding, tutorials, and agent contract are machine-checked. |
| P4-M10~M11 | not-started | - | Beta pilot and GA release remain out of the current execution scope. |

Detailed evidence is recorded in `docs/phase4/PRE_BETA_EXECUTION_AUDIT.md`.

3개 stage, 12개 마일스톤(P4-M0~M11). 각 마일스톤은 **기계 확인 가능한 exit criteria**가 있고, 완료 시 해당 review 계약(코드)의 상태가 바뀌어 테스트로 잠긴다. 크기: S 며칠 / M 1-2주 / L 2-4주 상당.

## Stage Overview

| Stage | Milestones | 목표 | 완료 판정 |
| --- | --- | --- | --- |
| Stage 0 | P4-M0 | 기준선: 상태 평가 고정, 문서 세트, 부채 등재 | 문서 세트 커밋 + full suite green |
| Stage V 실증 | P4-M1~M4 | preliminary 13개 → proven 승격 | 완성도 감사 preliminary 0 |
| Stage H 강화 | P4-M5~M7 | 부채 상환, 성능 실증, 모델러 통합 | TD P0/P1 = 0, 성능 예산 통과 |
| Stage R 출시 | P4-M8~M11 | 패키징, 문서, 베타, GA | 출시 체크리스트 + 파일럿 blocker 0 |

병렬성: Stage V의 M1~M4는 상호 독립(병렬 가능). Stage H의 M5/M6은 V와 병렬 가능, M7(모델러 통합)은 독립 착수 가능하되 M3 저장 계층에 의존. Stage R은 V·H 완료에 의존하나 M9(문서)는 조기 착수 가능.

## Milestone Summary

| Milestone | 크기 | 목표 | 승격 대상 | WP |
| --- | --- | --- | --- | --- |
| P4-M0 | S | Phase 4 기준선 | - | - |
| P4-M1 | L | 탄성해석 실증 | P3-M10~M13 → proven | WP-01 |
| P4-M2 | L | 비선형해석 실증 | P3-M14~M16 → proven | WP-02 |
| P4-M3 | L | 설계모듈 실증 | P3-M17~M18 → proven | WP-03 |
| P4-M4 | L | 도면/점군 import 실증 | P3-M7~M9 → proven | WP-04 |
| P4-M5 | M | 플랫폼/보안 강화 | TD-02~06, 09, 12, 13 | WP-05 |
| P4-M6 | M | 성능/규모 실증 | TD-08, 15 + 성능 예산 증빙 | WP-06 |
| P4-M7 | L | 모델러 통합·프론트 완성 | **TD-01**, 07, 10, 11 | WP-07 |
| P4-M8 | M | 패키징/배포 | TD-14, P3-M19 승격 일부 | WP-08 |
| P4-M9 | M | 사용자 문서/온보딩 | - | WP-09 |
| P4-M10 | M | 베타 파일럿 | - | WP-10 |
| P4-M11 | S | GA 출시 | P3-M20 manual 증빙 완료 | WP-10 |

## Exit Criteria (마일스톤별)

### P4-M0 Baseline (오늘)
1. `docs/phase4/` 문서 세트 + `workpackages/` 10건 커밋.
2. `CURRENT_STATE_ASSESSMENT.md` 스냅샷 고정, TD-01~15 등재.
3. docs 인덱스/phase3 상태 갱신, full suite green.

### P4-M1 탄성해석 실증 (WP-01)
1. 탄성 확장 기능(스프링/침하/트러스/offset/부분하중/온도/벽체/semi-rigid/CQC/좌굴/THA) 각각에 **독립 출처 기준값** 확보: 교과서 해석해 또는 수계산 검증서 (`docs/verification/ELASTIC_EXPANSION_VALIDATION.md`).
2. 대표 3개 모델에 대해 **상용 프로그램 대조표** (절점변위/반력/부재력, 허용오차 명기) — 사용자 제공 MIDAS/ETABS 결과 또는 문헌 예제.
3. tension-only 반복해석의 조합별 활성상태 경계 케이스 테스트 5종 추가.
4. `phase3CompletionAuditReview`에서 M10~M13 proven 전환 + 테스트 갱신.

### P4-M2 비선형해석 실증 (WP-02)
1. 벤치마크 B1~B8 tolerance 재점검 + 문헌 출처 명기 (Mattiasson 표 등 원전 인용).
2. 다힌지 동시 항복 검증 케이스 (2층 포탈 메커니즘 순서 추적) 수계산 대조.
3. NLTH: El Centro 기록으로 탄성 THA ↔ modal superposition 일치(±1%), 탄소성 1자유도 문헌 대조.
4. 대표건물 pushover의 상용/문헌 대조 1건 또는 수계산 성능점 검증.
5. M14~M16 proven 전환.

### P4-M3 설계모듈 실증 (WP-03)
1. RC 보/기둥/벽/슬래브 × 각 3케이스 이상 **수계산 검증서** (`docs/verification/DESIGN_MODULE_VERIFICATION.md`) — KDS 조항 번호와 예제집 출처 명기.
2. 철골 부재/가새/접합, 기초 각 3케이스 수계산 검증서.
3. 적용 KDS 조항 목록 확정(조항 registry에 버전 표기) + 미적용 조항의 계산서 limitation 문구 확정.
4. 대표건물 10종 일람표 재생성 회귀 고정. M17~M18 proven 전환.

### P4-M4 도면/점군 import 실증 (WP-04)
1. **실제 DWG 파일** e2e: ODA File Converter 설치 환경에서 실무 도면 1건 이상 변환→인식→확정→해석. 변환기 부재 환경의 안내 UX 검증.
2. **실측 점군 1건 이상** (공개 데이터셋 또는 사용자 스캔): 층/기둥 검출 recall/precision 리포트 + 검토 UI로 확정까지.
3. 대용량 성능: 1e7점 로드/전처리 30초 예산 실측 기록 (`reports/validation-evidence/pointcloud-perf.json`).
4. 바이너리 PLY/PCD/LAS 손상 파일 fuzz 20케이스 (crash 0). M7~M9 proven 전환.

### P4-M5 플랫폼/보안 강화 (WP-05)
1. TD-02(nosniff/Content-Type 강제), TD-03(라우트 인증 선언화), TD-04(role enum), TD-05(userStore 락), TD-06(dataDir lockfile), TD-09(serve.mjs 제거), TD-12, TD-13 전부 fixed.
2. 라우트 계약 테스트가 "모든 /api/projects 라우트는 role 선언 필수"를 구조적으로 강제.
3. 보안 체크리스트(`SECURITY_HARDENING_PLAN.md`) 전 항목 통과.

### P4-M6 성능/규모 실증 (WP-06)
1. TD-08, TD-15 해소 (요청당 project.json 1회 읽기, 독립 I/O 병렬화).
2. 성능 예산 6종(점군 로드/뷰어 fps/탄성해석/pushover/NLTH/일람표) 실측값을 `reports/validation-evidence/perf-budget.json`으로 고정, 예산 테스트 게이트화.
3. 대형 모델(부재 2,000+) 탄성해석 실측 및 한계 문서화.

### P4-M7 모델러 통합·프론트 완성 (WP-07)
1. **TD-01 해소**: `#/p/:id/modeler`에서 native 모델러가 실제 기동, 서버 저장(Ctrl+S→revision)/불러오기/autosave 연동. index.html 단독 실행도 유지 (이중 엔트리 회귀 테스트).
2. TD-07(shell 재진입 가드), TD-10(라우트 컴파일러 공용화), TD-11(vector 공용화).
3. import 검토 UI가 실제 뷰어 overlay 위에서 동작 (M4 산출물과 연결).
4. 재료 라이브러리 편집 UI 서버 저장 e2e.
5. 브라우저 실검증(프리뷰): 로그인→모델링→해석→저장→계산서 콘솔 에러 0.

### P4-M8 패키징/배포 (WP-08)
1. 배포 형태 확정 및 구현: (a) 웹 단일 배포 스크립트+서비스 가이드, (b) Electron 데스크톱(내장 서버) — 둘 다 클린 머신 설치 smoke.
2. TD-14 해소. 버전 정책(semver) + CHANGELOG 개시 + `platformVersion` 동기 테스트.
3. 라이선스 키 검증 v1 (오프라인 서명 검증) + 빌드 재현 절차 문서.

### P4-M9 사용자 문서/온보딩 (WP-09)
1. user-manual 전면 개정: Phase 3 신기능(import/점군/재료/비선형/플랫폼) 반영, 신규 사용자 튜토리얼 3편.
2. 온보딩 샘플 프로젝트 3종 내장. agent-contract 최신화 diff 0 테스트.
3. "신규 사용자 30분 시나리오" 통과 (문서만 보고 도면→계산서 도달).

### P4-M10 베타 파일럿 (WP-10)
1. `BETA_PROGRAM_PLAN.md`의 10 시나리오를 실사용자(또는 오너 대행)로 실행, 시나리오별 리포트 (`reports/launch-readiness/pilot-##.md`).
2. blocker는 TD 등재→수정→재실행. blocker 0으로 종료.

### P4-M11 GA 출시
1. 출시 체크리스트(`RELEASE_PLAN.md`) 전 항목 + 완성도 감사 preliminary 0 + TD P0/P1 = 0.
2. P3-M20 owner 서명 증빙 등록 (evidence register). 버전 1.0.0 태깅.

## Dependency Notes

| 먼저 | 이후 |
| --- | --- |
| M0 | 전체 |
| M1(탄성 실증) | M3(설계는 탄성 demand 기준값 공유) |
| M4(import 실증) | M7의 import 검토 UI 실연결 |
| M5(보안) | M8(패키징은 강화된 서버 전제) |
| M7(모델러 통합) | M9(문서는 최종 UI 기준), M10(파일럿) |
| M1~M9 | M10 → M11 |

## Progress

| Milestone | Status | 완료일 | 비고 |
| --- | --- | --- | --- |
| P4-M0 | in-progress | - | 문서 세트 작성 중 |
| P4-M1~M11 | not-started | - | - |
