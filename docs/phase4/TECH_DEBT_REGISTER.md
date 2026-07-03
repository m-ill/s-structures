# Tech Debt Register

status: active — 작업 중 발견 즉시 등재 (Phase 4 working agreement 2)
source: 2026-07-02 8각도 코드리뷰 + 2026-07-03 재검증

우선순위: P0 출시 차단 / P1 출시 전 필수 / P2 출시 후 허용.
상태: open / in-progress / fixed(커밋 해시) / accepted(사유 명기).

## Register

| TD | P | 위치 | 내용 | 실패 시나리오 | 배정 | 상태 |
| --- | --- | --- | --- | --- | --- | --- |
| TD-01 | **P0** | `src/app/modelerHost.js` | native 모델러가 앱 shell 라우트에 미통합 (placeholder). index.html 단독 실행과 플랫폼(로그인/프로젝트/서버 저장)이 분리됨 | 사용자가 프로젝트를 열어도 모델링 불가 — 제품 핵심 흐름 단절 | WP-07 | open |
| TD-02 | P1 | `server/routes/files.mjs:32` | 파일 다운로드가 업로드 시 Content-Type을 그대로 반사, `X-Content-Type-Options: nosniff` 부재 | engineer가 text/html로 업로드 → viewer가 브라우저에서 열면 stored-XSS 소지 (attachment 헤더로 완화되나 불충분) | WP-05 | fixed |
| TD-03 | P1 | `server/routes/*.mjs` 17개 핸들러 | authenticate+requireProjectRole 2-step을 수동 반복 — 라우터 수준 인증 선언 부재 | 신규 라우트에서 role 체크 누락 시 무증상으로 프로젝트 데이터 노출 | WP-05 | fixed |
| TD-04 | P1 | `server/auth/guard.mjs` | requireProjectRole의 minRole이 자유 문자열 — 오타('viewr') 시 정적 검출 불가 | roleAtLeast가 0 rank로 평가 → 의도와 다른 fail 방향 | WP-05 | fixed |
| TD-05 | P1 | `server/store/userStore.mjs:64` | verifyCredentials가 read-modify-write를 락 없이 수행 (scrypt 수십 ms 사이 race) | 병렬 로그인 실패 시도로 failedLogins 증가 유실 → lockout 우회 | WP-05 | fixed |
| TD-06 | P1 | `server/store/fileStore.mjs` | 프로세스 내 락만 존재. 동일 dataDir에 2번째 프로세스 기동을 막는 lockfile/pidfile 없음 | rolling restart/중복 실행 시 last-writer-wins 무경고 데이터 손상 | WP-05 | fixed |
| TD-07 | P1 | `src/app/shell.js` route() | 재진입 비안전 — mount 중 session mutator 호출 시 중첩 route()로 이중 mount, `current` 불일치 | teardown 있는 뷰(타이머/구독) 추가 시 리소스 누수. 현재는 뷰가 단순해 잠복 | WP-07 | fixed |
| TD-08 | P2 | `server/auth/guard.mjs` + `server/store/projectStore.mjs` | requireProjectRole과 핸들러가 project.json을 요청당 2회 읽음 (N+1). saveRevision도 get/listRevisions 순차 await | 인증 라우트 전체에 불필요한 디스크 I/O 2배 | WP-06 | fixed |
| TD-09 | P2 | `tools/serve.mjs` vs `server/main.mjs` | 정적 서빙(경로 가드, MIME 표) 이중 구현 | 보안 수정이 한쪽만 적용될 위험 | WP-05 | fixed |
| TD-10 | P2 | `src/app/routes.js` vs `server/router.mjs` | 패턴→정규식 컴파일러 동일 알고리즘 이중 구현 | 한쪽만 확장 시 클라/서버 라우트 의미 분기 | WP-07 | open |
| TD-11 | P2 | `src/viewer/viewerCore.js` | 내부 sub/dot/cross/normalize가 `src/core/vector.js` 미사용 | 벡터 수학 정밀도 수정이 뷰어에 미전파 | WP-07 | open |
| TD-12 | P2 | `server/routes/approval.mjs` | requireProjectRole 후 get() 결과 null 재확인 없음 (동시 softDelete race) | 드문 race에서 500 INTERNAL (404가 정답) | WP-05 | fixed |
| TD-13 | P2 | `server/store/projectStore.mjs` saveRevision | `(latest?.rev \|\| 0)+1` — rev 0 유입 시 falsy 처리 (현재 도달 불가, latent) | 외부 스크립트가 0-base index 기록 시 rev 충돌 | WP-05 | fixed |
| TD-14 | P2 | `server/main.mjs` isMain() | argv[1] 접미사 문자열 매칭 — 파일 이동/래퍼 실행 시 서버가 조용히 미기동 | 패키징(Electron/서비스) 시 무증상 실패 | WP-08 | open |
| TD-15 | P2 | `server/routes/projects.mjs` 등 | 독립 I/O의 순차 await (member PUT의 user 조회, approval의 listRevisions) | 요청당 1 I/O 왕복 지연 추가 | WP-06 | fixed |

## Fixed During Phase 3 (기록용)

| 항목 | 수정 근거 |
| --- | --- |
| URI 디코딩 크래시 (main/router 무가드 decodeURIComponent → 프로세스 다운) | `BAD_URI` 오류 계약 + safeDecode (`6d7c23c` 외) |
| 세션 restore 실패 시 apiClient 토큰 미정리 | `sessionState.js` setToken(null) |
| 첫 revision의 parentRev lineage 미보고 | lineage 객체 (`5ed8cd5`) |
| import candidate 서버측 무검증 | `validateImportCandidate` (`ee0e7a1`) |
| x-file-name 잘못된 인코딩 → 500 | 400 BAD_URI/VALIDATION 계약 (테스트 고정) |

## Rules

1. 새 부채는 다음 TD 번호로 즉시 추가하고 WP에 배정한다.
2. P0/P1은 출시 게이트(G-debt)에서 자동 검사 대상 — `IMPLEMENTATION_BACKLOG.md`의 해당 티켓과 1:1.
3. accepted 처리는 사유와 재검토 시점을 명기해야 한다.
