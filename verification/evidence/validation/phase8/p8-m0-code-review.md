# P8-M0 Code Review

```yaml
reviewed_at: 2026-07-11
milestone: P8-M0
status: PASS
critical_findings_open: 0
high_findings_open: 0
```

## 수정 완료 사항

1. 정적 case가 중첩된 legacy payload의 engine metadata를 잘못 상속할 수 있던 경로를 case kind 기준으로 제한했다.
2. Agent API standalone 경로가 immutable run record가 추가되기 전 원시 결과를 반환하던 문제를 수정했다.
3. 다른 case의 verification row로 결과를 `verified` 처리할 수 없도록 case ID를 강제하고, Phase 8 증빙은 case/domain/engine 결속을 요구한다.
4. M0 governance artifact를 수치해석 qualification evidence와 별도 registry로 분리했다.
5. 유효하지 않거나 빈 SDOF NLTH 입력이 완료 결과로 보일 수 있던 경로를 실패 처리했다.
6. schema v5 변경에 맞춰 schema contract version을 갱신하고 전체 `npm test`에 Phase 8 suite를 포함했다.
7. Analysis Center, report, Agent API가 동일한 engine ID와 qualification을 표시하는 회귀 검사를 추가했다.

## 검토 범위

- schema v4 -> v5 migration의 additive 보존과 idempotency
- explicit engine routing과 production-to-legacy fallback 금지
- legacy qualification ceiling과 design-transfer 차단
- run-record integrity 및 case/model/domain/engine evidence binding
- UI, report, calculation package, Agent API metadata parity
- invalid input, unsupported control, unavailable production backend fail-closed 경로

## 잔여 위험

- M0는 수치해석 정확도를 승격하지 않는다. 기존 Pushover와 SDOF NLTH는 회귀 자산으로만 유지한다.
- canonical domain, committed/trial state, 전역 MDOF 잔차·접선은 P8-M1~M2 범위다.
- reference profile의 production 성능 측정은 Worker/WASM sparse backend가 생긴 뒤 수행한다.
