# Phase 12 Threat Model

    version: p12-threat-model-v1
    status: active

| ID | 자산·경계 | 위협 | 필수 통제 | 목표 |
| --- | --- | --- | --- | --- |
| P12-T01 | public/private | 저장소·사용자 파일 직접 조회 | 공개 allowlist와 균일 404 | M1 |
| P12-T02 | URL/path | encoding·backslash·junction 경계 이탈 | decode-once와 canonical containment | M1 |
| P12-T03 | config | public/data/secrets 중첩 | 시작 시 fail-closed | M1~M2 |
| P12-T04 | package/backup | 실제 data·key 포함 | forbidden scan과 secrets 기본 제외 | M2, M5 |
| P12-T05 | migration | 중단·병합·손상 | dry-run, SHA-256, atomic publish | M2 |
| P12-T06 | session | 노출 가능 구 키·token 재사용 | explicit rotation과 tokenVersion 증가 | M2 |
| P12-T07 | HTTP/storage | 대입·과대 요청·무제한 저장 | rate limit, route limit, quota, rotation | M3 |
| P12-T08 | approval | 없는 rev·stale rev 릴리스 | rev/hash 결속과 current/history 분리 | M4 |
| P12-T09 | compatibility | 보안 경계로 정상 UI·WASM 파손 | asset closure와 browser smoke | M1, M5 |
| P12-T10 | release | 부분 evidence로 거짓 release | source/artifact hash와 fail-closed manifest | M6, M7 |

실제 사용자 data, raw token, session secret, 이메일과 프로젝트 본문은 보안 evidence에 저장하지 않는다.

