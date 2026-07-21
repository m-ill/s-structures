# WP-10 — 하중 생성·전달 완성

```yaml
wp: WP-10
milestone: P10-M10
formulas: FORMULAS_AND_CRITERIA.md §10
depends: [WP-00]
```

## 배경 (기존 자산)

- 질량원 dedup(`loads/loadsV2.js` `buildMassSourceTrace`)·풍 부담폭·우발편심(`design/accidentalEccentricity.js`)은 완성 — 이 규칙과 충돌하지 않게 확장한다.
- 산출 하중은 P6-M2 `loads/fixedEnd/`가 소비 가능한 분포하중 형태로 생성한다(점하중 분할 회귀 금지).

## 작업

1. 슬래브 패널 스키마: `slabPanel { nodes, load(면하중), distribution:'one-way'|'two-way', direction }`.
2. 분배: 1방향 부담폭 / 2방향 45° 항복선(삼각·사다리꼴 §10 식) → 지지 보 분포하중 자동 생성(trace 포함).
3. 평형 검증: Σ전달 = 슬래브 총하중 `loadgen.equilTol`. 손실·중복 방지(보 없는 변 → 벽/직접 기둥 전달 규칙).
4. 풍: 층 부담면적 기하 유도(현행 tributaryWidth 수동입력 보완), 풍상·풍하 부호 구분 trace.
5. 질량원 통합: 슬래브 면하중 질량 변환을 기존 dedup 규칙에 편입(자중·부재질량과 중복 금지).
6. derivation trace: `design/loadDerivationTrace.js` 계약에 슬래브 분배 rows 추가.

## 게이트

- LG-01~04 전부. 기존 loadsV2·질량원 스위트 green.
- 테스트: `tests/p10-m10-load-generation.mjs`.

## Review Log

| 날짜 | 지적 | 조치 | 상태 |
| --- | --- | --- | --- |
