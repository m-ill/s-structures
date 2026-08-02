# Phase 12 Verification Matrix

    version: p12-verification-matrix-v1
    status: active

검증 상태는 PASS, FAIL, BLOCKED, SKIP만 사용한다. 미실행·timeout·missing evidence는 PASS가 아니다.

| 범위 | 검증 ID | 자동 gate | 필수 판정 |
| --- | --- | --- | --- |
| M0 기준선 | P12-BASE-01~06 | tests/p12-m0-baseline-governance.mjs | 문서·복구본·schema PASS |
| M1 공개 경계 | P12-BOUNDARY-01~08 | tests/p12-m1-static-private-boundary.mjs | 민감 HTTP 200 0 |
| M2 이전·비밀 | P12-CONFIG-01~02, P12-MIG-01~04, P12-KEY-01~02, P12-BACKUP-01 | tests/p12-m2-config-migration-secret-lifecycle.mjs | hash 불일치·구 token 성공 0 |
| M3 운영 방어 | P12-HTTP-01~03, P12-AUTH-01, P12-QUOTA-01, P12-LOG-01, P12-READY-01, P12-COMPAT-01 | tests/p12-m3-http-auth-resource-hardening.mjs | false success·비밀 로그 0 |
| M4 승인 | P12-APR-01~08 | tests/p12-m4-approval-revision-integrity.mjs | 없는 rev·stale current 0 |
| M5 패키지 | P12-PKG-01~03, P12-INSTALL-01~02, P12-HELP-01, P12-BACKUP-02, P12-DESKTOP-01 | tests/p12-m5-release-package-install-recovery.mjs | private artifact 포함 0 |
| M6 회귀 | P12-TEST-01~08 | tests/p12-m6-windows-regression-release-gates.mjs | 필수 suite fail·timeout 0 |
| M7 파일럿 | P12-E2E-01~03, P12-SEC-01, P12-FAIL-01, P12-REL-01~03 | tests/p12-m7-local-pilot-release-gate.mjs | 3회 parity·Critical/High 0 |

