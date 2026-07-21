# WP-04 — 3D 단부 오프셋 · 삽입점 · 패널존

```yaml
wp: WP-04
milestone: P10-M4
formulas: FORMULAS_AND_CRITERIA.md §4
depends: [WP-00, WP-01]
```

## 배경 (기존 자산)

- 현행: `linear3dAssembly.js` `endOffset.{i,j,rigidFactor}` 축방향 강체 단축(rigidFactor=1). 이를 3D 강체팔 r로 일반화하고 축방향은 특수경우로 흡수 — **기존 모델 하위호환 필수**.
- element descriptor `geometry.offsets`(P8-M1)가 이미 offset 스냅샷 자리 보유 — 필드 확장은 additive.

## 작업

1. 스키마: `member.endOffset` 확장 `{ i:{dx,dy,dz}|number, j:…, frame:'local'|'global' }` (number=기존 축방향 하위호환).
2. T_off 12×12 변환(§4) 구현: k̄=T_offᵀ k T_off, q̄0=T_offᵀ q0. 복원·station 좌표는 유연구간 기준.
3. 삽입점: 단면 배치 기준점(top-center 등) → y/z 편심 자동 산출해 동일 r 메커니즘.
4. 패널존(옵션): `joint.panelZone {tp, db, dc}` → K_pz 회전스프링 자동 부여(WP-03 스프링 재사용, source='panelZone').
5. `rigidFactor<1` 명시 차단 유지(기존 에러코드). 평형감사에 강체팔 모멘트 전달 검사 추가.
6. KG·P-Delta: 오프셋 부재 축력 회수 경로 검증. compute 계약 통과, domain hash additive.

## 게이트

- EL-O01(r=0 회귀 <1e-12) · EL-O02(편심 폐형해 <1e-8) · EL-O03(패널존 등가 <1e-9) · `offset.equilibriumTol`.
- 기존 축방향 offset 모델 결과 불변(<1e-12). 테스트: `tests/p10-m4-offsets-panelzone.mjs`.

## Review Log

| 날짜 | 지적 | 조치 | 상태 |
| --- | --- | --- | --- |
