# Phase 4 Implementation Backlog

status: active
ticket format: P4-T## / 우선순위 P0(출시 차단)·P1(출시 전)·P2(출시 후 허용) / 크기 S·M·L

모든 티켓은 **수용 기준(AC)**이 기계 확인 가능해야 한다 (테스트 명령 또는 증빙 파일 경로). 상태: open / in-progress / done(커밋).

## WP-01 탄성해석 실증 (P4-M1)

| Ticket | P | 크기 | 작업 | 수용 기준 |
| --- | --- | --- | --- | --- |
| P4-T01 | P0 | M | 탄성 확장 기능별 독립 기준값 문서 작성 (스프링/침하/트러스/offset/부분·사다리꼴/온도) | `verification/specs/ELASTIC_EXPANSION_VALIDATION.md`에 케이스별 출처·수계산·tolerance, 테스트가 값 참조 |
| P4-T02 | P0 | M | 벽체(mid-pier)/semi-rigid/쉘 기준값 검증 확충 | coupled wall 문헌 대조 1건 포함, 동일 문서에 기록 |
| P4-T03 | P0 | M | CQC/좌굴/선형 THA 문헌 대조 | 근접모드 CQC 예제, Euler 좌굴 ±2%, El Centro THA 재현 기록 |
| P4-T04 | P0 | M | 상용 SW 대조표 3모델 | `verification/evidence/validation/elastic-crosscheck/`에 모델·결과 CSV·오차표. 기준 데이터는 오너 제공 또는 문헌 예제 |
| P4-T05 | P1 | S | tension-only 경계 케이스 5종 | `tests/p4-elastic-active-state.mjs` green |
| P4-T06 | P0 | S | M10~M13 proven 전환 | completion audit 갱신 + 관련 review 테스트 green |

## WP-02 비선형해석 실증 (P4-M2)

| Ticket | P | 크기 | 작업 | 수용 기준 |
| --- | --- | --- | --- | --- |
| P4-T07 | P0 | M | B1~B8 원전 출처 명기·tolerance 재점검 | `verification/specs/NONLINEAR_BENCHMARK_SOURCES.md` + gate 테스트 유지 |
| P4-T08 | P0 | M | 다힌지 메커니즘 순서 수계산 대조 | 2층 포탈 케이스, 힌지 발생 순서·λ 수계산 일치 |
| P4-T09 | P0 | M | NLTH 실증 (탄성 일치 ±1%, 탄소성 문헌 대조) | `tests/p4-nlth-validation.mjs` green + 증빙 문서 |
| P4-T10 | P1 | M | pushover 외부 대조 1건 | 문헌/상용 곡선 대조 리포트 |
| P4-T11 | P0 | S | M14~M16 proven 전환 | completion audit 갱신 |

## WP-03 설계모듈 실증 (P4-M3)

| Ticket | P | 크기 | 작업 | 수용 기준 |
| --- | --- | --- | --- | --- |
| P4-T12 | P0 | L | RC 수계산 검증서 (보/기둥/벽/슬래브 × 3케이스+) | `verification/specs/DESIGN_MODULE_VERIFICATION.md` RC 장 + `tests/p4-design-rc-handcalc.mjs` |
| P4-T13 | P0 | L | 철골/접합/기초 수계산 검증서 (각 3케이스+) | 동일 문서 철골/기초 장 + 테스트 |
| P4-T14 | P0 | M | KDS 조항 registry 확정 (조항·버전·적용조건) | `src/standards/` 조항 표 + 계산서 표기 테스트 |
| P4-T15 | P1 | S | 미검토 항목 limitation 문구 확정 | 계산서 각 장 limitation 스냅샷 테스트 |
| P4-T16 | P0 | S | M17~M18 proven 전환 + 일람표 회귀 고정 | completion audit + 대표건물 일람표 회귀 |

## WP-04 도면/점군 import 실증 (P4-M4)

| Ticket | P | 크기 | 작업 | 수용 기준 |
| --- | --- | --- | --- | --- |
| P4-T17 | P0 | M | 실제 DWG e2e (ODA 설치 환경) | 실무 도면 1건 변환→인식→확정→해석 기록. 변환기 부재 UX 스크린샷 증빙 |
| P4-T18 | P0 | M | 실측 점군 검증 1건+ | 공개셋/실스캔 recall·precision 리포트 `verification/evidence/validation/pointcloud-field/` |
| P4-T19 | P0 | S | 1e7점 성능 실측 | perf JSON 증빙 + 예산 테스트 |
| P4-T20 | P1 | M | 바이너리 로더 fuzz 20케이스 | `tests/p4-pointcloud-fuzz.mjs` crash 0 |
| P4-T21 | P0 | S | M7~M9 proven 전환 | completion audit 갱신 |

## WP-05 플랫폼/보안 강화 (P4-M5)

| Ticket | P | 크기 | 작업 | 수용 기준 |
| --- | --- | --- | --- | --- |
| P4-T22 | P1 | S | TD-02: 다운로드 Content-Type 정책 (allowlist 또는 octet-stream 강제 + nosniff) | `tests/p4-security-headers.mjs` |
| P4-T23 | P1 | M | TD-03/04: 라우트 인증 선언화 — `router.get(path, handler, { role: 'engineer' })` + role enum 검증, 가드 자동 적용 | 라우트 계약 테스트가 "role 선언 없는 project 라우트" 실패 처리 |
| P4-T24 | P1 | S | TD-05: userStore 직렬화 락 | 병렬 실패 로그인 race 테스트 |
| P4-T25 | P1 | S | TD-06: dataDir lockfile (PID+heartbeat, stale 감지) | 2중 기동 시 명확한 오류로 거부하는 테스트 |
| P4-T26 | P2 | S | TD-09: tools/serve.mjs 제거, dev도 server/main.mjs 사용 | npm run dev 동작 + 파일 삭제 |
| P4-T27 | P2 | S | TD-12/13: approval null 재확인, rev `??` 수정 | 회귀 테스트 |
| P4-T28 | P1 | S | 감사 로그 (승인/권한/로그인 실패) `data/audit.log` | 감사 이벤트 기록 테스트 |

## WP-06 성능/규모 실증 (P4-M6)

| Ticket | P | 크기 | 작업 | 수용 기준 |
| --- | --- | --- | --- | --- |
| P4-T29 | P2 | M | TD-08: 요청 컨텍스트에 project meta 1회 로드 공유 | 라우트당 project.json 읽기 1회 (계측 테스트) |
| P4-T30 | P2 | S | TD-15: 독립 I/O Promise.all | 코드 diff + 기존 테스트 green |
| P4-T31 | P0 | M | 성능 예산 6종 실측·게이트화 | `verification/evidence/validation/perf-budget.json` + `tests/p4-perf-budget.mjs` |
| P4-T32 | P1 | M | 대형 모델(부재 2,000+) 실측·한계 문서화 | 실측 기록 + STATUS_AND_LIMITS 갱신 |

## WP-07 모델러 통합·프론트 완성 (P4-M7)

| Ticket | P | 크기 | 작업 | 수용 기준 |
| --- | --- | --- | --- | --- |
| P4-T33 | **P0** | L | TD-01: native 모델러를 shell 라우트에 실통합 (마운트/언마운트, 프로젝트 컨텍스트 주입) | `#/p/:id/modeler`에서 모델링 동작. index.html 단독 실행 회귀 유지 |
| P4-T34 | P0 | M | 서버 저장 실연결: Ctrl+S→revision, 열기→revision 선택, autosave 링버퍼 가동 | 저장 UX 계약 테스트 + 브라우저 실검증 |
| P4-T35 | P1 | S | TD-07: shell route() 재진입 가드 | 중첩 mutator 시나리오 테스트 |
| P4-T36 | P2 | S | TD-10/11: 라우트 컴파일러·벡터 유틸 공용화 | 중복 제거 + 기존 테스트 green |
| P4-T37 | P1 | M | import 검토 UI 뷰어 overlay 실연결 (후보 하이라이트/선택) | 점군→검토→확정 브라우저 e2e |
| P4-T38 | P1 | M | 재료 라이브러리 편집 UI 완성 (서버 저장, 버전 이력) | fake dom + 서버 e2e |
| P4-T39 | P0 | S | 프리뷰 브라우저 종합 실검증 (콘솔 에러 0) | 스크린샷 증빙 + 체크리스트 |

## WP-08 패키징/배포 (P4-M8)

| Ticket | P | 크기 | 작업 | 수용 기준 |
| --- | --- | --- | --- | --- |
| P4-T40 | P0 | M | 웹 배포 패키지 (단일 폴더 + 서비스 등록 가이드 + 설정 파일) | 클린 머신 설치 smoke 기록 |
| P4-T41 | P0 | L | Electron 데스크톱 (내장 서버, 로컬 data/) — ARCHITECTURE D10 확정 | 설치→모델링→저장 smoke. zero-dep 예외는 결정표 등재 |
| P4-T42 | P1 | S | TD-14: 엔트리 감지 정리 + 프로세스 관리 | 패키징 환경 기동 테스트 |
| P4-T43 | P1 | S | semver + CHANGELOG + 버전 동기 테스트 | `tests/p4-version-sync.mjs` |
| P4-T44 | P1 | M | 라이선스 키 v1 (오프라인 서명 검증) | 키 발급/검증/만료 테스트 |
| P4-T45 | P1 | S | 백업/복구 스크립트 (`tools/backup-data.mjs`) | 복구 리허설 기록 (runbook 연동) |

## WP-09 사용자 문서/온보딩 (P4-M9)

| Ticket | P | 크기 | 작업 | 수용 기준 |
| --- | --- | --- | --- | --- |
| P4-T46 | P0 | L | user-manual 전면 개정 (Phase 3 기능 반영) | 문서-기능 대조표 100% + STATUS_AND_LIMITS 갱신 |
| P4-T47 | P1 | M | 튜토리얼 3편 (도면→계산서 / 점군→현황모델 / pushover) | 신규 사용자 30분 시나리오 통과 기록 |
| P4-T48 | P1 | S | 온보딩 샘플 프로젝트 3종 내장 | 앱에서 원클릭 로드 |
| P4-T49 | P1 | S | agent-contract 최신화 자동 diff 테스트 | manifest↔contract diff 0 |

## WP-10 베타 파일럿·출시 (P4-M10~M11)

| Ticket | P | 크기 | 작업 | 수용 기준 |
| --- | --- | --- | --- | --- |
| P4-T50 | P0 | L | 베타 10 시나리오 실행·리포트 | `reports/launch-readiness/pilot-01..10.md` blocker 0 |
| P4-T51 | P0 | S | 출시 게이트 최종 실행 (감사 preliminary 0, TD P0/P1 0) | `tests/p3-launch-gate.mjs` + 신규 p4 게이트 green |
| P4-T52 | P0 | S | owner 서명 증빙 등록, 1.0.0 태깅 | evidence register 기록 + git tag |

## Out Of Scope (기능 동결 기록)

Phase 4 중 접수된 신규 기능 요구는 여기 기록만 한다. 구현은 오너 승인 후 별도 계획으로.

| 일자 | 요구 | 출처 | 판단 |
| --- | --- | --- | --- |
| - | - | - | - |
