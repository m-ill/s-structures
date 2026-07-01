# Phase 3 Development File Map

status: active

Phase 2 지도(`docs/phase2/DEVELOPMENT_FILE_MAP.md`)를 계승한다. 여기는 Phase 3 신규/변경 위치만 기록한다.

## New Top-Level

| 위치 | 역할 | git |
| --- | --- | --- |
| `server/` | node 서버 (라우터/auth/store) | 추적 |
| `app.html` | 앱 shell 엔트리 (로그인/프로젝트) | 추적 |
| `data/` | 서버 런타임 데이터 (users, projects, uploads) | **제외** (.gitignore) |

## New Source Folders

| 폴더 | 역할 | 주요 문서 |
| --- | --- | --- |
| `src/app/` | shell, 라우팅, API client, 화면(views/) | `FRONTEND_PLAN.md` |
| `src/viewer/` | WebGL2 점군/모델 뷰어 | `FRONTEND_PLAN.md` |
| `src/import/` | 공통 기하 유틸, ImportCandidate 계약 | `IMPORT_DXF_DWG_PLAN.md` |
| `src/import/dxf/` | DXF 파서, entity 매핑, layer/평면 인식 | 〃 |
| `src/import/dwg/` | ODA 변환 어댑터 | 〃 |
| `src/import/pointcloud/` | 로더, voxel/RANSAC/DBSCAN, worker | `IMPORT_POINT_CLOUD_PLAN.md` |
| `src/materials/` | 재료/단면 registry, KS DB, 특성 계산 | `MATERIAL_SECTION_LIBRARY_PLAN.md` |
| `src/nonlinear/` | 정식 비선형 (state/elements/hinges/control) | `NONLINEAR_ENGINE_PLAN.md` |
| `src/standards/` | (P2 예정 계승) 기준식 registry 상세화 시 | `../phase2/STANDARD_ENGINE_PLAN.md` |

## Server Layout

```text
server/
  main.mjs        # 엔트리
  config.mjs      # 포트/제한/경로 (env override)
  router.mjs      # 매칭 + guard + error envelope
  routes/         # auth, projects, revisions, files, imports, approval
  auth/           # password.mjs, token.mjs, guard.mjs
  store/          # fileStore.mjs, userStore.mjs, projectStore.mjs
```

## Test And Fixture Layout

| 위치 | 내용 |
| --- | --- |
| `tests/p3-*.mjs` | Phase 3 테스트 (`QA_RELEASE_PLAN.md` 목록) |
| `tests/fixtures/dxf/` | 소형 ASCII DXF fixture |
| `tests/fixtures/pointcloud/` | 소형 점군 + ground-truth JSON |
| `tools/generate-dxf-fixtures.mjs` | 대표건물 → DXF 역생성 |
| `tools/generate-synthetic-pointcloud.mjs` | 대표건물 → 합성 점군 |
| `tools/convert-dwg.mjs` | ODA CLI 어댑터 |

## Change Routing (Phase 3 추가분)

| 하려는 작업 | 먼저 볼 파일 |
| --- | --- |
| API 추가/변경 | `docs/phase3/SERVER_API_PLAN.md`, `server/routes/`, `tests/p3-server-api.mjs` |
| 권한 규칙 변경 | `server/auth/guard.mjs`, `AUTH_ACCOUNT_PLAN.md` 매트릭스 |
| 저장 형식 변경 | `PERSISTENCE_PLAN.md` envelope, `src/core/migration.js` |
| DXF entity 추가 | `src/import/dxf/entities.js`, fixture 추가 |
| 점군 검출 개선 | `src/import/pointcloud/`, 합성 벤치마크 재실행 |
| 재료/단면 필드 추가 | `src/materials/*Schema.js`, registry, 계산서 재료 장 |
| 비선형 요소/힌지 | `src/nonlinear/`, benchmark gate 등록 |
| 새 화면/action | `src/app/views/`, `src/ui/agentManifest.js`, `agent-contract.json` |

## Repository Hygiene

| 항목 | 규칙 |
| --- | --- |
| `data/`, `*.log`, 업로드 원본 | git 추적 제외 |
| 대형 점군/도면 | 커밋 금지. 생성기 또는 외부 보관 |
| 상위 `dcr/` 참고자료 (`_app`, `_asar_*`, `_extract`, `DCR-Setup.exe`, `restored-dcr`, `일본구조계산프로그램output`) | 소스 아님. 분석 근거로 필요하면 별도 archive 폴더/드라이브로 이동 권장. 저장소 안으로 복사 금지 |
| 생성 보고서 | `reports/` (기존 규칙 유지) |
