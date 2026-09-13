# Phase26 구현 진행 기록

기준일 2026-09-13 · 기준 커밋 `a2675a62` · 상태: **NOT_STARTED — 계획 수립만 완료**

제품 코드는 아직 수정하지 않았다. 이 문서는 착수 시점의 사실만 담는다.

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
| M0 기준선 고정 | NOT_STARTED | |
| M1 페이지 예산 | NOT_STARTED | 한도 600 적용 시 A01~A04 통과 확인됨(진단 한정, 미적용) |
| M2 낡은 기준선 | NOT_STARTED | |
| M3 계약·거버넌스 | NOT_STARTED | |
| M4 구조 부채 | NOT_STARTED | |
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
