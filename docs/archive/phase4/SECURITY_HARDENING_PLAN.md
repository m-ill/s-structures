# Phase 4 Security Hardening Plan

status: active
scope: P4-M5 (WP-05), 출시 전 재점검은 P4-M11

## Threat Model (경량)

| 자산 | 위협 | 현재 방어 | 잔여 위험 → 조치 |
| --- | --- | --- | --- |
| 계정 자격증명 | 무차별 대입, 병렬 우회 | scrypt, 실패 잠금 | TD-05 race로 잠금 우회 → 락 직렬화 (P4-T24) |
| 세션 토큰 | 위조, 탈취 재사용 | HMAC 서명, 만료, tokenVersion 무효화 | localStorage 탈취는 XSS 방어에 의존 → CSP 강화 (아래) |
| 프로젝트 데이터 | 비인가 접근 | 역할 4단계, 비멤버 404 | TD-03/04 신규 라우트 누락 위험 → 라우트 인증 선언화 (P4-T23) |
| 업로드 파일 | stored-XSS, 위장 타입 | 확장자 allowlist, 파일명 치환, attachment | TD-02 Content-Type 반사 → octet-stream 강제+nosniff (P4-T22) |
| 저장소 무결성 | 동시 프로세스 손상 | 프로세스 내 락, 원자적 쓰기 | TD-06 → dataDir lockfile (P4-T25) |
| 서버 프로세스 | 악성 입력 크래시 | BAD_URI 계약, 크기 제한, JSON 검증 | fuzz 커버리지 부족 → 점군/DXF fuzz (P4-T20) |
| 감사 추적 | 부인, 침해 조사 불가 | 승인 이력 일부 | 감사 로그 부재 → audit.log (P4-T28) |

## Hardening Checklist (P4-M5 exit)

각 항목은 테스트 또는 증빙 경로가 있어야 완료다.

| # | 항목 | 검증 |
| --- | --- | --- |
| S1 | 다운로드 Content-Type: 저장 시 allowlist 정규화, 응답 `X-Content-Type-Options: nosniff` | `tests/p4-security-headers.mjs` |
| S2 | 라우트 role 선언 강제: `/api/projects/:id/*` 패턴에 role 미선언 시 계약 테스트 실패 | 라우트 계약 테스트 확장 |
| S3 | role enum 검증: 미정의 role 문자열은 등록 시점 throw | 단위 테스트 |
| S4 | userStore read-modify-write 직렬화 | 병렬 race 테스트 |
| S5 | dataDir lockfile: PID+타임스탬프, stale lock 감지·회수 | 2중 기동 거부 테스트 |
| S6 | CSP 헤더: app.html/index.html 서빙 시 `default-src 'self'` (inline script 제거 확인) | 응답 헤더 테스트 + 브라우저 동작 확인 |
| S7 | 감사 로그: 로그인 실패, 권한 거부, 승인 변경, 멤버 변경 append-only 기록 | 감사 이벤트 테스트 |
| S8 | 오류 응답에 스택/내부 경로 미노출 | error envelope 스냅샷 테스트 |
| S9 | 업로드 크기·요청 크기 제한 동작 재확인 (기존) | 기존 테스트 유지 |
| S10 | 정적 서빙 단일화 (serve.mjs 제거) 후 traversal 가드 재확인 | 기존 traversal 테스트 + 삭제 확인 |
| S11 | secret.key 파일 권한 안내 + 응답 직렬화 whitelist 재감사 (scrypt/salt 미노출) | grep 감사 + 테스트 |
| S12 | TLS 종단 가이드 (리버스 프록시) runbook 수록 + `x-forwarded-proto` 옵션 | runbook 문서 |

## Release Re-check (P4-M11)

출시 직전 S1~S12 전체 재실행 + 다음 추가:

1. `data/` 백업본에 비밀정보 포함 여부 점검 (secret.key 분리 백업 정책).
2. 의존성 감사 — Electron 도입 시(P4-T41) lockfile 고정·서명 확인, 그 외 zero-dep 유지 확인.
3. 침투 스모크: 비인증 전 라우트 스캔 스크립트 (`tools/security-scan.mjs` 신규)로 401/403/404 매트릭스 자동 확인.
