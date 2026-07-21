# WP-07 — 동적 확장: prestressed 모달·RSA / 좌굴 다중모드 / 선형 직접적분 THA

```yaml
wp: WP-07
milestone: P10-M7
formulas: FORMULAS_AND_CRITERIA.md §7
depends: [WP-02, WP-05]
```

## 배경 (기존 자산 — 세 가지 전부 재사용 조합)

- **P9-M6 `compute/eigen/requestedModes.js`** (sparse requested-mode eigen): prestressed 모달·좌굴 다중모드의 solver. dense Jacobi 신규 사용 금지.
- **공용 KG** (`geometricStiffness.js` mode:tangent/buckling): Kt=Ke+Kg(N_G) 조립 재료.
- **P8 Newmark** (`nonlinear/dynamics/newmark.js` 계열)·P9 factorSession: 선형 직접적분 THA는 상수 K_eff 1회 분해 재사용.
- 기존 모달(`dynamics/modal.js`)의 mass-normalization·응축·participation은 그대로 소비.

## 작업

1. prestressed 모달: 중력 comboId 지정 → Direct P-Delta 수렴 축력 → Kt 조립 → eigen. `provenance.stiffnessBasis` 명시(§7). RSA는 해당 모드로 수행하되 강성 고정.
2. 좌굴 다중모드: requested-mode eigen(shift-invert)로 `dynamics.bucklingModes`(기본 6)개. 기존 최저모드 결과 회귀 <1e-8.
3. 선형 직접적분 THA: case kind `linearTha`에 `integration:'modal'|'direct'` 옵션 additive. Rayleigh C(기준 2모드), Newmark β=1/4 재사용, factorSession으로 K_eff 분해 캐시.
4. 설계 게이트: prestressed 결과는 stiffnessBasis 불명 시 designBlocked.

## 게이트

- DY-01~06 전부 (회귀·방향성·λcr 폐형해·최저모드 일치·모드중첩 대조·에너지).
- 기존 모달·RSA·좌굴·linearTha 스위트 green. 테스트: `tests/p10-m7-dynamics-extension.mjs`.

## Review Log

| 날짜 | 지적 | 조치 | 상태 |
| --- | --- | --- | --- |
