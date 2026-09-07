# 코드 리뷰 검증 증거

- 검증 런타임: `07b3e93`, 정확한 commit/tree/archive SHA-256은 `validation.json`의 source에 기록했다.
- 고정 manifest 회귀: **95/95 PASS**, 로그 95개를 원본 바이트 그대로 보존하고 개별 해시를 확인했다.
- `jet-benchmark.json`: 배열 복사 제거 전후의 연산 측정과 300개 정확한 미분 결과 비교.
- `frame-benchmark-controlled.json`: 회귀 종료 후 별도 프로세스에서 측정한 프레임 해석 전후 각 3회와 결과 동일성.
- `architecture-baseline.json`, `architecture-candidate.json`: 정적 경계 감사. 기존 41건과 미문서 wrapper 5개가 남아 있으며 gate는 FAIL이다.
- `SHA256SUMS`: 이 파일을 제외한 증거 묶음 전체 파일의 해시.

[리뷰 보고서](../../../../docs/phase19/CODE_REVIEW_OPTIMIZATION_20260908.md)에 범위·측정 조건·재현 명령·잔여 작업을 기록했다. 회귀 통과와 아키텍처 gate 또는 생산 자격은 별개의 판정이다. 원본 source ZIP은 로컬 `output/review-20260907/regression-r2`에 보존하고 중복 소스 ZIP을 Git에 추가하지 않았다.
