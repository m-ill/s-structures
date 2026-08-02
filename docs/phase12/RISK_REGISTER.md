# Phase 12 Risk Register

    version: p12-risk-register-v1
    status: active

| ID | 심각도 | 위험 | owner | 목표 | 중단조건 |
| --- | --- | --- | --- | --- | --- |
| P12-R01 | Critical | 정적 경로로 private 파일 노출 | server | M1 | 민감 URL HTTP 200 한 건 |
| P12-R02 | Critical | data·secret가 public 경계 안에 있음 | platform | M2 | canonical overlap |
| P12-R03 | High | 노출 가능 구 session secret 유지 | auth | M2 | rotation 후 구 token 성공 |
| P12-R04 | High | 대입·과대 요청·저장 고갈 | server | M3 | limit 초과 false success |
| P12-R05 | High | 승인과 실제 rev 불일치 | project | M4 | 없는 rev release 또는 stale current |
| P12-R06 | High | 패키지에 private 파일 포함 | release | M5 | forbidden scan 한 건 |
| P12-R07 | High | Windows gate 거짓 실패·거짓 성공 | verification | M6 | 미실행을 PASS 처리 |
| P12-R08 | High | local evidence로 LAN·design transfer 오인 | release | M7 | 근거 없는 claim true |

Critical/High가 열려 있으면 의존 마일스톤과 release를 차단한다.

