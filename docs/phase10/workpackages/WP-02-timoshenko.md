# WP-02 — Timoshenko 전단변형 요소

```yaml
wp: WP-02
milestone: P10-M2
formulas: FORMULAS_AND_CRITERIA.md §2
depends: [WP-00, WP-01]
```

## 배경 (기존 자산)

- 전단면적 산정은 **이미 있다**: `materials/sectionProperties.js`(5A/6, 0.9A 등) + Ay/Az 스냅샷·어댑터 흐름. 이번 작업은 `localK12`가 이를 **소비**하게 하는 것.
- 강성만 바꾸면 고정단력·복원·응축과 불일치 — P6-M2 fixed-end 라이브러리와 `linear3dRecovery`를 같은 마일스톤에서 갱신한다.

## 작업

1. `localK12` 확장: Φ_y·Φ_z 인자 추가(기본 0 = EB). 호출부는 `effectiveSectionMaterial` 경유로 As_y/As_z 전달. `analysisSettings.shearDeformation`(기본 true)·요소별 override.
2. `loads/fixedEnd/` Φ 반영: pointLoad(비대칭 케이스), 부분 UDL. 대칭 UDL(±qL²/12)은 불변 — 회귀 앵커.
3. `linear3dRecovery` 처짐에 전단성분 ∫V/(GAs) 추가 (내력 V·M·N·T 식 자체는 평형 기반이라 불변).
4. `condenseReleasedDofs` 무변경 검증(Schur 일반형) — Timoshenko+release 조합 테스트.
5. KG: 1차 범위에서 기존 `geometricStiffness.js` 유지, Timoshenko-일관 KG 차이는 진단 필드로 노출(§2 규칙).
6. compute 계약: 수정 강성이 `elasticProductionAdapter`·domainBinary 통과, CPU↔backend 일치 게이트. domain hash에 shearDeformation 플래그 additive.

## 게이트

- EL-T01(Φ=0 회귀 <1e-12) · EL-T02(깊은 보 폐형해 <1e-9) · EL-T03(UDL 앵커) · EL-T04(release 조합) · XV-09.
- 분할수-독립 게이트(P6-M2) 유지. 기존 스위트 green(EB 기본 경로 tolerance-identical).
- 테스트: `tests/p10-m2-timoshenko.mjs`.

## Review Log

| 날짜 | 지적 | 조치 | 상태 |
| --- | --- | --- | --- |
