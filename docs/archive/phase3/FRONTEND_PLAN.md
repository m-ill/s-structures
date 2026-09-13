# Phase 3 Frontend Plan

status: active
milestones: P3-M4, 검토 UI는 P3-M7/M9

## Principles

1. vanilla ESM + 무빌드 유지. 프레임워크 도입 없음.
2. 기존 `index.html` 모델러는 그대로 살리고, 앱 shell이 감싼다.
3. 새 화면의 모든 사용자 action은 agent capability manifest에 등록한다 (P2 계약 유지).
4. inline script 금지 (CSP 대응, `AUTH_ACCOUNT_PLAN.md`).

## App Shell (`app.html` + `src/app/`)

```text
#/login                 로그인/가입
#/projects              프로젝트 브라우저
#/p/:id/modeler         모델러 (기존 index 모듈 마운트)
#/p/:id/import/:jobId   import 검토 화면
#/p/:id/revisions       revision 목록/복원
#/p/:id/report          계산서/검토
local (서버 미접속)      #/local/modeler — L1/L2 저장만 활성
```

| 모듈 | 역할 |
| --- | --- |
| `src/app/shell.js` | 부팅, 라우트 매칭, 화면 마운트/언마운트 |
| `src/app/routes.js` | 라우트 테이블 (화면 모듈 lazy import) |
| `src/app/apiClient.js` | fetch wrapper: 토큰 부착, error envelope 해석, 401 처리 |
| `src/app/sessionState.js` | 사용자/토큰/현재 프로젝트 상태 |
| `src/app/views/login.js` | 로그인/가입 폼 |
| `src/app/views/projects.js` | 목록/생성/열기/멤버 |
| `src/app/views/projects.js` | project browser |
| `src/app/views/revisions.js` | revision 목록/복원/lineage shell |
| `src/app/views/report.js` | report/calculation shell |
| `src/app/views/importReview.js` | import 검토 (아래) |
| `src/app/modelerHost.js` | 기존 모델러 마운트 + 저장 연결 (`PERSISTENCE_PLAN.md`) |

기존 모델러와의 결합: `index.html`의 부트 코드를 `src/ui/indexRuntimeAdapter.js` 경유로 shell에서 호출 가능하게 정리한다. 단독 `index.html` 실행(현행 개발 흐름)도 계속 동작해야 한다 — 이중 엔트리 유지가 회귀 테스트 조건이다.

## WebGL2 Viewer (`src/viewer/`)

용도: 점군 렌더 + 모델 overlay + import 후보 하이라이트. 기존 모델러 캔버스를 대체하지 않는다 (v1은 별도 뷰).

| 모듈 | 역할 |
| --- | --- |
| `viewerCore.js` | GL context, 카메라(orbit/pan/zoom), resize |
| `pointCloudLayer.js` | gl.POINTS, Float32Array 인터리브 버퍼, 크기/색(높이 그라데이션) |
| `modelLayer.js` | 부재 라인/노드 렌더, 후보 confidence 색상 |
| `sliceControl.js` | z-구간 슬라이스, 박스 필터 |
| `picking.js` | 후보 요소 선택 (id 색상 버퍼 방식) |

성능 예산: 2e6 점 60fps, 버퍼 업로드는 worker에서 준비한 Transferable로.

## Import Review UI (M7-4, M9-4)

import는 3단 흐름으로 고정한다: **업로드 → 후보 검토 → 모델 확정**.

```text
+------------------------------------------------------------+
| [원본 레이어]  DXF 도면 라인 / 점군          (viewer)        |
| [후보 레이어]  stories/grids/members 색상=confidence         |
|--------------------------------------------------------------|
| 후보 목록 패널                                                |
|  [x] STORY z=3.3  conf 0.95     [보기] [수정] [거부]          |
|  [x] COLUMN (2.1,3.0)-(2.1,6.3) conf 0.88 ...                 |
| 매핑 패널: layer/cluster -> 단면/재료                          |
| audit 패널: 미매핑 3, 고아 노드 1, 단위 의심 없음               |
| [모두 확정하고 모델 생성]  (validation 통과 시에만 활성)        |
+------------------------------------------------------------+
```

| 규칙 | 내용 |
| --- | --- |
| 확정 게이트 | validation error 있으면 모델 생성 버튼 비활성 (Phase 3 gate 6) |
| 수정 | 후보의 끝점/층/종류/단면 수정 가능. 수정 이력은 import 기록에 보존 |
| 저장 | 확정/거부 상태를 서버 import 기록에 PATCH (`SERVER_API_PLAN.md`) |
| agent | 후보 목록 조회/확정/거부를 agent action으로 노출 |

## Agent Contract Additions

| Action/API | 설명 |
| --- | --- |
| `login`, `logout` (test 전용 route) | e2e에서 세션 구성 |
| `listProjects`, `openProject`, `saveToServer` | 플랫폼 흐름 |
| `listImportCandidates`, `resolveImportCandidate`, `confirmImport` | import 검토 |
| `getViewerState`, `setViewerSlice` | 뷰어 판독 |

`docs/user-manual/agent-contract.json`과 `src/ui/agentManifest.js`에 동시 반영.

## Testing

fake dom 테스트(`tests/helpers/fakeIndexDom.mjs` 확장)로 shell 라우팅/화면 전환을 검증하고, 서버 연동은 임시 서버 부팅 e2e(`tests/p3-app-shell.mjs`)로 검증한다. WebGL은 단위 분리: 행렬/카메라/버퍼 빌드 로직은 순수 함수로 두고 node에서 테스트, GL 호출은 스모크만.
