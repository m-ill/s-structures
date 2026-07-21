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
| 2026-07-21 | global canonical 설정·legacy alias·부재 override가 해석 경로마다 달라질 위험 | 공통 resolver로 통합하고 canonical/alias 충돌과 잘못된 타입은 fail-closed로 검증했다. 신규 모델 기본은 true, 필드가 없던 migration 모델은 EB(false)로 보존했다. | PASS |
| 2026-07-21 | 강성만 Φ를 반영하면 fixed-end/recovery/release가 서로 다른 요소를 표현 | point load와 partial UDL q0를 소스 shape 함수와 독립인 폐형 적분으로 대조하고, 복원 전단항 및 Schur release 응축을 EL-T02~04에서 함께 검증했다. | PASS |
| 2026-07-21 | 변위와 힘을 한 벡터 metric으로 합치면 작은 변위 오차가 큰 힘 scale에 가려짐 | EL-T03은 변위/단부력, EL-T04는 변위/release 잔류력을 각각 별도 record와 tolerance로 분리했다. | PASS |
| 2026-07-21 | legacy 조립 경로에만 구현되거나 compute hash가 설정 변경을 누락할 위험 | `elasticProductionAdapter`, DomainBinary v2, CPU reference 및 backend shadow route를 통과시키고 global/member shear 설정과 Φ를 descriptor/hash에 결속했다. | PASS |
| 2026-07-21 | 기존 Euler–Bernoulli KG가 Timoshenko Ke와 완전 일관하지 않음 | 1차 범위에서 기존 KG를 유지하되 `TIMOSHENKO_CONSISTENT_KG_NOT_IMPLEMENTED` limitation code와 summary trace를 노출했다. | PASS |
| 2026-07-21 | 실제 WebGPU 장치의 9-wide kernel 자격 증거와 XV-09 상용해가 아직 없음 | NVIDIA Ampere/Chrome 149 실제 장치에서 9-wide frame matrix를 최대 상대오차 `9.78e-8`로 검증했다. XV-09 SAP2000 artifact와 다중 vendor/browser 행렬은 pending으로 유지해 M11 release를 계속 차단한다. | PASS (M2) |
