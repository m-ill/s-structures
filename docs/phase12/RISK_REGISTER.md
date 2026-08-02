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

## P12-M7 최종 감사

| ID | 통제 판정 | 잔여 위험 |
| --- | --- | --- |
| P12-R01 | closed-by-control | public allowlist의 변경은 release scan과 함께 검토해야 함 |
| P12-R02 | closed-by-control | 운영자가 외부 data/secrets 경로와 backup을 유지해야 함 |
| P12-R03 | closed-by-control | key rotation 시 모든 기존 session이 무효화됨 |
| P12-R04 | closed-by-control | 단일 PC 기본 예산이며 LAN·public 부하 자격은 없음 |
| P12-R05 | closed-by-control | 법적 전자서명·다중 승인 workflow는 비범위 |
| P12-R06 | closed-by-control | portable ZIP만 자격 취득, installer·코드서명은 비범위 |
| P12-R07 | closed-by-control | Windows 기준 환경만 검증, 다른 OS는 별도 evidence 필요 |
| P12-R08 | claim-limited | local pilot만 true; LAN·public·design transfer는 false 유지 |

최종 코드리뷰의 open Critical/High finding은 0건이다. `closed-by-control`은 기능을 무제한 제품 승인으로
승격한다는 뜻이 아니며, 오른쪽 잔여 위험과 release profile 제한을 계속 적용한다.
