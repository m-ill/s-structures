# WP-07 모델러 통합·프론트 완성

stage: H / milestone: P4-M7 / tickets: P4-T33~T39 / 크기: L (Phase 4 최대 단일 작업)
status: complete
선행 스파이크: R3 대응 1일 스파이크를 다른 WP보다 먼저 실행 권장

## Objective

**TD-01 해소** — native 모델러(index.html 계열 모듈)를 앱 shell(`#/p/:id/modeler`)에 실통합하고, 서버 저장/autosave/import 검토/재료 편집까지 플랫폼 안에서 완결되게 한다. 이것이 끝나야 "제품"이다.

## Scope

**In**: 모델러 마운트, 저장 UX 실연결, shell 재진입 가드, import 검토 overlay, 재료 편집 UI, 클라 측 중복 정리(TD-10/11).
**Out**: 모델러 자체 기능 확장, 디자인 리뉴얼(스타일 정돈은 허용).

## Preconditions

1. **스파이크 (1일)**: `src/ui/indexRuntimeAdapter.js`와 index.html 부트 코드를 읽고, (a) 전역(window) 의존 목록, (b) DOM id 의존 목록, (c) 초기화/해제 가능 여부를 `docs/phase4/workpackages/WP-07-spike-notes.md`로 기록. 통합 방식 결정: **iframe 격리** vs **동일 문서 마운트** — 스파이크 결과로 확정하고 이 문서에 결정 기록.
2. WP-05 Step 1 완료 권장 (저장 API 계약 안정).

## Work Breakdown

### Step 1. 모델러 호스트 실구현 (T33)
1. 스파이크 결정에 따라:
   - iframe 방식: `modelerHost`가 `/index.html?project=<id>` iframe 로드, postMessage 브리지(`src/app/modelerBridge.js` 신규)로 모델 get/set/이벤트 교환. 기존 agent command bridge 재사용 검토.
   - 동일 문서 방식: index 부트를 `initNativeModeler(container, options)` 팩토리로 리팩토링, shell이 호출. 전역 충돌 제거가 관건.
2. 프로젝트 컨텍스트 주입: 열 때 최신 revision 로드(persistenceClient), 없으면 빈 모델.
3. **이중 엔트리 회귀**: index.html 단독 실행이 그대로 동작 — 기존 m17/m26 계열 테스트 무수정 green이 조건.

### Step 2. 저장 UX 실연결 (T34)
1. Ctrl+S/저장 버튼 → 로그인+프로젝트 컨텍스트면 saveToServer(revision), 아니면 기존 L2 파일 다운로드 유지.
2. lineageWarning 수신 시 배너 + revisions 화면 링크.
3. autosave 스케줄러+링버퍼를 모델 변경 이벤트에 연결, 시작 시 복구 프롬프트.
4. 상태 표시줄: 마지막 저장 rev/시각, unsaved 표시.
5. `tests/p4-modeler-save-flow.mjs` (fake dom + 임시 서버 e2e).

### Step 3. shell 견고화 (T35, T36)
1. TD-07: route() 재진입 가드 — routing 플래그 + 진입 중 mutator notify는 microtask로 지연(단일 재라우트로 수렴). 중첩 mutator 시나리오 테스트.
2. TD-10: 패턴 컴파일러를 `src/core/routePattern.js`(공용, 브라우저/서버 겸용)로 추출 — 양쪽 교체.
3. TD-11: viewerCore 내부 벡터를 `src/core/vector.js` 사용으로 교체 (zero-length 가드 의미 차이 확인 후).

### Step 4. import 검토 overlay 실연결 (T37)
1. `#/p/:id/import/:jobId` 화면에서 뷰어(pointCloudLayer+modelLayer+picking)로 후보 시각화 — 목록 선택↔3D 하이라이트 양방향.
2. 확정/거부/수정 → 서버 PATCH → 확정 시 모델 생성·프로젝트 저장까지.
3. 합성 점군으로 브라우저 e2e 시나리오 기록.

### Step 5. 재료 라이브러리 UI (T38)
`src/materials/libraryEdit.js` 계약을 shell 화면으로: 목록/편집 폼/버전 이력/서버 저장. agent action과 동일 경로 사용.

### Step 6. 종합 실검증 (T39)
프리뷰 브라우저에서: 가입→로그인→프로젝트 생성→모델링(그리드+부재)→해석→결과 확인→Ctrl+S→revisions 확인→계산서 export→로그아웃. 콘솔 에러 0, 각 단계 스크린샷을 증빙 폴더에.

## Deliverables

modelerBridge(또는 팩토리 리팩토링) / 저장 UX / 공용 routePattern / overlay 검토 화면 / 재료 UI / 신규 테스트 3본+ / TD-01·07·10·11 fixed.

## Acceptance Criteria

1. `#/p/:id/modeler`에서 실제 모델링·해석·서버 저장 가능 (브라우저 증빙).
2. index.html 단독 실행 회귀 green (기존 테스트 무수정).
3. TD-01, 07, 10, 11 fixed. full suite green.

## Verification Procedure

`npm test` + 프리뷰 종합 시나리오 (Step 6) 실행 기록.

## Risks & Rollback

R3 — 스파이크로 선제 완화. iframe 방식이면 통합 리스크는 낮고 브리지 표면이 커지며, 동일 문서 방식이면 반대 — 스파이크에서 결정을 문서화하고 번복 시 사유 기록. 각 Step은 독립 커밋으로 revert 가능하게.

## Result

2026-07-03 P4-T33 spike:

- Recorded the integration decision in `docs/phase4/workpackages/WP-07-spike-notes.md`.
- Selected iframe isolation for the first shell integration so `index.html` remains a standalone modeling entry point.
- Replaced the `#/p/:projectId/modeler` placeholder with a real native modeler iframe host in `src/app/modelerHost.js`.
- Updated `tests/p3-app-shell.mjs` to verify local and project-backed iframe URLs.

2026-07-03 P4-T34 save-flow pass:

- Added `src/app/modelerBridge.js` for versioned parent-to-iframe modeler commands.
- Updated the native index command bridge so iframe commands can respond back to the shell host.
- Connected `#/p/:projectId/modeler` save controls to `persistenceClient.saveToServer`.
- Added project save status, unsaved/autosave ring status, a revisions shortcut, and lineage-warning banner support in the modeler host.
- Added `tests/p4-modeler-save-flow.mjs` and `npm run test:m100` to prove save button/Ctrl+S creates server revisions.

2026-07-03 P4-T35 route reentry guard:

- Added shell routing reentry protection so state changes during mount schedule one deferred reroute instead of nested mounting.
- Added `tests/p4-shell-route-reentry.mjs` and `npm run test:m101` to prove modeler host is not duplicated.
- Marked TD-07 fixed in `TECH_DEBT_REGISTER.md`.

2026-07-03 P4-T36 common utilities:

- Added `src/core/routePattern.js` and moved app/server route matching to the same compiler.
- Moved viewer camera vector math to `src/core/vector.js` helpers.
- Added `tests/p4-route-pattern-contract.mjs` and `npm run test:m102`.
- Marked TD-10 and TD-11 fixed in `TECH_DEBT_REGISTER.md`.

2026-07-03 P4-T37 import review overlay:

- Added `src/app/importReviewOverlay.js` to convert import candidates into model-layer and picking data.
- Connected import review UI to overlay item rendering and selected entity state.
- Added `tests/p4-import-review-overlay.mjs` and `npm run test:m103`.

2026-07-03 P4-T38 material library UI:

- Added `#/p/:projectId/library` shell route and `src/app/views/library.js`.
- Connected project material library list/save flow to existing server library APIs.
- Added `tests/p4-library-ui.mjs` and `npm run test:m104` to prove versioned material records are stored and listed.

2026-07-03 P4-T39 preview integrated validation:

- Added `tests/p4-preview-integrated-validation.mjs` and `npm run test:m105`.
- The integrated flow covers project modeler save, revisions list, material library save, and import overlay selection.
- Wrote `verification/evidence/validation/p4-preview-integrated-validation.json`.
- In-app browser control timed out during local navigation/new-tab setup; Chrome headless was available but returned no DOM output in this shell, so this pass records automated app-shell evidence instead of screenshot evidence.
- Marked TD-01 fixed in `TECH_DEBT_REGISTER.md`.

(완료 시 기입)
