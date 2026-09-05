# Verification Test Taxonomy

검증 테스트는 물리 위치와 무관하게 `verification/tests/taxonomy.json`에서 `unit`, `integration`, `e2e`, `qualification`으로 분류한다. 수집기는 `tests/`와 `verification/tests/`를 재귀 탐색하며 planned count 감소를 taxonomy stale failure로 처리한다.

Phase 16에서는 기존 404개 테스트 파일을 대량 이동하지 않는다. 상대 import와 역사 package command를 불필요하게 흔들지 않으면서 먼저 재귀 수집과 소유권을 고정한 뒤, 새 qualification test부터 `verification/tests/`에 둔다.
