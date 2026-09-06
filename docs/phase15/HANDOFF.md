# Phase 15 Handoff

```yaml
version: p15-handoff-v3
updated_at: 2026-08-28
status_snapshot: implementation-executed-release-blocked
next_action: close-M0-M7-M8-clean-nfr-review-and-r4-gates-before-release
status_authority: docs/phase15/IMPLEMENTATION_STATUS.md
final_design_transfer_allowed: false
```

## 1. 현재 인계점

Phase 15의 scoped 구현, 내부시험, 아키텍처 감사와 M9 fail-closed manifest 도구는 존재한다. 최신 first-batch는 12건을 실제 실행해 `PASS 9`, `CUSTOM_PASS 1`, `BLOCKED 2`, 수치 metric `52/52 PASS`를 기록했다.

릴리스는 아직 허용되지 않는다. PD1은 stage work balance가 결과 계약에 없고, SM5는 독립 reference mode vector가 없다. M0 독립 승인·성능 기준선과 M8 High 52건도 열려 있다. 실제 3회 결정론은 PASS했고 전체 `npm.cmd test`도 planned 364, fail/skip/timeout/flake `0/0/0/0`으로 PASS했다. 전체 회귀 source digest는 M8 감사의 `7293013eaea14530412cd88980384f62b2a03da3d20da057e291a9a0a6fc2fc9`와 일치하지만, 이 1회 local 실행은 clean-environment 또는 동일 환경 10회 NFR 증거가 아니다.

## 2. 먼저 읽을 문서

1. `docs/phase15/IMPLEMENTATION_STATUS.md`
2. `docs/phase15/BENCHMARK_EXECUTION_GUIDE.md`
3. `docs/phase15/reviews/P15-M8-CODEBASE-REVIEW.md`
4. `docs/phase15/P15_M9_RELEASE_RUNBOOK.md`
5. `verification/benchmarks/strix21/runs/first-batch-results.json`
6. `verification/evidence/validation/phase15/p15-m8-architecture-audit.json`
7. `verification/evidence/validation/phase15/p15-m9-determinism-evidence.json`
8. `verification/evidence/validation/phase15/p15-m9-full-regression-evidence.json`
9. `verification/evidence/validation/phase15/p15-m9-release-manifest.json`

계획의 원래 요구사항과 변경 이유가 필요할 때 `README.md`, `DISCREPANCY_REGISTER.md`, `MILESTONE_EXECUTION_PLAN.md`, `VERIFICATION_MATRIX.md`를 추가로 읽는다.

## 3. 구현된 canonical owner

| 관심사 | owner |
| --- | --- |
| deterministic sparse assembly | `src/compute/sparse/assembly.js` |
| SPD solve/factor policy | `src/compute/elastic/spdSolvePolicy.js`, `src/compute/elastic/factorSession.js` |
| plate boundary | `src/solver/shell/plateBoundary.js` |
| foundation end/station recovery | `src/solver/foundation/foundationRecovery.js` |
| unsupported rotation plan | `src/solver/shell/unsupportedRotationFloor.js` |
| model hash | `src/core/modelHash.js` |
| P15 evidence/release contract | `src/verification/phase15/` |

전체 `src` import cycle과 internal root barrel import는 0이고 위 네 수치·경계 owner는 각각 단일 owner다. production→verification, UI→numeric과 report→solver 경계는 아직 차단 finding이다.

## 4. 다음 작업 순서

1. M0 reference/tolerance/probe manifest와 numerical·structural-domain·verification·architecture·release reviewer를 실제 승인 자료로 동결한다.
2. PD1 production result에 load-step별 external work, internal work, residual과 단위·부호를 노출하고 negative/mutation 시험을 추가한다.
3. SM5의 독립 full-precision reference mode vector를 출처·축·정규화·hash와 함께 등록하고 signed MAC·mass orthogonality를 재검증한다.
4. 해소된 M8 Critical 설계전달 역참조 회귀를 유지하고 남은 High import/wrapper findings를 owner별 PR로 처리한다.
5. 현재 3회 결정론과 source-bound 전체 회귀 PASS를 보존한다. 이후 `src` 변경 시 M8 감사 뒤 전체 회귀를 다시 실행하고, test·runner·`package.json` 변경 시 frozen inventory를 별도 승인한 뒤 전체 회귀를 다시 실행한다.
6. 동일 환경 10회 NFR, M0 대비 runtime/peak RSS, 독립 clean environment, mutation 100%와 product surface parity를 실행한다.
7. MIDAS·STRIX R4 원본과 동일 모델 mapping 감사를 추가한 뒤 `--require-release` gate를 실행한다.
8. 별도 구조 책임자가 검토하기 전에는 최종 설계전달을 켜지 않는다.

## 5. 재현 명령

```powershell
npm.cmd run test:p15:list
npm.cmd run test:p15
npm.cmd run test:p14
npm.cmd test
npm.cmd run benchmark:strix21:first
npm.cmd run report:strix21:first
npm.cmd run evidence:p15:determinism
npm.cmd run check:p15:architecture
npm.cmd run evidence:p15:full-regression
npm.cmd run evidence:p15:m9
```

현재 `check:p15:architecture`는 열린 finding 때문에 non-zero가 정상이다. 최종 증거 순서는 `src 고정 → M8 감사 → full regression → 두 sourceDigest 비교 → M9 manifest`다. `evidence:p15:m9`는 manifest를 만들지만 입력 승인 자료가 비어 있으면 BLOCKED를 반환한다. 릴리스 CI에서는 `node tools/run-p15-m9-release.mjs --input=<승인 입력> --baseline=<M0 기준선> --architecture=<M8 감사> --full-regression=<전체 회귀 증거> --require-release`를 사용한다.

## 6. 보존·변경 원칙

- 현재 저장소는 큰 dirty/untracked 작업트리다. 사용자 변경을 reset하거나 덮어쓰지 않는다.
- benchmark 값을 보고 tolerance·reference를 수정하지 않는다.
- expected/reference를 production 모듈로 이동하지 않는다.
- 물리적 rigid mechanism을 numerical stabilization으로 숨기지 않는다.
- 기존 report/evidence를 갱신할 때 이전 hash와 판정 변화 이유를 남긴다.
- capability 하나의 승격을 전체 release로 확대하지 않는다.
