# WP-03 — 부분강접 (회전스프링 단부)

```yaml
wp: WP-03
milestone: P10-M3
formulas: FORMULAS_AND_CRITERIA.md §3
depends: [WP-02]
```

## 배경 (기존 자산)

- 이진 release(`condenseReleasedDofs`)의 일반화. 같은 Schur 응축 패턴을 유한 스프링에 확장한다 —
  release 계약(`core/memberReleaseContract.js`)·벤치마크(`verification/memberReleaseBenchmark*`)가 회귀 기반.
- 스키마: `member.releases`에 `{ spring: { ryI, rzI, ryJ, rzJ } }` additive 확장 (기존 이진 release와 상호배타 검증).

## 작업

1. 스키마·validation: 스프링 강성 유한·비음수, release와 동시지정 금지, migration additive.
2. 강성: 내부 스프링 DOF 응축 방식 채택(§3 — 채택 근거 Review Log 기록). q0 동일 보정.
3. 경고: `connection.stiffRatioWarn`/`releaseRatioWarn` 기준 "강접/release 권장" 경고.
4. Timoshenko(WP-02) 조합 검증. Direct P-Delta 경로: 스프링 단부 부재의 KG 취급 명시(1차: 프리즘 KG 유지 + 진단).
5. element descriptor·domain hash에 스프링 필드 additive. compute 계약 통과.

## 게이트

- CN-F01(∞→강접 <1e-9) · CN-F02(0→release <1e-9) · CN-F03(폐형해 <1e-7).
- 기존 release 벤치마크 green 유지. 테스트: `tests/p10-m3-partial-fixity.mjs`.

## Review Log

| 날짜 | 지적 | 조치 | 상태 |
| --- | --- | --- | --- |
