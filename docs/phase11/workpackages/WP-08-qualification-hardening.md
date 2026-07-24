# WP-08 — 시각 · 성능 · 보안 Qualification

```yaml
wp: WP-08
milestone: P11-M8
status: qualification-complete
contracts: [visual qualification, performance budget, failure/security matrix]
depends: [WP-04, WP-06, WP-07]
```

## 배경

보고서는 숫자가 맞아도 font·page break·빈 그림·경로 누출·partial output으로 production failure가 발생할 수 있다.

## 작업

1. Windows Electron/Chromium/font/Poppler qualification profile 고정.
2. ko/en 전 페이지 raster와 semantic/visual diff 구현.
3. Korean glyph/search/copy와 font missing failure 시험.
4. S/M fixture export time, memory, PDF/PNG size 계측.
5. disk full, permission denied, corrupt image, stale hash, hidden window crash 시험.
6. HTML injection, path traversal, secret/local path, no-network 시험.
7. cancel/timeout/retry와 temp/resource cleanup 시험.
8. package/build/install smoke와 offline 환경 검증.
9. visual golden 승인·갱신 규칙 작성.

## 제품 표면

qualification 상태와 blocker를 preflight·도움말에 표시한다.

## 게이트

- `P11-VIS-09~20`, `P11-PERF-01~10`, `P11-SEC-11~20`, `P11-FAIL-09~16`
- `tests/p11-m8-qualification-hardening.mjs`
- dual export p95≤30초, memory≤1GiB
- 각 PDF≤25MiB 또는 승인 reason
- visual/font/privacy/failure defect 0
- full regression green

## Evidence

`reports/validation-evidence/phase11/p11-m8-qualification-hardening.json`

## Review Log

2026-07-23 구현 완료:

- Windows Chromium·Poppler·pypdf profile에서 실제 dual export 5회와 전 페이지 28장 raster를 검증했다.
- p95 3.51초, 관측 peak working set 1GiB 미만, 각 PDF 25MiB 미만을 확인했다.
- blank·edge clipping signal·replacement glyph·privacy finding·false success가 모두 0이다.
- corrupt PDF/asset, font missing, permission, disk full, browser crash, cancel/timeout, path traversal을 fail-closed로 검증했다.
- 관리 샌드박스의 CLI browser에는 `--no-sandbox`가 필요하지만 제품 Electron의 sandbox·context isolation 계약은 유지한다.
