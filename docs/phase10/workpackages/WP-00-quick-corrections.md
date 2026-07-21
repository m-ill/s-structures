# WP-00 — 즉시 보정: θ 3-tier · RSA scaling 적용

```yaml
wp: WP-00
milestone: P10-M0
formulas: FORMULAS_AND_CRITERIA.md §1
depends: []
```

## 배경 (기존 자산)

- θ: `solver/linear3d.js` `pDeltaDesignStatus`가 caution/strong 2문턱만 분기. `pdelta.thetaRequire`(0.10)는 이미 config·`thetaLimits`에 존재 — **분기만 없다**.
- RSA scaling: `results/rsa/baseShearScale.js`가 방향별 scale·NG·designBlocked까지 완성 — **적용 경로만 없다**.

## 작업

1. `pDeltaDesignStatus` → 4상태(OK/CAUTION/REQUIRE-2ND/NG) 분기. 시그니처에 require 문턱 추가, 호출부(`buildPDeltaDesignSummary`) 3키 전달.
2. REQUIRE-2ND && `pDeltaMethod!=='direct'` → designEligibility 차단 + `PDELTA_SECOND_ORDER_REQUIRED`.
3. 하위호환: `statusLegacy`(OK/WARN/NG) 병행 필드. 기존 소비자(UI·report) 무손상 확인.
4. RSA 적용: `rsa.applyBaseShearScaling`(기본 true) 시 방향별 scale_d를 RSA 변위·관성력·부재력·층 결과에 곱하고 `{scaled, scaleFactor, beforeValue}` provenance 기록. `V_min` 미지정이면 scale=1(무변화)로 기존 동작 유지.
5. `analysisCriteria`에 `rsa.applyBaseShearScaling` 키 추가 (additive).

## 게이트

- 기존 292 스위트 green. V_min 미지정 모델 결과 무변화(<1e-15).
- θ 경계값 단위테스트: 4구간 + 경계 동치(≥ 규약) + REQUIRE-2ND 차단·direct 통과.
- scale 적용 모델: 스케일 전후 비 = scale_d 정확(<1e-12), provenance 완비.
- 테스트: `tests/p10-m0-quick-corrections.mjs`.

## Review Log

| 날짜 | 지적 | 조치 | 상태 |
| --- | --- | --- | --- |
| 2026-07-20 | `thetaRequire`가 판정 분기에 연결되지 않았고 비-direct REQUIRE-2ND 설계차단이 없었음 | θ 4상태 분기, `PDELTA_SECOND_ORDER_REQUIRED`, `statusLegacy` 및 UI/report 호환 경로를 구현하고 경계 테스트를 추가 | 완료 |
| 2026-07-20 | RSA 밑면전단 scale이 trace-only였고 최종 응답·파생 층 결과 provenance가 불완전했음 | `rsa.applyBaseShearScaling` 기본 true, 방향별 combined/nodal/member/story 적용, 미지정·비활성 무변화 및 결과별 `{scaled, scaleFactor, beforeValue}`를 구현 | 완료 |
| 2026-07-20 | 독립 리뷰에서 legacy 옵션 라우팅, late `minimumBaseShear`, 분석/설계 상태 분리 및 파생 story provenance 경로를 재점검 | 지적 경로를 보정하고 M0 전용·관련 회귀, 통합 `npm.cmd test`와 [evidence](../../../reports/validation-evidence/phase10/p10-m0-quick-corrections.json)를 확인 | 완료 |
