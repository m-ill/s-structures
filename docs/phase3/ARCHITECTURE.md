# Phase 3 System Architecture

status: active
source: user direction 2026-07-02

## System Overview

```text
+--------------------------- Browser ----------------------------+
| src/app/  앱 shell (login, projects, routing)                   |
| src/ui/   모델러/리본/결과 패널 (기존)                            |
| src/viewer/  WebGL2 점군+모델 뷰어                               |
| src/import/  DXF 파서, 점군 파이프라인 (Web Worker)              |
| src/core|solver|design|... 해석 엔진 (기존, 브라우저 내 실행)      |
+--------------------------------|--------------------------------+
                                 | fetch (REST, bearer token)
+--------------------------- Node Server ------------------------+
| server/http.mjs      라우터 + 정적 서빙 (node:http)              |
| server/routes/       auth, projects, revisions, files, imports  |
| server/store/        파일 기반 저장 v1 (data/)                   |
| server/auth/         scrypt, HMAC token                         |
+--------------------------------|--------------------------------+
                                 |
                          data/  (git 제외)
                          users.json, projects/<id>/...
```

핵심 구조 결정: **해석 엔진은 브라우저에서 실행을 유지**한다. 서버는 계정/저장/파일/협업만 담당한다. 이 결정으로 기존 코드와 agent 계약을 그대로 유지하고, 서버 비용과 복잡도를 최소화한다. 서버측 해석(대규모 배치)은 출시 후 확장 후보로만 남긴다 (Phase 4 없음 — 출시 범위 아님을 의미).

## Technology Decisions

| # | 결정 | 선택 | 근거 | 대안(기각 사유) |
| --- | --- | --- | --- | --- |
| D1 | 언어 | JavaScript ESM 유지 | 기존 코드베이스 전체가 vanilla ESM, 무빌드 | TypeScript 전환(전환 비용이 Phase 3 일정 침식) |
| D2 | 서버 프레임워크 | node:http + 자체 라우터 | zero-dependency 정책, `tools/serve.mjs` 확장 경험 | Express/Fastify(의존성, 현 규모에 과함) |
| D3 | 비밀번호 해시 | node:crypto scrypt | 내장, 검증된 KDF | bcrypt/argon2(외부 native 의존성) |
| D4 | 세션 | HMAC-SHA256 서명 토큰 (node:crypto) | 내장으로 충분, stateless | JWT 라이브러리(불필요), 서버 세션(파일 저장 복잡) |
| D5 | 저장 v1 | 파일 기반 JSON + blob (`data/`) | 단순, 백업 용이, 단일 사무소 규모 충분 | SQLite(better-sqlite3) — 동시성 요구 시 v2로 승격 |
| D6 | 점군/모델 뷰어 | 자체 WebGL2 모듈 | gl.POINTS 렌더는 단순, 의존성 없음 | three.js(기능 과잉; 셰이딩 요구 커지면 재검토) |
| D7 | DXF | 자체 ASCII DXF 파서 | 포맷 공개, 필요 entity 한정적 | 외부 파서 라이브러리(의존성/제어) |
| D8 | DWG | ODA File Converter 외부 CLI 호출 | DWG는 사유 포맷, 직접 파싱 비현실적 | LibreDWG wasm(성숙도 검토 후 v2 후보) |
| D9 | 무거운 전처리 | Web Worker + Transferable(Float32Array) | 메인스레드 무블로킹 NFR | 서버 처리(업로드 왕복 비용, 오프라인 불가) |
| D10 | 데스크톱 배포 | Electron 래핑 (M20에서 확정) | 사무소 오프라인/파일 접근 요구 | Tauri(러스트 체인 도입 부담) |

의존성 도입이 필요해지면 이 표에 행을 추가하고 근거를 남긴다.

## Module Boundaries

| 경계 | 규칙 |
| --- | --- |
| `server/` ↔ `src/` | server는 `src/core/schema.js`, `src/core/migration.js`만 import 가능 (모델 검증용). 해석 코드 import 금지 |
| `src/app/` ↔ `src/ui/` | app shell이 ui 모듈을 마운트. ui는 app을 모름 |
| `src/import/` → `src/core/` | importer는 표준 후보 계약(`ImportCandidate`)만 출력. 모델 확정은 core factory 경유 |
| `src/viewer/` | 렌더 전용. 모델 변경 금지 (읽기 + 선택 이벤트만) |
| `src/nonlinear/` → `src/solver/` | 요소/조립 재사용, 상태 관리는 nonlinear 내부 |

## Data Flow Contracts

### Import 공통 계약 (M5-4)

```js
// importer 출력 표준 — DXF/DWG/pointcloud 공통
{
  version: 'p3-import-candidate',
  source: { type: 'dxf'|'dwg'|'pointcloud', fileId, units, transform },
  candidates: {
    stories: [{ z, height, confidence, evidence }],
    grids:   [{ axis, label, position, confidence }],
    nodes:   [{ x, y, z, confidence }],
    members: [{ from, to, kind: 'column'|'beam'|'brace'|'wall',
                sectionHint, layerOrCluster, confidence }],
  },
  audit: { counts, unmapped, warnings, unitSuspicion, bbox },
}
```

human-in-loop 확정 후에만 `modelFactory`를 거쳐 실제 model이 된다. 확정 전 후보는 저장하되 model로 취급하지 않는다.

### 서버 저장 계약

모델 snapshot은 기존 `modelToJson` 결과를 그대로 저장한다. 서버는 내용을 해석하지 않고 `schemaVersion` 확인과 크기/형식 검증만 한다. 마이그레이션은 항상 클라이언트 로드 시점에 수행한다 (`src/core/migration.js` 단일 경로 유지).

## Directory Layout (Target)

```text
s-structures-review/
  index.html            # 모델러 (app shell이 로드)
  app.html              # (신규) 앱 shell 엔트리 — 로그인/프로젝트
  server/
    main.mjs            # 서버 엔트리
    router.mjs          # 경로→핸들러
    routes/             # auth.mjs, projects.mjs, revisions.mjs, files.mjs, imports.mjs
    auth/               # password.mjs(scrypt), token.mjs(HMAC), guard.mjs
    store/              # fileStore.mjs, userStore.mjs, projectStore.mjs
  src/
    app/                # shell, 라우팅, 프로젝트 브라우저, API client
    viewer/             # WebGL2 점군/모델 뷰어
    import/
      dxf/              # 파서, entity 매핑, layer mapping
      dwg/              # 변환기 어댑터
      pointcloud/       # 로더, downsample, 검출(RANSAC/클러스터), worker
      candidate.js      # 공통 후보 계약
    materials/          # 커스텀 재료/단면 registry
    nonlinear/          # 정식 비선형 (state, elements, hinges, fiber, control, dynamics)
    solver/shell/       # 쉘 요소 (M12)
    design/rc|steel|connection|foundation/  # 상세 설계 모듈 (M17-M18)
    standards/          # KDS 기준식 registry
    (core|solver|design|results|report|platform|ui|examples|verification 기존 유지)
  data/                 # 서버 런타임 (git 제외)
  tests/fixtures/dxf/   # 소형 DXF fixture
  tests/fixtures/pointcloud/  # 합성 점군 생성 스크립트 + 소형 fixture
```

## Deployment

| 형태 | 구성 | 시점 |
| --- | --- | --- |
| 개발 | `node server/main.mjs` → localhost, `data/` 로컬 | M1부터 |
| 사무소 배포(웹) | 단일 node 프로세스 + 리버스 프록시(TLS) | M20 |
| 데스크톱 | Electron: 내장 서버 모드(로컬 data/) | M20 결정 |

## Risks

| 위험 | 완화 |
| --- | --- |
| DWG 변환기 미설치 환경 | DXF export 안내 UX를 1급 경로로 설계 |
| 점군 인식 정확도가 실측에서 저하 | 합성+실측 이중 벤치마크, human-in-loop을 필수 단계로 |
| 비선형 수렴 실패 UX | 수렴 로그/실패 사유를 결과 계약에 포함, 계산서에 표기 |
| 파일 저장 동시성 | v1 last-write-wins + lineage warning, 필요 시 SQLite 승격(D5) |
| zero-dependency 한계 | 결정 표(D1-D10)에 근거 기록 후 도입 허용 |
