# Phase 3 Roadmap

status: active planning
source: user direction 2026-07-02 (rev 2 — 해석 완전성/설계 모듈 흡수, Phase 4 폐지)

Phase 3는 6개 stage, 21개 마일스톤으로 진행한다. **Phase 4는 없다.** 건축구조사무소 실무에 필요한 해석/설계 기능은 전부 Phase 3 안에서 완결하고, 제외 항목은 각 계획 문서의 비목표 표에만 남긴다. 각 마일스톤은 완료 기준(Exit)과 검증물이 있어야 닫힌다. 크기: S 며칠 / M 1-2주 / L 2-4주 상당.

## Stage Overview

| Stage | Milestones | 목표 |
| --- | --- | --- |
| A 플랫폼 기반 | P3-M0 ~ M4 | 서버/계정/저장/앱 shell |
| B 입력 파이프라인 | P3-M5 ~ M9 | DXF/DWG/point cloud → 3D 모델 |
| C 탄성 엔진 완전성 | P3-M10 ~ M13 | 재료 라이브러리 + 요소/벽체/하중 v2/동적/좌굴 |
| D 비선형 엔진 | P3-M14 ~ M16 | 기하 → 힌지/control → fiber/NLTH |
| E 상세 설계 모듈 | P3-M17 ~ M18 | RC/철골/기초/접합 상세설계 (P2 T34-T40 완결) |
| F 제품화 | P3-M19 ~ M20 | 통합 결과/보고서, 출시 준비 |

병렬성: A와 B는 병렬 가능. C는 B와 병렬 가능(해석 코드 영역). D는 M10에, E는 C(M11-M12 demand)와 M10에 의존. F는 전부에 의존.

## Milestone Summary

| Milestone | 크기 | 목표 | 핵심 결과물 | 상세 문서 |
| --- | --- | --- | --- | --- |
| P3-M0 | S | Phase 3 기준선 | 폴더/문서/버전/CI 게이트 | - |
| P3-M1 | M | 서버 골격 | node 서버, REST v1, 파일 저장소 | `SERVER_API_PLAN.md` |
| P3-M2 | M | 계정/로그인 | 가입/로그인/역할/권한 | `AUTH_ACCOUNT_PLAN.md` |
| P3-M3 | M | 저장 체계 | 3계층 저장, autosave, revision | `PERSISTENCE_PLAN.md` |
| P3-M4 | L | 프론트 앱 shell | SPA, WebGL2 뷰어 기반 | `FRONTEND_PLAN.md` |
| P3-M5 | M | Geometry core | merge/추론/분류/ImportCandidate | `IMPORT_DXF_DWG_PLAN.md` |
| P3-M6 | L | DXF import v1 | 파서, wireframe 매핑, audit | 〃 |
| P3-M7 | L | DWG/평면 인식 v2 | 변환 경로, 2D→3D 조립, 검토 UI | 〃 |
| P3-M8 | L | Point cloud v1 | 로더/전처리/뷰어/worker | `IMPORT_POINT_CLOUD_PLAN.md` |
| P3-M9 | L | Point cloud 추출 v2 | 층/기둥/보/벽 검출, 확정 워크플로 | 〃 |
| P3-M10 | M | 재료/단면 라이브러리 | versioned registry, 비선형 파라미터 | `MATERIAL_SECTION_LIBRARY_PLAN.md` |
| P3-M11 | L | 탄성 확장 1: 요소/경계/하중 | 스프링/침하/트러스/offset/부분분포/온도 | `ELASTIC_ENGINE_COMPLETENESS_PLAN.md` |
| P3-M12 | L | 탄성 확장 2: 벽체/슬래브 | mid-pier 벽체, 쉘 v1, semi-rigid diaphragm | 〃 |
| P3-M13 | L | 하중 v2/동적/좌굴 | wind/seismic v2, 설/토압/수압, CQC, 좌굴, 선형 THA | 〃 |
| P3-M14 | L | 비선형 v1: 기하 | corotational, NR, load control | `NONLINEAR_ENGINE_PLAN.md` |
| P3-M15 | L | 비선형 v2: 힌지/control | M-θ 힌지, 변위/arc-length, pushover 정식화 | 〃 |
| P3-M16 | L | 비선형 v3: fiber/NLTH | PMM 힌지, fiber 단면, Newmark NLTH, 지진파 관리 | 〃 |
| P3-M17 | L | RC 상세설계 | 보/기둥(PM)/벽체/슬래브 일람표 | `DESIGN_MODULES_PLAN.md` |
| P3-M18 | L | 철골/기초/접합 상세설계 | 부재/가새/볼트/용접/base plate/기초 일람표 | 〃 |
| P3-M19 | M | 통합 결과/보고서 | 비선형·설계 장 통합, P2 잔여 완결 | - |
| P3-M20 | L | 출시 준비 | packaging, 온보딩, 파일럿, 게이트 | `QA_RELEASE_PLAN.md` |

## Stage A. Platform (P3-M0 ~ M4)

세부 subtask는 이전과 동일 — 각 계획 문서 참조. Exit 요약:

| Milestone | Exit |
| --- | --- |
| M0 | 파일 지도와 실제 구조 일치, phase3 문서 세트, `npm test` 단일 게이트 |
| M1 | serve.mjs 대체, 프로젝트 CRUD/snapshot API 계약 테스트, 10MB round-trip |
| M2 | scrypt/토큰/역할 매트릭스 테스트, rate limit |
| M3 | 3경로 round-trip, 강제 종료 복구, lineage warning |
| M4 | login→modeler e2e, 1e6점 60fps 뷰어 기반, manifest 등록 |

## Stage B. Import (P3-M5 ~ M9)

| Milestone | Exit |
| --- | --- |
| M5 | merge/story·grid 추론/분류 단위 테스트, ImportCandidate 계약 |
| M6 | wireframe fixture→해석 가능 모델, layer mapping coverage audit |
| M7 | DWG→DXF e2e(변환기 환경), 평면 인식률 리포트(기둥 recall≥0.9), 2층 조립, 검토 UI 확정 흐름 |
| M8 | 포맷 로더, 1e7점 30s 전처리, 2e6점 60fps, worker 무블로킹 |
| M9 | 합성 벤치마크(층 오차/기둥 recall·precision≥0.9), 점군→모델 e2e |

## Stage C. Elastic Completeness (P3-M10 ~ M13)

### P3-M10 Material And Section Library

| Subtask | Exit |
| --- | --- |
| 커스텀 재료 (비선형 backbone 포함) | schema/migration/검증 테스트 |
| 단면 DB + 파라메트릭 + 직접 입력 | KS 테이블 대비 특성 검증 |
| versioned registry (`id@version`) | 불변성/스코프 테스트, 계산서 표기 |
| 편집 UI + 서버 저장 | e2e + agent action |

### P3-M11 Element / Boundary / Load Expansion

| Subtask | Exit |
| --- | --- |
| 스프링 지지 + 지점 침하 (T68) | 스프링 반력 평형 audit, 침하 handcalc 검증 |
| 트러스/인장·압축전담 (T69) | X-brace 인장전담 benchmark, 반복 수렴 trace |
| 부재 offset/강역 (T70) | offset 유/무 비교 benchmark, clear length 전달 |
| 부분/사다리꼴/복수 점하중/부재 모멘트 (T71) | FEF handcalc 케이스, station 회복 정확도 |
| 온도하중 (T72) | 구속 부재 축력 handcalc |

### P3-M12 Wall And Slab

| Subtask | Exit |
| --- | --- |
| mid-pier 벽체 + pier force recovery (T73) | 캔틸레버 전단벽/coupled wall benchmark |
| 쉘 요소 v1 (T74) | patch test, 판 처짐 benchmark |
| semi-rigid diaphragm (T75) | rigid 대비 재분배 리포트, 전이층 예제 |

### P3-M13 Loads v2 / Dynamics / Buckling

| Subtask | Exit |
| --- | --- |
| wind v2 (T76) | KDS 41 12 산정 trace, 예제 수계산 비교 |
| seismic v2 + scaling + Ax (T77) | KDS 41 17 trace, RSA scaling 자동화 |
| 설/토압/수압/부력 (T78) | 지하층 검토 조합 자동 편입 |
| CQC (T79) | 근접 모드 예제 SRSS 대비 리포트 |
| 선형 좌굴 (T80) | Euler ±2%, portal sway 모드 |
| 선형 THA (T81) | 1자유도 정해, 스펙트럼 재현 |
| 질량 소스 (T82) | 층질량 집계 단일 소스 검증 |

## Stage D. Nonlinear (P3-M14 ~ M16)

| Milestone | Exit |
| --- | --- |
| M14 기하 | 요소 검증, 수렴 로그 계약, Euler/elastica benchmark (B1, B2) |
| M15 힌지/control | 힌지 상태 회귀, snap-through(B3), 소성 메커니즘(B4), pushover 회귀(B5) |
| M16 fiber/NLTH | PMM 힌지 검증, fiber 단면 모멘트-곡률 handcalc, NLTH 1자유도 정해 + 지진파 응답 benchmark (B6-B8), 지진파 입력/scaling 관리 |

M16 상세 (기존 "Phase 4 후보"에서 승격):

| Subtask | 범위 | Exit |
| --- | --- | --- |
| PMM 상관 힌지 (T83) | 축력 수준별 M-θ backbone 보간 | 축력 변화 케이스 회귀 |
| fiber 단면 (T84) | RC/steel fiber 분할, 재료 backbone 소비(M10), 모멘트-곡률 | 이론 M-φ 비교 |
| NLTH (T85) | Newmark-β 직접적분, Rayleigh 감쇠, 수렴(NR within step) | 탄성 THA 일치(선형 케이스), 비선형 1자유도 정해 |
| 지진파 관리 (T86) | 기록 업로드/내장 기록, scaling(설계스펙트럼 맞춤 v1) | scaling trace 계산서 표기 |

## Stage E. Design Modules (P3-M17 ~ M18)

P2 T34-T40 이월분의 완결. 상세는 `DESIGN_MODULES_PLAN.md`.

| Milestone | Exit |
| --- | --- |
| M17 RC | 보/기둥(PM 상관)/벽체/슬래브 검토 + 일람표, 수계산 10케이스 tolerance, NG→issue 유입 |
| M18 철골/기초/접합 | 조밀성/LTB/P-M/가새/볼트/용접/base plate/확대기초/매트v1/말뚝v1 + 일람표, 수계산 10케이스 |

## Stage F. Productization (P3-M19 ~ M20)

| Milestone | Exit |
| --- | --- |
| M19 통합 | 비선형/설계 장 계산서 통합, 기본 목차에 `not checked` 장 없음, torsion Ax(T77과 통합)·승인 잠금(T61) 완결, full suite green |
| M20 출시 | packaging smoke, 라이선스 v1, 온보딩/매뉴얼 전면 갱신, 성능/보안 게이트, 베타 파일럿 10 시나리오 리포트 |

## Phase 2 Carry-Over Placement (rev 2)

| P2 잔여 | Phase 3 위치 | 상태 |
| --- | --- | --- |
| torsion amplification Ax | P3-M13 (T77) | 승격 — seismic v2와 통합 |
| wind/seismic v2 | P3-M13 (T76, T77) | 승격 — P0 |
| snow/soil/water/uplift (T20) | P3-M13 (T78) | 승격 — P0 |
| rigid offset (T10) | P3-M11 (T70) | 승격 — P0 |
| semi-rigid/shell 준비 (T12) | P3-M12 (T74, T75) | 승격 |
| RC/steel/기초/접합 상세 (T34-T40) | P3-M17, M18 | 승격 — Phase 3에서 완결 |
| workflow lock (T44-T45) | P3-M19 (T61) | 유지 |

## Development Principles

1. 기능보다 trace를 우선한다.
2. import 결과는 반드시 human-in-loop 확정을 거친다.
3. 비선형/동적 해석은 수렴 로그와 방법 한계를 계산서에 남긴다.
4. 서버/계정 코드는 해석 코드와 폴더 수준에서 분리한다.
5. 외부 의존성은 기본 zero-dependency, 도입 시 `ARCHITECTURE.md` 결정표 기록.
6. 대표 모델과 benchmark 없이 기능 완료로 보지 않는다.
7. (rev 2) 설계 검토는 수계산 검증 케이스 없이 완료로 보지 않는다.
8. (rev 2) 신규 요소/하중은 sign convention, 단위 표기, validation, 매뉴얼을 같은 티켓에서 갱신한다.
