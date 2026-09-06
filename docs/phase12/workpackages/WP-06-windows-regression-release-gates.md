# WP-06 — Windows Regression and Release Gates

    milestone: P12-M6
    status: qualification-complete

- 모든 `tests/*.mjs`를 실행 그래프에서 찾아 `default` 또는 `release-long`으로 분류한다.
- `npm test`는 Windows에서 줄바꿈 형식과 무관하게 도움말 동기화를 검증하고 P12 전용 gate까지 실행한다.
- `npm run test:uncovered`는 기존 기본 그래프에 없던 장시간·릴리스 검증을 빠짐없이 실행한다.
- `npm run test:release`는 두 그래프를 순서대로 실행하며 하나라도 실패·timeout이면 성공하지 않는다.
- P8 전체 스위트와 P10 evidence 계약을 포함한 공식 기본 회귀는 실제 종료 코드 0이어야 한다.
- 테스트가 자동 갱신하는 기존 사용자 작업 파일은 별도 SHA-256 사본으로 보호하고 원래 내용으로 복원한다.

## 확정 결과

- inventory: 350개
- default: 311개
- release-long: 39개
- unclassified: 0개
- Windows `npm test`: PASS, 1,278.5초
- `npm run test:uncovered`: PASS, 98.0초
- 도움말 CRLF/LF 비교: PASS
- P8 전체 실행: PASS
