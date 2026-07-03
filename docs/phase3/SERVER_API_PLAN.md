# Phase 3 Server API Plan

status: active
milestones: P3-M1, P3-M2

## Principles

1. node:http + 자체 라우터. 외부 프레임워크 없음 (ARCHITECTURE D2).
2. 서버는 계정/저장/파일/협업만 담당. 해석은 브라우저.
3. 모든 응답은 JSON. 오류는 공통 envelope.
4. API 변경 시 이 문서와 계약 테스트를 같이 갱신한다.

## Conventions

| 항목 | 규칙 |
| --- | --- |
| Base path | `/api` |
| 인증 | `Authorization: Bearer <token>` (`AUTH_ACCOUNT_PLAN.md`) |
| 성공 | `{ ok: true, data: ... }` |
| 오류 | `{ ok: false, error: { code, message, details? } }` + HTTP status |
| 오류 코드 | `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION`, `CONFLICT`, `PAYLOAD_TOO_LARGE`, `RATE_LIMITED`, `INTERNAL` |
| ID | `crypto.randomUUID()` |
| 본문 제한 | JSON 20MB, 파일 업로드 500MB (설정 가능) |

## Endpoints

### Auth (`server/routes/auth.mjs`)

| Method | Path | Body | 응답 | 권한 |
| --- | --- | --- | --- | --- |
| POST | `/api/auth/register` | `{ email, password, name }` | `{ user }` | 공개 (설정으로 초대제 전환 가능) |
| POST | `/api/auth/login` | `{ email, password }` | `{ token, expiresAt, user }` | 공개 |
| POST | `/api/auth/logout` | - | `{ ok }` | 로그인 |
| GET | `/api/auth/me` | - | `{ user }` | 로그인 |

### Projects (`server/routes/projects.mjs`)

| Method | Path | 설명 | 권한 |
| --- | --- | --- | --- |
| GET | `/api/projects` | 내가 멤버인 프로젝트 목록 | 로그인 |
| POST | `/api/projects` | 생성 `{ name, description? }` | 로그인 (생성자=owner) |
| GET | `/api/projects/:id` | 메타 + 멤버 + 최신 revision 요약 | member |
| PATCH | `/api/projects/:id` | 이름/설명/상태 수정 | owner |
| DELETE | `/api/projects/:id` | soft delete | owner |
| PUT | `/api/projects/:id/members/:userId` | 역할 부여 `{ role }` | owner |
| DELETE | `/api/projects/:id/members/:userId` | 멤버 제거 | owner |

### Revisions — 모델 저장 (`server/routes/revisions.mjs`)

| Method | Path | 설명 | 권한 |
| --- | --- | --- | --- |
| GET | `/api/projects/:id/revisions` | 목록 (메타만: rev, author, savedAt, note, schemaVersion, parentRev) | member |
| POST | `/api/projects/:id/revisions` | snapshot 저장 `{ model, note?, parentRev? }` | engineer+ |
| GET | `/api/projects/:id/revisions/:rev` | snapshot 본문 | member |

서버는 model 본문을 해석하지 않는다. 검증은 `schemaVersion` 존재, JSON 형식, 크기 제한만. `parentRev`가 최신 rev와 다르면 저장은 허용하되 응답에 `lineageWarning: true` (PERSISTENCE M3-4).

### Files — 도면/점군 업로드 (`server/routes/files.mjs`)

| Method | Path | 설명 | 권한 |
| --- | --- | --- | --- |
| GET | `/api/projects/:id/files` | 목록 | member |
| POST | `/api/projects/:id/files` | 업로드. raw body + 헤더 `x-file-name`, `content-type` | engineer+ |
| GET | `/api/projects/:id/files/:fileId` | 다운로드 | member |
| DELETE | `/api/projects/:id/files/:fileId` | 삭제 | engineer+ |

허용 확장자 allowlist: `.dxf .dwg .ply .xyz .txt .pcd .las .json`. 파일명은 저장 시 `<fileId>.<ext>`로 치환 (path traversal 차단). 원본 이름은 메타에 보존.

### Import candidates (`server/routes/imports.mjs`)

import 처리 자체는 브라우저(worker)에서 수행하고, 확정 전 후보와 audit을 서버에 보존해 검토 이력을 남긴다.

| Method | Path | 설명 | 권한 |
| --- | --- | --- | --- |
| POST | `/api/projects/:id/imports` | 후보 저장 `{ fileId, candidate, audit }` | engineer+ |
| GET | `/api/projects/:id/imports` | 목록 | member |
| GET | `/api/projects/:id/imports/:importId` | 후보 본문 | member |
| PATCH | `/api/projects/:id/imports/:importId` | 검토 상태 갱신 `{ status: 'confirmed'\|'rejected', resolvedCandidate? }` | engineer+ |

### Evidence register (`server/routes/evidence.mjs`)

Phase 3 field, engineering, and owner evidence is stored at project scope so AI agents can inspect whether real drawing, point-cloud, engineering, and launch sign-off records have been attached.

| Method | Path | Description | Permission |
| --- | --- | --- | --- |
| GET | `/api/projects/:id/evidence` | list evidence rows plus `getPhase3EvidenceRegister` summary, `finalApprovals`, `finalApprovalReview` approval-group status, and `ownerSignoffReview` derived from explicit final approval rows | viewer+ |
| POST | `/api/projects/:id/evidence` | append evidence row `{ id, type?, accepted?, status?, reportPath?, finalApprovalField?, approved? }` and return updated register/final approvals/final approval review/owner sign-off review | engineer+ |

### Workflow — 승인 (P3-M13, T61)

| Method | Path | 설명 | 권한 |
| --- | --- | --- | --- |
| POST | `/api/projects/:id/approval` | `{ state: 'approved'\|'released', rev }` | reviewer+ |
| GET | `/api/projects/:id/approval` | 현재 승인 상태 | member |

승인된 rev 이후 새 revision 저장 시 승인 상태를 자동 해제하고 이력에 남긴다 (P2 T45 이행).

### Project Library (`server/routes/libraries.mjs`)

M10 material/section library project-scope storage path. Analysis still runs in the browser, but collaborative project material and section records are stored in the same server project store.

| Method | Path | Description | Permission |
| --- | --- | --- | --- |
| GET | `/api/projects/:id/library/:kind` | list `materials` or `sections` | viewer+ |
| GET | `/api/projects/:id/library/:kind/:itemId` | read one `id@version` item, with optional `?version=` | viewer+ |
| PUT | `/api/projects/:id/library/:kind/:itemId` | upsert project-scope material or section | engineer+ |

### Health/Meta

| Method | Path | 설명 |
| --- | --- | --- |
| GET | `/api/health` | `{ ok, version, uptime }` |
| GET | `/api/meta` | 서버 계약 버전, 제한값 (클라이언트 표시용) |

## Storage Layout (v1 파일 기반)

```text
data/
  users.json                     # [{ id, email, name, scrypt, salt, createdAt, role }]
  sessions/                      # (옵션) 토큰 무효화 blacklist
  projects/
    <projectId>/
      project.json               # 메타 + members + approval
      revisions/
        index.json               # revision 메타 목록
        <rev>.json               # model snapshot
      files/
        index.json               # 파일 메타
        <fileId>.<ext>
      imports/
        <importId>.json
      evidence/
        index.json               # Phase 3 field/engineering/owner evidence rows
```

쓰기는 write-to-temp + rename으로 원자성 확보. `users.json`과 `index.json`은 프로세스 내 mutex(Promise chain)로 직렬화. 동시성 요구가 커지면 SQLite 승격 (ARCHITECTURE D5).

## Static Serving

`/` → `app.html` (shell), `/modeler` → `index.html`, `/src/*` → ESM 소스 그대로 서빙 (무빌드 유지). MIME 테이블은 기존 `tools/serve.mjs`에서 이관.

## Server Structure

```text
server/main.mjs      # 부트스트랩: config, store 초기화, listen
server/config.mjs    # 포트, 제한값, data 경로, 초대제 여부 (환경변수 override)
server/router.mjs    # 매칭 + guard 체인 + error envelope
server/routes/*.mjs  # 핸들러 (얇게 유지, 로직은 store/auth로)
server/auth/*.mjs    # password(scrypt), token(HMAC), guard(role)
server/store/*.mjs   # 파일 저장소 (원자적 쓰기, 직렬화)
```

## Contract Tests

`tests/p3-server-api.mjs`: 서버를 임시 `data/` 경로로 부팅해 실제 HTTP 호출로 검증한다.

1. register→login→me→logout 흐름.
2. 토큰 없음/위조/만료 → 401.
3. 비멤버 프로젝트 접근 → 403.
4. 프로젝트 CRUD + revision round-trip (10MB).
5. 파일 업로드 allowlist/크기 제한/traversal 차단.
6. lineage warning 시나리오.
7. error envelope 스키마 일관성.
