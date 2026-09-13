# Phase26 구현 진행 기록

기준일 2026-09-13 · 기준 커밋 `a2675a62` · 상태: **IN_PROGRESS — M0~M4 완료**

단계가 끝날 때마다 아래 진행표와 [대장](DEBT_REGISTER.json)의 상태를 함께 갱신한다.

## 착수 시점 사실

- 정식 게이트(`npm test`)는 기준 커밋에서 통과한다. 마일스톤 114건과 phase 7~15 스위트가 모두 초록이다.
- 그 게이트는 phase 16~25를 실행하지 않는다. 해당 범위의 검사 266건 중 **27건이 실패** 상태다.
- 27건은 기준 커밋에서 재현했고, 직전 안정화 작업 이전에도 동일하게 실패했다. 즉 이번 안정화가 만든 실패가 아니다.
- 테스트 밖 구조 부채 6건을 함께 등록했다.

## 등록 현황 — 33건

| 묶음 | 건수 | 담당 단계 |
| --- | --- | --- |
| page-budget | 5 | M1 |
| stale-baseline | 8 | M2 |
| contract | 2 | M3 / M4 |
| governance | 3 | M3 / M4 |
| reproducibility | 1 | M4 |
| coverage | 1 | M4 |
| consistency | 1 | M4 |
| gate | 1 | M5 |
| rc-engineering | 11 | **Phase27 이관** |

전체 항목은 [대장](DEBT_REGISTER.json)에 있다.

## 단계 진행

| 단계 | 상태 | 비고 |
| --- | --- | --- |
| M0 기준선 고정 | **DONE** | 27건 직렬 재현, 대장과 정확히 일치. [기준선](../../verification/evidence/phase26/baseline-20260913/baseline.json) · [재현](../../verification/evidence/phase26/baseline-20260913/probes.mjs) |
| M1 페이지 예산 | **DONE** | A01~A05 통과. [ADR-001](adr/ADR-001-PAGE-BUDGET.md) · [측정](../../verification/evidence/phase26/baseline-20260913/page-budget-cost.json) |
| M2 낡은 기준선 | **DONE** | B01~B08 통과. 8건 중 2건은 낡은 기록이 아니라 실제 결함·의미 변경이었다 |
| M3 계약·거버넌스 | **DONE** | C01·E02 통과. E01은 r2 재발행 [제안서](P17-M2-SB1-LOCK-REISSUE-PROPOSAL.md) 제출 후 `DEFERRED` |
| M4 구조 부채 | **DONE** | S01·S03·S05 해소, S02·S04는 사유와 함께 `DEFERRED` |
| M5 게이트 확장 | NOT_STARTED | |
| M6 문서 갱신 | NOT_STARTED | |

## 진단에서 확인한 것과 확인하지 않은 것

**확인한 것**
- `buildDetailDrawings` 기본 `maxPages=60`에 현재 도면이 정확히 도달한다(`count=60 max=60`).
- 한도를 임시로 600으로 올리면 A01~A04가 통과하고 A05는 여전히 실패한다. 측정 후 원상 복구했다.
- `p20-m1`의 불일치 대상은 `buildAgentManifest()`와 `verification/evidence/phase20/m0/public-api.json`이다.
- `p24-m8`은 취소 경로에서 `loadFont`가 호출되지 않아 테스트가 resolver를 받지 못한다.
- `p25-m4` 계열은 후보가 `SPLICE_BAR_MAPPING_STRATEGY_REQUIRED`로 거부되어 `NO_FEASIBLE_DESIGN`이 된다.

**확인하지 않은 것**
- 페이지 한도를 올렸을 때의 실제 메모리·시간 비용. M1에서 측정한다.
- `stale-baseline` 8건 각각의 차이 내용. M2에서 항목별로 출력한다.
- `rc-engineering` 11건의 구현 난이도와 설계 판단 범위. Phase27에서 다룬다.

## 경계

Phase26 완료는 **정식 게이트가 현재 코드 전체를 실행한다**는 뜻이다. 제품 자격, 설계 적합성, 외부 검증을 뜻하지 않는다. `DEFERRED` 항목은 해결된 것이 아니라 사유와 함께 보이게 둔 것이다.

## 누적 기록

### M0 — 기준선 고정 (2026-09-13)

`probes.mjs`가 대장을 읽어 등록된 검사 27건을 **직렬로** 실행하고 `baseline.json`에 결과를 남긴다. 27건 전부 실패했고 묶음별 개수가 대장과 일치한다(page-budget 5 · stale-baseline 8 · contract 1 · governance 2 · rc-engineering 11). 직렬 실행은 선택이 아니다. 고정 포트와 공용 데이터 디렉터리를 쓰는 검사가 있어 동시 실행하면 가짜 실패가 난다.

### M1 — 도면 페이지 예산 (2026-09-13)

조사 결과 **60은 문서 전체 상한이 아니라 PDF 한 권의 크기**였다. 제품 호출부는 이미 전부 600을 쓰고 있었고(`drawingWorker`, `pdfVolumeBundle`), 기본값 60만 분권 결정 이전의 잔재로 남아 예산을 명시하지 않는 직접 호출자를 걸려 넘어뜨리고 있었다.

측정: 상한이 아니라 **보관 창**이 메모리를 좌우한다. 600으로 올린 비용은 +1.3 MB이고 시간은 오히려 줄었다(38.2 ms → 34.6 ms). `pageWindow`가 전체 쪽수만 세고 요청 구간만 보관하도록 이미 설계돼 있기 때문이다.

- 기본 `maxPages` 60 → 600. 상한 검사(`>600` 거부)와 `vectorPdf`·`pdfVolumeBundle`의 권당 60쪽 계약은 **그대로 두었다**. 운영 한도 확대가 아니다.
- A05는 전체 문서를 단일 PDF로 넘기던 시험을 `renderPdfVolume` 경로로 바꿔 해결했다. PDF 권 크기를 늘려 회피하지 않았다.
- 도면 관련 검사 37건을 재실행해 새 회귀가 없음을 확인했다. 남은 실패 4건은 모두 대장에 등록된 기존 항목이다.

### M2 — 낡은 기준선 (2026-09-13)

**8건 중 2건은 낡은 기록이 아니었다.** 차이를 먼저 출력하고 판단한다는 원칙이 실제로 값을 했다.

- **P26-B01은 제품 결함이었다.** `workflowResults.js`와 `workflowCheckpoint.js`가 `globalThis.crypto.randomUUID()`를 가드 없이 호출한다. 보안 컨텍스트가 아닌 브라우저에서는 `crypto`가 없어 **브리지 설치가 통째로 죽고 UI가 초기화되지 않는다.** 시험은 처음부터 옳았고 코드가 회귀한 것이다. 나머지 5개 호출부는 이미 `globalThis.crypto?.randomUUID?.() || fallback` 형태를 쓰고 있었으므로 같은 관례로 맞췄다.
- **P26-B07도 데이터 문제가 아니었다.** 지역 사용성 경로가 더 구체적인 차단(`REGIONAL_SERVICE_SOURCE_REQUIRED`, 누락 조합 id 포함)을 보고하도록 바뀌었다. 기대치를 현행에 맞추되 누락 조합 id까지 확인하도록 **검증을 강화**했다.

**P26-B04(Phase20 수치 기준선)는 재기록하지 않았다.** 동결된 기준선과 현재 결과를 전수 비교한 결과:

- 삭제된 키 **0개**
- 엔지니어링 수치 드리프트 **0건** — 변위·힘·반력·잔차가 Phase20 기록과 동일하다
- 차이 38건은 전부 버전 문자열(20) + 요약 의미 변경(18: `design.ok`, `skippedMembers`, `designBlocked`, `equilibriumFailureReason`)
- 추가된 필드 18종 172곳은 Phase21~25가 넣은 신규 기능(`constraintActions`, `forceRecoveryInput`, `practical*`, `codeBasis` 등)

**해석 엔진이 5개 페이즈 동안 수치적으로 드리프트하지 않았다**는 뜻이다. 그래서 기준선을 덮어쓰는 대신 추가·이행 항목을 `contracts.json`의 `phase26Migration`에 명시 기록했고, 그 외 모든 키는 여전히 정확 비교하며 **키가 사라지면 실패**한다. [측정](../../verification/evidence/phase26/baseline-20260913/p20-numeric-drift.json) · [재현](../../verification/evidence/phase26/baseline-20260913/p20-numeric-drift.mjs)

- P26-B03: 공개 표면은 안정화 커밋이 추가한 상수 2개만 늘었고 삭제는 0이다. manifest 차이 5건은 문서 이동 1건과 Phase25 버전 상승 4건으로 전부 추적된다.
- P26-B05: 호환성 래퍼 검토 기록을 갱신했다. Phase24-25 통합이 래퍼 2개를 작게 수정하면서 검토 기록을 갱신하지 않았던 것이며, 역할·소유자·제거 관문은 그대로다. `revalidatedAt: P26-M2`로 남겼다.
- P26-B02·B06·B08: WebMCP 도구 40→90(전부 고유, 중복 0), 모듈·평가기 버전 상승. 정당성 확인 후 갱신.

### M3 — 계약 불일치와 거버넌스 판정 (2026-09-14)

- **P26-C01**: 코드가 옳았다. 이미 취소된 내보내기는 폰트 로딩을 **시작하지 않는다**. 시험이 `cancel()`을 동기로 먼저 호출해 `loadFont`가 아예 불리지 않았고, 그래서 resolver가 undefined였다. 시험이 폰트 로딩이 실제로 진행 중일 때 취소하도록 고쳐 원래 시나리오(취소-중-폰트-대기)를 그대로 검증한다.
- **P26-E02**: `m6-rc-design`과 같은 Phase24/25 의미 변경이다. 배근이 제공되지 않은 RC 부재는 NG가 아니라 사유(`MISSING_REINFORCEMENT`)를 붙인 `NOT_CHECKED`로 보고된다(23건 NOT_CHECKED, 7건 N_A). 기대치를 바꾸되 **차단된 검사가 드러나고, 각각 사유를 말하며, `scopeComplete`가 false여야 한다**로 강화했다.
- **P26-E01**: **해결하지 않았다.** 봉인된 r1은 Phase20 이전 제품 빌드를 가리킨다(`linear3d.js` 67,784 → 900 B). r1을 덮어쓰지 않고 r2 재발행 제안서를 제출했으며 오너 승인 대기다. M5 제외 목록에 사유와 함께 들어간다.

### M4 — 구조 부채 (2026-09-14)

- **P26-S01 해소.** `P17-M0` 증거가 `.gitignore`된 `tmp/` 산출물을 해시로 고정해 새 클론에서 반드시 실패하던 문제다. 해당 항목은 원래 `authoritative:false`로 기록돼 있다(그 자체로는 아무것도 입증하지 않는다는 뜻). 이제 **없으면 기록된 값을 그대로 해시 계산에 통과시키고, 있으면 기록된 바이트와 일치해야 한다.** 파일을 치운 상태와 되돌린 상태 양쪽에서 통과를 확인했다. 나머지 필드는 여전히 정확 비교다.
- **P26-S03 해소.** `phase9M1.js`만 importer가 없었다(M2~M10은 전부 있음). `tests/p9-m1-evidence-contract.mjs`를 추가해 보관된 증거를 생성기와 대조하고, 잘못된 입력을 거부하는지와 스냅샷 결정성을 확인한다.
- **P26-S05 해소(문서화).** Direct P-Delta는 부재 단부력으로 반력을 복원하므로 구속력 항이 잔차에 **필요**하고, 1차 경로는 축약 시스템에서 반력을 만들어 그 항이 이미 반력 안에 있다. 그래서 그룹 기반 제외는 1차 경로 전용이다. 이 비대칭을 `secondOrder.js`에 남겼다. 두 반력 규약의 통일은 계속 열린 항목이다.
- **P26-S02 `DEFERRED`.** 만료 탐지기가 `currentPhase: 'Phase16'`으로 **하드코딩**돼 스스로 낡고 있었다. 착수된 페이즈(구현 기록이 있는 디렉터리) 기준으로 도출하도록 고쳤고, 그 결과 만료 정책 5건과 미문서화 래퍼 6건이 드러났다. 이 중 `nonlinearBenchmarks.js`는 "Phase16까지 유지" 정책이 실재하므로 동료 3건과 같이 보존 표기했다. 호환성 경로를 이제 제거할 수 있는지는 외부 소비자 판단이 필요해 오너에게 넘긴다.
- **P26-S04 `DEFERRED`.** manifest가 레거시 RC 보고서 버전을 광고하고 제품은 p25 제공 버전을 낸다. 두 경로 모두 실제로 쓰이므로 광고를 고치는 것은 **공개 계약 변경**이다. 정리 페이즈에서 하지 않는다.
