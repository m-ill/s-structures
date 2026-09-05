# WP-06 — 원자적 Dual-PDF Export Service

```yaml
wp: WP-06
milestone: P11-M6
status: qualification-complete
contracts: [export job, Electron PDF adapter, artifact manifest]
depends: [WP-05]
```

## 배경

브라우저 `window.print()`는 두 PDF의 자동 저장·원자적 성공·hash manifest를 보장하지 않는다.

## 작업

1. export plan/job state machine과 progress/cancel 구현.
2. `ReportArtifactManifest`와 locale pair complete 규칙 구현.
3. Electron isolated preload/IPC와 hidden print window 구현.
4. `webContents.printToPDF` adapter와 font/image readiness 구현.
5. browser print-ready fallback과 CLI qualification adapter 구현.
6. temp 생성→PDF 검사→atomic publish 구현.
7. page/bytes/hash/metadata/text/privacy 검증 구현.
8. disk/permission/timeout/cancel/one-locale failure cleanup 구현.
9. prototype Python finalizer의 migration/removal 조건 기록.

## 제품 표면

내부 export service를 제공하고 M7에서 UI·Agent action에 연결한다.

## 게이트

- `P11-PDF-01~16`, `P11-SEC-04~10`, `P11-FAIL-01~08`
- `tests/p11-m6-dual-pdf-export.mjs`
- A4·footer·metadata·한글 text PASS
- local path/secret marker 0
- manifest와 실제 파일 100% 일치
- partial final artifact와 resource leak 0

## Evidence

`verification/evidence/validation/phase11/p11-m6-dual-pdf-export.json`

## Review Log

- 2026-07-23: temp 생성·양 언어 PDF 검사·directory rename 기반 atomic publish를 구현했다.
- 실제 PILOT-OFFICE-01 PDF를 한·영 각 14쪽으로 게시하고 A4·검색 text·CID font embedding·footer를 확인했다.
- locale 한쪽 실패, inspection 실패, timeout, cancel, path traversal에서 final partial artifact 0을 확인했다.
- Electron은 context isolation·sandbox·Node 비노출 preload와 allowlist IPC만 사용한다.
- UI·Agent action과 export history 연결은 WP-07 범위로 유지한다.
