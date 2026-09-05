# Phase 3 QA And Release Plan

status: active
milestone: 전체 (게이트), P3-M20 (출시)

## Test Strategy

기존 milestone 테스트 체계(`tools/run-milestone-tests.mjs`)를 유지하고 Phase 3 그룹을 추가한다. 모든 테스트는 node 단독 실행, 외부 서비스 무의존, 결정적(seed 고정)이어야 한다.

| 계층 | 대상 | 테스트 |
| --- | --- | --- |
| unit | core/solver/import 수치 유틸 | 기존 + `p3-*` 단위 |
| contract | agent API, ImportCandidate, registry, 서버 API | envelope/스키마 고정 테스트 |
| workflow | fake dom e2e, 서버 부팅 e2e | login→저장→해석→계산서 |
| benchmark | 선형(기존 gate + 탄성 확장 handcalc) + 비선형 B1-B8 + 점군 합성 recall | tolerance 게이트 |
| regression | 대표건물 10종, pushover 회귀, 설계 일람표 회귀 | full suite |
| design | RC/철골/기초 수계산 검증 케이스 | `verification/specs/DESIGN_MODULE_VERIFICATION.md` 연동 |

**Merge 조건: full suite green.** benchmark tolerance 실패는 skip이 아니라 실패다.

## Phase 3 Test Files (예정)

| 파일 | 대상 |
| --- | --- |
| `tests/p3-server-api.mjs` | REST 계약, error envelope |
| `tests/p3-auth.mjs` | scrypt/토큰/권한 매트릭스 |
| `tests/p3-persistence.mjs` | 3계층 round-trip, autosave, lineage |
| `tests/p3-app-shell.mjs` | shell 라우팅 + 서버 연동 |
| `tests/p3-m6-dxf-import.mjs` / `tests/p3-m7-dwg-plan.mjs` | DXF 파서/매핑/평면 인식 |
| `tests/p3-pointcloud-load.mjs` / `p3-pointcloud-extraction.mjs` / `p3-pointcloud-e2e.mjs` | 점군 |
| `tests/p3-m10-materials.mjs` / `tests/p3-section-properties.mjs` | 라이브러리 |
| `tests/p3-m11-elastic-expansion.mjs` | 스프링/침하/트러스/offset/부분하중/온도 handcalc (M11) |
| `tests/p3-m12-wall-slab.mjs` | mid-pier/쉘/semi-rigid benchmark (M12) |
| `tests/p3-m13-loads-dynamics.mjs` | wind/seismic v2, CQC/좌굴/THA (M13) |
| `tests/p3-m14-nonlinear-geometry.mjs` / `tests/p3-m15-nonlinear-hinge-control.mjs` / `tests/p3-m16-nonlinear-fiber-nlth.mjs` | 비선형 B1~B8 |
| `tests/p3-design-rc.mjs` / `tests/p3-design-steel-foundation.mjs` | 설계 수계산 검증 (M17-M18) |
| `tests/p3-launch-gate.mjs` | 출시 게이트 자동 점검 (아래 표를 코드로) |

## Performance Budgets

| 항목 | 예산 | 측정 방법 |
| --- | --- | --- |
| 점군 로드+전처리 | 1e7점 30초 | 합성 fixture 타이머 (CI 2배 여유) |
| 점군 뷰어 | 2e6점 60fps | 수동 + frame time 로그 |
| 탄성해석 | 대표건물 조합군 10초 | suite 내 타이머 |
| 비선형 pushover | 대표건물 60초/방향 | benchmark 타이머 |
| NLTH | 대표건물 20초 기록 10분 내 | benchmark 타이머 |
| 설계 일람표 | 대표건물 전 부재 30초 | suite 내 타이머 |
| 서버 저장 | 10MB snapshot 2초 | API 테스트 타이머 |
| 앱 초기 로드 | 3초 (로컬) | 수동 |

## Security Checklist (M2, M20 재점검)

`AUTH_ACCOUNT_PLAN.md`의 체크리스트를 기준으로 하고, 출시 전 아래를 재점검한다.

1. 인증 없는 접근으로 데이터 노출 경로 없음 (전 라우트 guard 확인 테스트).
2. 업로드 파일이 실행/서빙 경로로 나가지 않음.
3. path traversal / id 형식 우회 불가.
4. 토큰 만료/무효화 동작.
5. 감사 로그에 승인/권한 변경 기록.
6. 의존성 감사 — zero-dependency 확인 또는 도입분 lockfile 고정.
7. `data/` 백업/복원 절차 문서화 및 리허설.

## Release Packaging (M20-1)

| 형태 | 내용 | 검증 |
| --- | --- | --- |
| 웹 배포 | `node server/main.mjs` 단일 프로세스, 정적 포함, systemd/서비스 가이드 | 클린 머신 설치 smoke |
| 데스크톱 | Electron 래핑 (내장 서버 + 로컬 data/) — M20에서 최종 결정 | 설치→실행→해석→저장 smoke |
| 버전 | `package.json` version + `platformVersion.js` 동기, CHANGELOG 시작 | 버전 표기 테스트 |

## Launch Gate (출시 직전 판정표)

`tests/p3-launch-gate.mjs`가 기계 확인 가능한 항목을 자동 점검하고, 수동 항목은 체크리스트 리포트로 남긴다 (`reports/launch-readiness/`).

| # | Gate | 종류 | Pass 조건 |
| --- | --- | --- | --- |
| G1 | full test suite | 자동 | failed 0 |
| G2 | 선형(확장 포함)+비선형 benchmark | 자동 | B1~B8 + 탄성 확장 handcalc 전체 tolerance 통과 |
| G3 | 점군 합성 벤치마크 | 자동 | recall/precision 목표 달성 |
| G4 | 대표건물 10종 pilot | 자동 | 해석+검토 데이터 생성 (P2 T50 계승) |
| G5 | 플랫폼 e2e | 자동 | 가입→로그인→프로젝트→저장→revision→승인 |
| G6 | import e2e | 자동 | DXF/점군 → 확정 → validation 통과 모델 → 해석 ok |
| G7 | 성능 예산 | 자동+수동 | 예산 표 전 항목 |
| G8 | 보안 체크리스트 | 수동 | 7항목 서명 |
| G9 | user-manual 전면 갱신 | 수동 | 신규 기능 반영, 신규 사용자 시나리오 통과 |
| G10 | agent-contract 최신화 | 자동 | manifest ↔ contract diff 없음 |
| G11 | 베타 파일럿 리포트 | 수동 | 실무 시나리오 10종 + 이슈 반영 기록 |
| G12 | 백업/복원 리허설 | 수동 | data/ 복원 성공 기록 |
| G13 | 설계 모듈 수계산 검증 | 자동 | RC/철골/기초 검증 케이스 전체 통과 + `verification/specs/DESIGN_MODULE_VERIFICATION.md` 기록 |
| G14 | 계산서 완결성 | 자동 | 기본 목차에 `not checked` 장 없음, 전 장 trace/limitation 연결 |

## Beta Pilot (M20-5)

| 시나리오 | 내용 |
| --- | --- |
| 1-3 | 도면 기반 신축 검토 3건 (라멘/벽식/철골 — 상세설계 일람표까지) |
| 4-5 | 점군 기반 현황 모델 2건 (합성 1 + 실측 1) |
| 6 | 커스텀 재료/단면 프로젝트 1건 |
| 7 | 지하층/기초 검토 1건 (토압/수압/스프링/매트) |
| 8 | 비선형 pushover 검토 1건 |
| 9 | NLTH 성능검토 1건 (지진파 3세트) |
| 10 | 협업/승인 workflow 1건 (2인 역할) |

각 시나리오는 소요 시간, 실패 지점, 사용자 피드백을 `reports/launch-readiness/pilot-01.md`부터 `reports/launch-readiness/pilot-10.md`로 기록하고, blocker는 backlog 티켓으로 변환 후 게이트 재실행한다.
