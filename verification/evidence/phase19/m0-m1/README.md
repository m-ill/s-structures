# M0~M1 내부 완료 증거

[acceptance-summary.json](acceptance-summary.json)은 56개 기반 회귀와 이후 변경의 추가 시험을 연결한 59개 최신 판정이다. 각 원본 실행의 실패를 덮어쓰지 않는다. 최종 한 커밋의 전체 일괄시험 또는 생산 자격이라고 해석하지 않는다.

- [baseline-summary.json](baseline-summary.json): 소스 식별, 기능 대응표, 자격·성능·미확정 항목과 아키텍처 감사 요약.
- [browser-smoke.json](browser-smoke.json): 직접 UI와 native WebMCP에서 관찰한 로컬 스모크. 최종 diagnostic getter 추가 전의 브라우저 관찰이며 해당 추가는 Node 회귀로 검증했다.
- `r1-validation.json`~`r6-validation.json`: 종료코드, 로그 SHA, 커밋 및 실행 범위.
- [runtime-delta.diff](runtime-delta.diff): R3 이후 런타임 변경의 전체 diff.
- `SHA256SUMS.txt`: 이 폴더의 증거 파일 해시.

각 JSON의 localArtifactRoot 또는 acceptance-summary의 runProvenance가 가리키는 `output/phase19/` 경로에 원본 소스 ZIP, checkout과 로그가 보존되어 있다. 대용량 ZIP·로그는 이 요약 폴더에 복사하지 않았다. GitHub 공개는 M10에서 별도 패키징한다.
