# Phase 12 Requirements Traceability

    version: p12-traceability-v1
    status: active

| 요구사항 | 설명 | 구현 | 검증 | 상태 |
| --- | --- | --- | --- | --- |
| P12-FR-BASE-01 | 복구 가능한 기준선과 단일 상태 권위 | M0 | P12-BASE-01~06 | qualified |
| P12-FR-BOUNDARY-01 | 공개 allowlist와 private 경계 | M1 | P12-BOUNDARY-01~08 | qualified |
| P12-FR-MIG-01 | 비파괴 이전과 key rotation | M2 | P12-MIG-01~04, P12-KEY-01~02 | qualified |
| P12-FR-HTTP-01 | HTTP·인증·quota 방어 | M3 | P12-HTTP-01~03, P12-AUTH-01, P12-QUOTA-01 | qualified |
| P12-FR-APR-01 | rev-bound 승인·릴리스 | M4 | P12-APR-01~08 | qualified |
| P12-FR-PKG-01 | 안전한 설치·backup/restore | M5 | P12-PKG-01~03, P12-INSTALL-01~02 | planned |
| P12-FR-TEST-01 | Windows release gate 완결성 | M6 | P12-TEST-01~08 | planned |
| P12-FR-REL-01 | local pilot fail-closed release | M7 | P12-E2E-01~03, P12-REL-01~03 | planned |

요구사항 상태는 proposed, planned, implemented, integrated, qualified, blocked, rejected 중 하나를 사용한다.
