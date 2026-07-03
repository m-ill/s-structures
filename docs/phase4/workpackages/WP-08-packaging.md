# WP-08 패키징/배포

stage: R / milestone: P4-M8 / tickets: P4-T40~T45 / 크기: M~L
status: not-started
선행: WP-05 완료 (강화된 서버 전제), WP-07 완료 권장 (패키징 대상 UI 확정)

## Objective

`node server/main.mjs` 수동 실행뿐인 현재를, 클린 머신에 설치 가능한 두 형태(웹 A / 데스크톱 B)로 만든다. 상세 정책은 `../RELEASE_PLAN.md`.

## Work Breakdown

### Step 1. 빌드 스크립트 (T40 착수)
1. `tools/build-release.mjs`: 배포 폴더 생성 — 포함(index.html, app.html, src/, server/, docs/user-manual/, LICENSE, CHANGELOG, config.sample.json) / 제외(tests/, tools/dev류, docs/phase*, reports/, .git).
2. `server/config.mjs`에 `config.json` 파일 로드 지원 추가 (env > file > default 우선순위).
3. 산출물 zip + SHA256 기록.

### Step 2. 웹 A형 (T40)
1. 설치 가이드 (runbook §1 확정): Node 요건, 폴더 배치, 서비스 등록(NSSM/systemd).
2. **클린 머신 smoke**: VM 또는 별도 PC에서 가이드만으로 설치→가입→모델링→저장→계산서. 기록: `reports/launch-readiness/install-smoke-web.md`.

### Step 3. 데스크톱 B형 (T41)
1. Electron 채택 확정을 ARCHITECTURE 결정표에 기록 (빌드 의존성 lockfile 고정, 런타임 소스 무의존 유지).
2. `desktop/` 신설: main process가 내장 서버 기동(127.0.0.1 임의 포트, dataDir=사용자 앱데이터) 후 BrowserWindow 로드. 종료 시 서버 정리.
3. TD-14 함께 해소: isMain 감지 대신 명시적 `startServer(config)` export를 desktop이 호출.
4. electron-builder로 Windows NSIS 인스톨러. 아이콘/제품명/버전 동기.
5. 클린 머신 smoke: `install-smoke-desktop.md`.
6. 난항 시 R4 대응: B형을 1.0 선택 항목으로 강등할지 오너 결정.

### Step 4. 버전/라이선스 (T43, T44)
1. CHANGELOG.md 개시 (0.1.0부터 소급 요약 1항목 + 이후 규칙). `tests/p4-version-sync.mjs`: package.json ↔ platformVersion 제품 버전 ↔ 계산서 표지.
2. 라이선스 v1: Ed25519 서명 검증 모듈(`server/auth/license.mjs`), 발급 스크립트(개인키 repo 외부), 평가 모드 동작 확정(오너 결정 큐), 만료/위조 테스트.

### Step 5. 백업 도구 (T45)
`tools/backup-data.mjs` — 실행 중 안전 백업(스냅샷 복사), `--verify` 무결성 검사. 복구 리허설 1회 수행 → runbook §2·3 확정 + 기록.

## Deliverables

build-release / config.json 지원 / desktop/ + 인스톨러 / CHANGELOG·버전 테스트 / license v1 / backup 도구 / smoke 기록 2건.

## Acceptance Criteria

1. 클린 머신 smoke 2형태 기록 존재 (B형 강등 시 오너 결정 기록으로 대체).
2. version-sync·license 테스트 green. TD-14 fixed.
3. 백업→복구 리허설 기록 존재.

## Verification Procedure

`node tools/build-release.mjs && npm test` + smoke 기록 검토.

## Risks & Rollback

R4(Electron 복잡도) — Step 3만 분리 가능하게 커밋 구성. 빌드 의존성 도입은 `desktop/package.json`으로 격리해 본체 zero-dep 불변.

## Result

(완료 시 기입)
