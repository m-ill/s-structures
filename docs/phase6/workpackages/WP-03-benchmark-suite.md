# WP-03 — Regression Benchmark Suite

```yaml
milestone: P6-M3
priority: 3
depends: WP-01, WP-02
```

## 문제
검증이 요소·조립 일부(B01–B10)에만 있고, 동적·안정성·shell 계층과 회귀표(reference/tolerance/model-hash/solver-version)가 없다. "결과가 나온다"와 "맞다"를 구분하려면 검증 자동화가 필수다.

## 기존 자산 (재사용/확장)
- `src/verification/benchmarkGate.js`·`benchmarkGateCases.js`·`benchmarkGateChecks.js`·`benchmarkGateRunCase.js` — B01–B10 러너(확장 기반).
- `src/verification/memberReleaseBenchmark*.js` — 부재해제(A05).
- `src/verification/rigidDiaphragmBenchmark*.js` — 강체 다이어프램(A03).
- `src/verification/nonlinearBenchmarks.js` — 좌굴/비선형 일부(S01).
- `src/verification/stabilizationHarness.js` — 안정화 하니스.

## 산출물
- `src/verification/matrix/record.js` — 회귀 레코드 스키마 `{caseId, reference, computed, relError, tolerance, modelHash, solverVersion, status}`.
- `src/verification/matrix/elementCases.js`, `assemblyCases.js`, `dynamicCases.js`, `stabilityCases.js` — 계층별 케이스 정의(각 케이스는 reference 출처 주석 포함).
- `src/verification/matrix/runner.js` — 케이스 실행·tolerance 판정·회귀표 산출.
- `tests/p6-verification-matrix.mjs` — CI 게이트(tolerance 초과 시 fail).

## 핵심 식·판정 기준
오차식·계층별 tolerance는 [FORMULAS_AND_CRITERIA §3](../FORMULAS_AND_CRITERIA.md#3-regression-suite--오차식--tolerance-wp-03). `e_rel`, `e_vec`, 힘/모멘트 평형오차, 에너지 체크 `|U−W|`. tolerance는 config `criteria.tolerance.<계층>`(element 1e-9~1e-7 … RSA 1e-4~1e-2). 레코드 스키마는 §3 목록(model_hash·solver_version·reference_source 포함).

## 수용 게이트
1. [VERIFICATION_MATRIX](../VERIFICATION_MATRIX.md) E·A·D·S 계층 자동화(shell 계층은 등가모델 §6B 검증만).
2. 각 케이스가 회귀 레코드 저장, reference 출처 명기.
3. `solverVersion`/`modelHash` 변경 감지, 회귀 diff 산출.
4. `npm test`에 통합, green이 merge 조건.

## 검증 매트릭스 연결
[VERIFICATION_MATRIX](../VERIFICATION_MATRIX.md) 전 계층. 이 WP가 매트릭스의 실행 주체.

## 코드리뷰 체크
reference 값 출처 신뢰성 · tolerance 근거 · 케이스 격리(모델 hash 안정) · 모듈 규모.

## Review Log
| 날짜 | 지적 | 조치 | 상태 |
| --- | --- | --- | --- |
| | | | |
