# WP-07 — Local Pilot and Final Release Gate

    milestone: P12-M7
    status: qualification-complete

- portable ZIP을 한 번 검증한 뒤 서로 격리된 `LOCAL-PILOT-01` 상태 루트 3개에서 전체 workflow를 반복한다.
- 서로 격리된 `LEGACY-MIGRATION-01` 원본·대상 3쌍에서 키 교체와 데이터 이전을 반복한다.
- 신규 설치는 account, project, upload, revision, approve, release, restart, stale, backup, empty-root restore를 검증한다.
- 레거시 이전은 원본 불변, manifest parity, 구 token 차단, release history 보존과 새 revision의 stale 전이를 검증한다.
- source와 unpacked release 모두 민감 URL을 404로 반환하고 package manifest의 bytes·SHA-256을 전수 재계산한다.
- 중복 data lock, 저장 quota, partial migration, 잘못된 target path와 live legacy lock은 false success 없이 차단한다.
- 최종 manifest는 loopback-only local pilot만 조건부 허용하고 LAN, public internet, product release, design transfer는 false로 유지한다.

## 확정 결과

- `LOCAL-PILOT-01`: 3/3 PASS
- `LEGACY-MIGRATION-01`: 3/3 PASS
- 결정적 ZIP 연속 빌드 hash parity: PASS
- `npm.cmd run test:release`: PASS, 1,349.0초
- test inventory: 351개 = default 312개 + release-long 39개, unclassified 0개
