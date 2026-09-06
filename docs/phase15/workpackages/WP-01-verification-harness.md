# WP-01 — Verification Harness Integrity

```yaml
id: WP-01
milestone: P15-M1
document_status: proposed
owners: [verification, evidence, report]
dependencies: [WP-00]
status_authority: docs/phase15/IMPLEMENTATION_STATUS.md
```

## 목표

case input, reference/oracle, metric gate, evidence와 report를 분리해 잘못된 PASS·REVIEW·hash를 구조적으로 차단한다.

## 영향 영역

- `src/verification/benchmarks/strix21FirstBatch.js`
- 신규 `src/verification/benchmarks/strix21/`
- 신규 `src/verification/phase15/`
- `tests/benchmark-strix21-first-batch.mjs`
- benchmark runner/report tools
- `tests/references/phase15/strix21/`

## 작업

1. root `src/index.js` 역참조를 실제 owner import로 교체
2. case model factory와 expected/reference 분리
3. canonical model/calculation/result/run-record hash 구현
4. null result와 incomplete provenance schema 차단
5. signed metric과 magnitude type 분리
6. mandatory gate·case isolation·stale propagation 구현
7. 상태 개수 snapshot test 제거
8. mutation harness와 artifact-only report 도입
9. 구 명령/export를 thin compatibility façade로 보존

## 시험·수용기준

- same calculation/result hash 3/3 결정성
- timestamp만 변경하면 run-record hash만 변경
- model/reference/tolerance/probe 변경 stale 100%
- SB10 absolute-value mutation FAIL
- fail/blocked/not-run/partial/stale PASS 0
- artifact 밖 report value/prose 0
- mutation kill rate 100%

## Review stop

reference/tolerance 변경과 production numeric 수정이 같은 PR에 있거나 expected import가 하나라도 발견되면 중단한다.
