# WP-00 — 기준선·계약·검증 거버넌스

```yaml
milestone: P13-M0
status: qualification-complete
depends_on: []
release_impact: none
```

## 1. 목표와 사용자 결과

코드를 바꾸기 전에 해석 진입점, 상태 저장소, 결과·보고서 consumer와 기능지원 범위를 정확히 고정한다.
사용자는 이 단계에서 새 기능을 받지 않지만, 이후 화면이 같은 run과 같은 결과를 사용한다는 검증 가능한 토대를 얻는다.

## 2. 입력·선행조건

- Phase 7 탄성 UI·run record와 Phase 10 고급 탄성 구현상태
- Phase 11 report snapshot·qualification
- Phase 12 revision·release·backup·Windows test inventory
- current dirty worktree와 사용자 변경 목록

## 3. 작업 분해

### WP00-A. 현재 실행·상태 소유권 감사

- `indexElasticAnalysisRibbon`, `indexAnalysisCenter`, `analysisRunners`, `phase7AnalysisRecords` 진입점 목록화
- 전역 `lastAnalysis`, case result, run record, report snapshot과 Agent API consumer data-flow 작성
- 메인 status는 OK이나 result button·wizard는 미완료인 현재 모순 fixture 고정
- model/edit event별 현재 stale 동작과 누락을 표로 작성

### WP00-B. capability·지원등급 고정

- frame/truss static, Direct P-Delta, modal/RSA, buckling, linear THA 지원등급
- Timoshenko, partial fixity, offset/panel-zone, MPC, tapered와 LTB의 조건부 지원표
- slab load panel과 CPU shell의 별도 capability
- `supported/review-required/preliminary/experimental/unsupported` reason code registry

### WP00-C. 계약·schema 초안

- `AnalysisRunRecord`, `ModelIssue`, `ChangeSet`, `ResultQuery`, `P13ReleaseManifest`
- model/input/settings/result/report hash ownership
- execution status와 engineering qualification status 분리
- migration version, feature flag, legacy adapter expiry 조건

### WP00-D. 검증 거버넌스

- `tools/run-phase13-tests.mjs`와 mandatory test inventory 계획
- evidence schema validator와 artifact hash 규칙
- 대표 fixture, browser viewport, Windows scaling과 성능 장치 profile
- requirement→verification→test→evidence→review coverage validator

## 4. 영향 코드·문서

- 읽기·감사: `src/core/analysisRunRecord.js`, `src/core/analysisDomainHashes.js`
- 읽기·감사: `src/ui/phase7AnalysisRecords.js`, `src/ui/analysisRunners.js`
- 읽기·감사: `src/compute/product/*`, `src/report/*`, `src/ui/indexAgentApi.js`
- 신규 계획: `src/phase13/capabilityRegistry.js` 또는 M0에서 결정한 공용 위치
- 신규 검증: `tests/p13-m0-*`, `verification/evidence/validation/phase13/`

## 5. 검증·정량 수용기준

- P13-BASE-01: 모든 실행 진입점·저장소·consumer 인벤토리 coverage 100%
- P13-BASE-02: 현재 status inconsistency 재현 fixture PASS
- P13-BASE-03: 기존 representative model/result/report hash 기록 100%
- P13-BASE-04: requirement·risk·verification ID dangling reference 0
- P13-BASE-05: OpenSees dependency/process/network runtime route 0
- P13-BASE-06: Phase 7~12 mandatory test inventory 미분류 0
- P13-BASE-07: current UI 1280×720·1920×1080 baseline screenshot 확보
- P13-BASE-08: baseline performance 5회 median/p95/peak memory 기록

## 6. evidence·리뷰

- `verification/evidence/validation/phase13/p13-m0-baseline-contract.json`
- `docs/phase13/reviews/P13-M0-CODE-REVIEW.md`
- `docs/phase13/CURRENT_STATE_AUDIT.md` 최종 갱신

## 7. migration·rollback·실패조건

- M0는 제품 schema와 runtime behavior를 변경하지 않는다.
- audit가 불완전하거나 baseline full regression이 green이 아니면 M1을 시작하지 않는다.
- 사용자 변경과 plan 생성 변경을 별도 diff로 기록한다.

## 8. 비범위·잔여 위험

- 실제 UI 구현, solver 수정과 project migration
- 공학 교차검증 case의 신규 reference 생성
- capability status는 code/evidence가 확인된 범위만 기록한다.
