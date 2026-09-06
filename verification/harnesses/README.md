# Verification Harnesses

결정론, 성능, 아키텍처, clean-environment 및 qualification 검사기의 canonical 위치다. Phase 16에서 14개 기존 검사기와 layout·재배치·재귀 테스트 수집기를 통합했다.

- `check-phase15-architecture.mjs`는 `src/**`와 `verification/framework/**`를 별도 책임 루트로 감사한다.
- `testInventory.mjs`는 `tests/**`와 `verification/tests/**`를 재귀 수집한다.
- `check-layout.mjs`는 과거 자산 hash, source/runner 재배치, 호환 wrapper와 옛 경로 재유입을 검사한다.
- 제품 build·backup·사용자 CLI는 이곳으로 이동하지 않는다.
