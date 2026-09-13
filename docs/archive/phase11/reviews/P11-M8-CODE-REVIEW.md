# P11-M8 Code Review — Qualification Hardening

```yaml
milestone: P11-M8
reviewed_at: 2026-07-23
scope: visual, performance, font, privacy, failure and product qualification
decision: PASS
critical_high_findings: 0
```

## Review Result

`qualifyPhase11Reports`는 예산과 측정치를 분리하고 누락 측정을 PASS로 해석하지 않는다. 5개 실제
dual-export sample, 전 페이지 raster, PDF 내부 font/text/footer/A4, 보안과 8개 실패 시나리오가
모두 통과해야 `status=PASS`가 된다. qualification hash는 예산·측정·check·blocker를 포함한다.

## 시각 검토

한국어와 영어 각 14쪽 contact sheet를 직접 검토했다. 첫 페이지에 결론과 제한이 나오며 목차,
7개 필수 그림, 결과표가 순서대로 배치된다. 빈 페이지, 경계 잘림, 대체문자, 겹침은 발견되지
않았다.

## 성능·자원

- 실제 Playwright Chromium dual export 5회
- p95 30초 예산 PASS
- aggregate exporter/browser working-set 1GiB 예산 PASS
- 첫 progress 500ms, cancel acknowledgement 2초, PDF 25MiB 예산 PASS

## 보안·실패

오프라인 browser context를 사용하고 HTML/PDF에서 secret·사용자 경로를 검사한다. corrupt PDF,
font missing, corrupt asset, permission denied, disk full, hidden browser crash, cancel/timeout,
path traversal은 최종 디렉터리를 게시하지 않고 staging을 정리한다. 제품 Electron의
`sandbox/contextIsolation`은 유지하며 관리 샌드박스 내부 CLI에만 `--no-sandbox`를 사용한다.

## 결론

M8 범위의 Critical/High finding은 0이다. macOS/Linux native PDF는 이 qualification claim에
포함하지 않으며, 독립 구조공학 정답 부재에 따른 `CONDITIONAL_PASS`는 변경하지 않는다.
