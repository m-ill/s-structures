# WP-03 — 결정론적 Visual Capture Core

```yaml
wp: WP-03
milestone: P11-M3
status: qualification-complete
contracts: [CaptureSpec, canvas compositor, EvidenceManifest]
depends: [WP-01, ADR-002]
```

## 배경

현재 결과 overlay와 scene 데이터는 있으나 보고서용 capture·카메라·viewport·hash 계약이 없다.

## 작업

1. `CaptureSpec` schema, capture profile과 required/optional 정책 작성.
2. camera, viewport, pixel ratio, combo, layer, deform scale 명시 적용.
3. base canvas와 결과 overlay의 동일-frame compositor 구현.
4. font/image readiness, animation/transition/cursor 안정화.
5. PNG encode와 dimension/content/blank 검사.
6. snapshot/model/result/capture hash를 가진 `EvidenceManifest` 구현.
7. stale spec·timeout·cancel·decode failure reason code 구현.
8. capture 전후 view state 저장·복원과 buffer cleanup.

## 제품 표면

내부 diagnostic API만 추가하고 정식 report embedding은 M4에서 한다.

## 게이트

- `P11-CAP-01~14`, `P11-SEC-01~03`
- `tests/p11-m3-visual-capture-core.mjs`
- 1600×900 이상
- blank/0-byte/stale fixture 검출 100%
- view state 복원 deep-equivalent
- orphan resource 0

## Evidence

`verification/evidence/validation/phase11/p11-m3-visual-capture-core.json`

## Review Log

2026-07-23 구현·focused test·증적 검토를 완료했다.

- 구현: `src/report/phase11/visualCapture.js`, `src/core/stableHash.js`
- 테스트: `tests/p11-m3-visual-capture-core.mjs`
- 증적: `verification/evidence/validation/phase11/p11-m3-visual-capture-core.json`
- 리뷰: [P11-M3-CODE-REVIEW.md](../reviews/P11-M3-CODE-REVIEW.md)
- 판정: `P11-CAP-01~14`, `P11-SEC-01~03` PASS
- 범위 제한: 실제 제품 scene producer와 보고서 삽입은 P11-M4 소유
