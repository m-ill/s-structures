# WP-05 플랫폼/보안 강화

stage: H / milestone: P4-M5 / tickets: P4-T22~T28 / 크기: M
status: in-progress

## Objective

`TECH_DEBT_REGISTER.md`의 서버 측 부채(TD-02~06, 09, 12, 13)를 상환하고 `SECURITY_HARDENING_PLAN.md` S1~S12를 완료한다. 독립 작업 — 다른 WP와 병렬 가능하며, 이후 작업(패키징)의 기반이므로 조기 착수 권장.

## Scope

**In**: 보안 헤더, 라우트 인증 선언화, 저장소 락, 감사 로그, 정적 서빙 단일화.
**Out**: 성능 최적화(WP-06), 클라이언트 측 부채(WP-07), 새 API.

## Work Breakdown

### Step 1. 라우트 인증 선언화 (T23 — 구조 변경이므로 최우선)
1. `server/router.mjs`: 라우트 옵션에 `auth: { role: 'viewer'|'reviewer'|'engineer'|'owner', project: true }` 추가. 등록 시점에 role enum 검증 (미정의 문자열 throw — TD-04).
2. `server/main.mjs` handleApi: auth 옵션이 있으면 authenticate→requireProjectRole을 핸들러 진입 전 자동 수행, `req.user`/`req.projectRole`로 전달.
3. `server/routes/*.mjs` 17개 핸들러에서 수동 2-step 제거 — 선언으로 이전.
4. 계약 테스트 확장: `/api/projects/` 프리픽스 라우트 중 auth 선언 없는 것이 있으면 실패 (`tests/p3-server-route-contract.mjs` 강화). auth 예외 라우트(health/meta/auth/*)는 명시적 allowlist.

### Step 2. 파일 응답 보안 (T22)
1. 업로드 저장 시 contentType을 확장자 기반 allowlist로 정규화 (미지 타입 → `application/octet-stream`).
2. 다운로드 응답에 `X-Content-Type-Options: nosniff` 상시 부착. HTML/SVG 계열은 강제 octet-stream.
3. `tests/p4-security-headers.mjs`: text/html 업로드 → 다운로드 시 렌더 불가 타입 확인.

### Step 3. 저장소 견고화 (T24, T25, T27)
1. TD-05: `userStore`의 read-modify-write 전체를 fileStore의 withLock(users.json 경로)으로 감싸 직렬화. 병렬 실패 로그인 race 테스트 (동시 10요청 → failedLogins 정확히 10).
2. TD-06: `server/store/lockfile.mjs` 신규 — 기동 시 `data/server.lock`(PID+timestamp) 생성, 존재 시 프로세스 생존 확인 후 stale이면 회수, 살아있으면 명확한 오류로 기동 거부. 종료 훅에서 제거.
3. TD-12: approval 라우트 get() 결과 null 재확인 → 404. TD-13: `(latest?.rev ?? 0) + 1`.

### Step 4. 감사 로그 (T28)
1. `server/store/auditLog.mjs`: append-only JSONL (`data/audit.log`) — 이벤트: login-failed, forbidden, approval-changed, member-changed, logout-all.
2. 가드/라우트에 후킹. 실패가 요청을 막지 않도록 fire-and-forget + 오류 시 콘솔 경고.
3. 기록 테스트 + 민감정보(비밀번호·토큰) 미포함 grep 감사.

### Step 5. 정적 서빙 단일화 (T26)
1. `tools/serve.mjs` 삭제, `npm run dev`를 `node server/main.mjs`로 변경 (PORT 5173 유지 옵션).
2. traversal 가드 테스트가 server/main.mjs 경로로만 존재함을 확인. `.claude/launch.json`·문서의 참조 갱신.

### Step 6. 마감
S1~S12 체크리스트 전수 확인 표를 SECURITY 문서에 기입. TD 레지스터 상태 갱신(fixed+커밋 해시). full suite green.

## Deliverables

라우터 인증 선언 구조 / lockfile·감사 로그 모듈 / `tests/p4-security-headers.mjs` 외 신규 테스트 / serve.mjs 제거 / TD 8건 fixed.

## Acceptance Criteria

1. 라우트 계약 테스트가 "미선언 라우트"를 구조적으로 거부.
2. 신규·기존 테스트 전부 green (기존 p3-server-api / p3-auth 무수정 통과가 목표 — 응답 계약 불변).
3. TD-02~06, 09, 12, 13 = fixed. S1~S12 체크 완료.

## Verification Procedure

`npm test` + 2중 기동 수동 확인 + text/html 업로드 브라우저 확인 1회.

## Risks & Rollback

인증 선언화는 전 라우트를 건드림 — 단계 커밋(라우터 확장 → 파일별 이전 → 수동 코드 제거)으로 진행, 각 단계 full suite. 실패 시 파일 단위 revert 가능.

## Result

2026-07-03 P4-T22 / S1:

- Download responses now force a safe content type allowlist and include `X-Content-Type-Options: nosniff`.
- Risky stored content types such as `text/html` are returned as `application/octet-stream`.
- Added `tests/p4-security-headers.mjs` and wired it into `npm test` as `test:m92`.

(완료 시 기입)
2026-07-03 P4-T23 / S2-S3:

- `server/router.mjs` now stores route auth metadata and rejects invalid route role strings at registration time.
- Project-scoped routes now declare `auth: { project: true, role }`; project list/create routes declare user auth.
- `requireProjectRole()` now rejects misconfigured role names instead of treating unknown roles as rank 0.
- `tests/p3-server-route-contract.mjs` verifies project route auth metadata and role enum failures.

2026-07-03 P4-T24 / S4:

- `fileStore.withLock()` is now reusable for read-modify-write critical sections.
- `userStore.verifyCredentials()` serializes failed-login counter updates for each `users.json`.
- `tests/p3-auth.mjs` now covers 10 concurrent failed logins and verifies lockout is not bypassed.

2026-07-03 P4-T25 / TD-06:

- Added `server/store/lockfile.mjs` with `data/server.lock` PID, timestamp, and heartbeat ownership.
- `server/main.mjs` now uses `startServer()` to acquire the data directory lock for real server startup.
- Stale lock files are reclaimed; live duplicate startup fails with a clear data directory lock error.
- Added `tests/p4-data-dir-lock.mjs` and wired it into `npm test` as `test:m93`.

2026-07-03 P4-T26 / TD-09:

- Removed the legacy `tools/serve.mjs` static server.
- `npm run dev` and `npm run dev:public` now launch `server/main.mjs` with port 5173.
- `tests/m17-e2e-entrypoint.mjs` now boots the same server entrypoint used by production and dev.

2026-07-03 P4-T27 / TD-12-TD-13:

- Approval GET/POST routes now re-check missing projects after role/list operations and return 404.
- Revision numbering now uses `(latest?.rev ?? 0) + 1`.
- Added `tests/p4-approval-route-guards.mjs` and wired it into `npm test` as `test:m94`.
