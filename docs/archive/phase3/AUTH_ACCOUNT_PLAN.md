# Phase 3 Auth And Account Plan

status: active
milestone: P3-M2

## Scope

email+password 계정, 서명 토큰 세션, 역할 기반 프로젝트 권한. 외부 IdP(OAuth)는 출시 후 확장 후보 (출시 범위 아님).

## Account Model

```js
// data/users.json 항목
{
  id: 'uuid',
  email: 'lowercase-normalized',
  name: 'display name',
  scrypt: 'hex',            // scrypt(password, salt)
  salt: 'hex(16B random)',
  createdAt: 'ISO8601',
  role: 'user' | 'admin',   // 서버 전역 역할 (admin: 사용자 관리)
  locked: false,
  failedLogins: 0,
}
```

## Password Policy

| 항목 | 규칙 |
| --- | --- |
| 해시 | `node:crypto.scryptSync(password, salt, 64, { N: 2**15, r: 8, p: 1 })` |
| 비교 | `crypto.timingSafeEqual` |
| 최소 길이 | 10자 |
| 잠금 | 연속 실패 10회 → 15분 잠금 (P3-T12) |
| 재설정 | v1: admin이 임시 비밀번호 발급. self-service 메일 재설정은 출시 후 |

Login failure responses keep the common error envelope. `UNAUTHORIZED` includes
`details.reason = INVALID_CREDENTIALS` or `LOCKED` so UI and AI agents can
distinguish normal password failure from temporary account lockout without
parsing message text.

## Session Token

stateless HMAC 서명 토큰. 외부 JWT 라이브러리 없이 node:crypto로 구현한다.

```text
token = base64url(payload) + '.' + base64url(HMAC-SHA256(secret, payload))
payload = { uid, iat, exp, ver }
```

| 항목 | 규칙 |
| --- | --- |
| secret | 서버 최초 부팅 시 생성해 `data/secret.key` 저장 (git 제외) |
| 만료 | 12시간. 만료 30분 전 요청 시 응답 헤더로 갱신 토큰 제공 |
| 무효화 | `ver` 필드: 사용자별 tokenVersion. 비밀번호 변경/강제 로그아웃 시 +1 |
| 저장(클라이언트) | `localStorage`. XSS 방어는 CSP로 보강 (아래) |

## Roles And Permissions

전역 역할(user/admin)과 프로젝트 역할을 분리한다.

| 프로젝트 역할 | 권한 |
| --- | --- |
| owner | 모든 권한 + 멤버 관리 + 프로젝트 삭제 |
| engineer | 모델 저장, 파일 업로드, import 확정 |
| reviewer | 읽기 + issue resolve/accept + 승인/해제 |
| viewer | 읽기 전용 |

가드 체인: `authenticate(token) → loadProject → requireRole(minRole)`. 라우트 선언에 최소 역할을 명시한다 (`SERVER_API_PLAN.md` 권한 열과 일치).

## Security Checklist

| 항목 | 조치 |
| --- | --- |
| 전송 보안 | 배포 시 리버스 프록시 TLS 필수. 서버는 `x-forwarded-proto` 확인 옵션 |
| CSP | `default-src 'self'` 기준. inline script 제거는 app shell 설계에 반영 |
| CORS | 동일 출처 기본. 외부 origin 불허 |
| 입력 검증 | email 형식, JSON 스키마, 문자열 길이 제한 |
| 업로드 | 확장자 allowlist, 크기 제한, 파일명 치환 (`SERVER_API_PLAN.md`) |
| path traversal | store 계층에서 id 형식 검증 (`uuid`만 허용) |
| rate limit | IP+계정 기준 로그인 시도 제한 |
| 로깅 | 인증 실패, 권한 거부, 승인 변경은 감사 로그(`data/audit.log`) |
| 비밀 정보 | secret/해시는 응답에 절대 미포함. user 직렬화 whitelist 방식 |

## Client Flow

```text
app.html 로드
  -> localStorage 토큰 확인
  -> 있으면 GET /api/auth/me 검증 -> projects 화면
  -> 없거나 401 -> login 화면
로그인 성공 -> 토큰 저장 -> 이전 라우트 복귀
401 수신(만료) -> 토큰 폐기 -> login 화면 + '세션 만료' 안내
```

오프라인/서버 없음 모드: 서버 접속 실패 시 local-only 모드로 진입 가능 (저장 3계층 중 local/파일만 활성, `PERSISTENCE_PLAN.md`). 데스크톱(Electron) 배포에서는 내장 서버가 항상 로컬에서 뜨므로 동일 흐름을 유지한다.

## Tests

`tests/p3-auth.mjs`:

1. scrypt 해시/검증, timingSafeEqual 경로.
2. 토큰 발급→검증→만료→위조 서명 거부.
3. tokenVersion 증가 시 기존 토큰 무효.
4. 역할별 접근 매트릭스 (owner/engineer/reviewer/viewer × 주요 라우트).
5. 로그인 잠금 시나리오.
