# WP-11 — 통합 · 성능 · Release Gate

```yaml
wp: WP-11
milestone: P10-M11
depends: [WP-01 ~ WP-10]
```

## 배경 (기존 자산)

- P8-M10/M11·P9-M10의 제품 통합·release gate 패턴을 탄성 확장에 적용한다:
  UI(Analysis Center·ribbon)·상세보고서·계산 패키지·Agent API에 동일 계약 전파 + focused regression + release 판정.
- featureCatalog(`platform/featureCatalog.js`)가 기능 단일 원본 — 신규 기능 전부 카탈로그·manual 등재(`tests/p4-feature-manual.mjs` 강제).

## 작업

1. 제품 표면 전파: Timoshenko·부분강접·오프셋·MPC·변단면·prestressed·LTB·(승인 시)shell·슬래브 분배를
   UI 입력/결과·보고서·Agent API에 계약 필드로 노출. limitations 문구 일관.
2. featureCatalog·manual.html 등재 + 기능 토글(`resolveFeatureEnabled`) 연결.
3. 성능: 대형 모델(기존 P4 scale-limits 급) + 신규 기능 활성 조합의 solve 시간·메모리 예산 계측 —
   P9 telemetry(`compute/telemetry/`) 재사용. GPU/WASM 경로 유효성 재확인.
4. XV 최종: 오너 기준해 전부 도착·green → 'externally-cross-validated' 배지.
5. release gate: 전 스위트 green + XV green + BM green + evidence 완비 + 문서(개발명세서·user-manual) 갱신 → phase 종료 판정.

## 게이트

- `npm test` 전체 green(누적), `test:p3docs` green, agent contract 체크 green.
- XV 케이스 pending-reference 0건. IMPLEMENTATION_STATUS 전 마일스톤 complete.
- 테스트: `tests/p10-m11-release-gate.mjs`.

## Review Log

| 날짜 | 지적 | 조치 | 상태 |
| --- | --- | --- | --- |
| 2026-07-22 | UI·보고·계산서·Agent 제한사항이 하나의 계약으로 묶이지 않음 | `phase10ReleaseGate`의 제품 통합 계약과 `getPhase10ReleaseStatus`를 추가하고 feature catalog/도움말에 연결 | 완료 |
| 2026-07-22 | 대형 모델 및 GPU 경로 예산 근거 필요 | 120-shell 조합의 CPU f64/GPU f32 shadow 시간·메모리 측정과 fail-closed 네이티브 WebGPU gate 추가 | 완료 |
| 2026-07-22 | 외부 기준해와 실제 GPU 장치 증적 부재 | XV-03~10 및 native WebGPU를 명시적 blocker로 유지; release·설계 전달 금지 | 차단 유지 |
