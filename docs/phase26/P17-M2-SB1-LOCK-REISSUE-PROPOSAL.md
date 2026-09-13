# P17-M2 SB1 product-build-lock 재발행 제안 (r1 → r2)

2026-09-14 · 상태: **오너 승인 대기** · 대상 P26-E01

## 요청

`verification/benchmarks/strix21/milestones/P17-M2/SB1/model/product-build-lock-r1.json`을 **수정하지 않고**, 현재 제품 빌드를 가리키는 `product-build-lock-r2.json`을 새로 발행할 것을 제안한다.

`verification/**`는 `.gitattributes`에서 `-text`로 지정된 봉인 증거다. r1을 덮어쓰면 당시 기록이 사라진다. 저장소는 이미 `source-locks` → `source-locks-r2`, `p17-m0-baseline-source-lock` → `-r2` 개정 관례를 쓰고 있으므로 같은 방식을 따른다.

## r1이 가리키는 상태

| 항목 | 값 |
| --- | --- |
| version | `p17-product-build-lock-v1` |
| status | `HASH_LOCKED` |
| releaseAllowed | `false` |
| reasonCodes | `P17_EXTERNAL_PRODUCT_BUILD_REVIEW_PENDING`, `P17_DIRTY_WORKTREE_CONTENT_HASH_LOCK_ONLY` |

r1은 **외부 검토 대기 중인 내용 해시 잠금**이며 릴리스 승인이 아니다. 이 점이 재발행 위험을 낮춘다.

## 기록과 현재의 차이

| 파일 | r1 기록 | 현재 |
| --- | --- | --- |
| `src/solver/linear3d.js` | 67,784 B | **900 B** |
| `src/solver/linear3dAssembly.js` | 76,948 B | 82,513 B |
| `src/index.js` | 59,104 B | 61,816 B |
| `src/compute/product/analysisProductService.js` | 34,033 B | 37,553 B |
| `src/compute/product/analysisCaseEngine.js` | 10,312 B | 10,975 B |
| `src/ui/analysisRunners.js` | 12,695 B | 12,990 B |
| `package.json` | 21,272 B | 22,306 B |

7개 전부 달라졌다. 특히 `linear3d.js`의 67,784 → 900 B는 점진적 드리프트가 아니라 **Phase20 모듈 경계 정리에서 구현이 `linear3dAssembly.js` 등으로 옮겨가고 얇은 facade만 남은 결과**다. r1은 Phase20 이전 제품 빌드를 가리킨다.

## 함께 고려할 사실

Phase26 M2에서 Phase20 동결 수치 기준선과 현재 결과를 전수 비교했다. **삭제된 키 0개, 엔지니어링 수치 드리프트 0건** — 변위·힘·반력·잔차가 동일하다. 즉 위 파일들이 크게 바뀌었지만 **탄성 해석 결과는 변하지 않았다.** [근거](../../verification/evidence/phase26/baseline-20260913/p20-numeric-drift.json)

## 오너가 판단할 것

1. 현재 제품 빌드를 SB1의 기준 빌드로 받아들일 것인가.
2. r2도 `releaseAllowed:false` / `EXTERNAL_PRODUCT_BUILD_REVIEW_PENDING`을 유지할 것인가. (제안: 유지. 외부 검토는 여전히 없다.)
3. r1은 개정 이력으로 보존한다. (제안: 보존)

## 승인 전까지

`tests/p17-m2-sb1-lock-package.mjs`는 계속 실패한다. Phase26 대장에서 P26-E01은 **`DEFERRED`**이며, M5 게이트 확장에서 사유와 함께 제외 목록에 들어간다. 통과시키기 위해 r1을 덮어쓰지 않는다.
