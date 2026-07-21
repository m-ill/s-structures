# WP-06 — 변단면(비프리즘) 부재

```yaml
wp: WP-06
milestone: P10-M6
formulas: FORMULAS_AND_CRITERIA.md §6
depends: [WP-02]
```

## 배경 (기존 자산)

- 단면 산정(`materials/sectionProperties.js`)·유효단면(`effectiveSectionMaterial`) 위에 길이방향 프로파일을 얹는다.
- 복원 station 인프라(21 station)가 이미 있어 I(x)·A(x) 평가 지점으로 재사용.

## 작업

1. 스키마: `member.taper = { profile:'linear'|'parabolic-depth'|'segments', sectionIdJ | segments[] }` additive.
2. 강성 Gauss 적분(§6, `taper.gaussPoints` 기본 5): k=∫BᵀDB. Timoshenko와 조합(Φ(x)).
3. 고정단력·복원함수 동일 적분 기반. lumped 질량 ∫ρA. KG는 N(x)·I(x) 반영해 `geometricStiffness.js` 확장.
4. compute 계약 통과, descriptor에 taper 스냅샷 additive.

## 게이트

- EL-P01(상수 회귀 <1e-12) · EL-P02(폐형해 <1e-6) · EL-P03(적분 수렴 <1e-8).
- 테스트: `tests/p10-m6-tapered.mjs`.

## Review Log

| 날짜 | 지적 | 조치 | 상태 |
| --- | --- | --- | --- |
