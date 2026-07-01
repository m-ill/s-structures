# Phase 3 Roadmap

status: active planning
source: user direction 2026-07-02

Phase 3는 4개 stage, 15개 마일스톤으로 진행한다. 각 마일스톤은 완료 기준(Exit)과 검증물이 있어야 닫힌다. 크기는 상대 규모다 (S: 며칠, M: 1-2주, L: 2-4주 상당).

## Stage Overview

| Stage | Milestones | 목표 |
| --- | --- | --- |
| Stage A 플랫폼 기반 | P3-M0 ~ P3-M4 | 서버/계정/저장/앱 shell — 제품의 뼈대 |
| Stage B 입력 파이프라인 | P3-M5 ~ P3-M9 | DXF/DWG/point cloud → 3D 모델 |
| Stage C 해석 심화 | P3-M10 ~ P3-M12 | 커스텀 재료, 정식 비선형 엔진 |
| Stage D 제품화 | P3-M13 ~ P3-M14 | 통합 검증, 성능/보안, 출시 준비 |

Stage A와 B는 병렬 가능하다(A는 플랫폼 코드, B는 해석 코드 영역). Stage C의 M11-M12는 M10에 의존한다. Stage D는 전부에 의존한다.

## Milestone Summary

| Milestone | 크기 | 목표 | 핵심 결과물 |
| --- | --- | ---| --- |
| P3-M0 | S | Phase 3 기준선 | 폴더 재정리, 문서 게이트, 버전 계약, CI 게이트 확장 |
| P3-M1 | M | 서버 골격 | node 서버, REST v1, 프로젝트 파일 저장소 |
| P3-M2 | M | 계정/로그인 | 가입/로그인/세션, 역할, 프로젝트 권한 |
| P3-M3 | M | 저장 체계 | local/server 저장 통합, autosave, revision history |
| P3-M4 | L | 프론트 앱 shell | 로그인→프로젝트→모델러 SPA, WebGL2 뷰어 기반 |
| P3-M5 | M | Geometry core | tolerance merge, snap, story/grid 추론, 부재축 유틸 |
| P3-M6 | L | DXF import v1 | DXF 파서, 3D wireframe→부재, layer mapping, audit |
| P3-M7 | L | DWG/도면 인식 v2 | DWG 변환 경로, 2D 층별 평면→3D 조립, 인식 검토 UI |
| P3-M8 | L | Point cloud v1 | PLY/XYZ/PCD/LAS 로드, downsample, 점군 뷰어 |
| P3-M9 | L | Point cloud 추출 v2 | 층/기둥/보/벽 검출, confidence, human-in-loop 확정 |
| P3-M10 | M | 재료/단면 라이브러리 | 커스텀 재료/단면, versioned registry, 비선형 파라미터 |
| P3-M11 | L | 비선형 엔진 v1 | 기하비선형, Newton-Raphson, load control, 수렴 계약 |
| P3-M12 | L | 비선형 엔진 v2 | 소성힌지, displacement/arc-length control, pushover 정식화 |
| P3-M13 | M | 통합 결과/보고서 | 비선형 후처리, 계산서 통합, P2 잔여 흡수 |
| P3-M14 | L | 출시 준비 | packaging, 라이선스, 온보딩, 베타 파일럿, 성능/보안 |

## P3-M0 Phase 3 Baseline

| Subtask | 범위 | Exit |
| --- | --- | --- |
| M0-1 폴더 재정리 | `DEVELOPMENT_FILE_MAP.md` 기준 신규 폴더 생성, `data/` gitignore | 파일 지도와 실제 구조 일치 |
| M0-2 문서 게이트 | phase3 문서 세트 완성, docs/README 갱신 | reading order 동작 |
| M0-3 버전 계약 | `platformVersion.js`에 phase3 계약 버전 추가 | 버전 문자열 테스트 |
| M0-4 CI 게이트 확장 | 테스트 러너가 p3 테스트 그룹 인식 | `npm test` 단일 명령 유지 |

## P3-M1 Server Backbone

| Subtask | 범위 | Exit |
| --- | --- | --- |
| M1-1 HTTP 서버 | `server/` node:http 기반 라우터, 정적 서빙 통합 | `tools/serve.mjs` 대체, 기존 브라우저 앱 동작 |
| M1-2 REST v1 | 프로젝트 CRUD, 모델 snapshot 저장/조회 | API 계약 테스트 통과 |
| M1-3 파일 저장소 | `data/projects/<id>/` 구조, 업로드/다운로드 | 10MB 모델 round-trip |
| M1-4 오류 계약 | 일관된 error envelope, 요청 로깅 | 오류 응답 스키마 테스트 |

## P3-M2 Account And Auth

| Subtask | 범위 | Exit |
| --- | --- | --- |
| M2-1 가입/로그인 | email+password, node:crypto scrypt 해시 | 해시 검증 테스트 |
| M2-2 세션 토큰 | HMAC 서명 토큰, 만료, 갱신 | 위조/만료 토큰 거부 테스트 |
| M2-3 역할/권한 | owner/engineer/reviewer, 프로젝트별 멤버십 | 권한 없는 접근 403 테스트 |
| M2-4 보안 기본 | rate limit, 입력 검증, upload 크기 제한 | `QA_RELEASE_PLAN.md` 보안 체크 통과 |

## P3-M3 Persistence

| Subtask | 범위 | Exit |
| --- | --- | --- |
| M3-1 저장 대상 통합 | browser local / 파일 export / server project 3계층 | 동일 모델 3경로 round-trip |
| M3-2 autosave | 편집 세션 주기 저장, 복구 프롬프트 | 강제 종료 후 복구 테스트 |
| M3-3 revision history | snapshot + 메타(작성자/시각/설명), 목록/복원 | 복원 후 schema migration 정상 |
| M3-4 충돌 규칙 | last-write-wins + revision lineage warning | 동시 저장 시나리오 테스트 |

## P3-M4 Frontend App Shell

| Subtask | 범위 | Exit |
| --- | --- | --- |
| M4-1 앱 shell | hash 라우팅: login/projects/modeler/import/results | 로그인→모델러 왕복 e2e |
| M4-2 프로젝트 브라우저 | 목록, 생성, 열기, revision 보기 | fake dom 테스트 |
| M4-3 WebGL2 뷰어 기반 | `src/viewer/` 점군+모델 겹침 렌더 기반 모듈 | 1e6 점 60fps 예산 |
| M4-4 agent 계약 유지 | 새 화면의 action을 capability manifest에 등록 | agent-contract 테스트 |

## P3-M5 Geometry Core

| Subtask | 범위 | Exit |
| --- | --- | --- |
| M5-1 tolerance merge | endpoint 병합, 중복 부재 제거, 짧은 선분 필터 | 단위 테스트 |
| M5-2 story/grid 추론 | z-클러스터→story, x/y 정렬→grid 후보 | 대표건물 역추론 검증 |
| M5-3 부재축 분류 | 방향 벡터→기둥/보/가새 분류 유틸 | 분류 정확도 테스트 |
| M5-4 import 공통 계약 | importer 출력 표준: 후보 element + confidence + audit | schema 계약 테스트 |

## P3-M6 DXF Import v1

| Subtask | 범위 | Exit |
| --- | --- | --- |
| M6-1 DXF 파서 | group-code 토크나이저, LINE/POLYLINE/INSERT/TEXT/CIRCLE | fixture 파싱 테스트 |
| M6-2 단위/좌표 정규화 | $INSUNITS, z-up 변환, 원점 이동 | 단위 audit 출력 |
| M6-3 wireframe 매핑 | 3D 라인→부재, M5 merge/분류 적용 | 대표 wireframe fixture→해석 가능 모델 |
| M6-4 layer mapping | layer→단면/재료 매핑 테이블(사용자 편집) | mapping coverage audit |
| M6-5 import audit | 요소 수, 미매핑, 고아 노드, bbox, 단위 의심 | audit 보고서 + validation 통과 시만 저장 |

## P3-M7 DWG And Drawing Recognition v2

| Subtask | 범위 | Exit |
| --- | --- | --- |
| M7-1 DWG 변환 경로 | ODA File Converter 자동 감지/호출, 실패 시 DXF 안내 | DWG→DXF→모델 e2e (변환기 설치 환경) |
| M7-2 2D 평면 인식 | 층별 평면 DXF: grid 라인+라벨, 기둥 심볼, 보 중심선 | 평면 fixture 인식률 리포트 |
| M7-3 층 조립 | 평면 n장 + 층고 입력→3D 모델 조립 | 2층 이상 조립 e2e |
| M7-4 인식 검토 UI | 도면 overlay 위 후보 확정/수정/거부 | human-in-loop 확정 워크플로 테스트 |

## P3-M8 Point Cloud v1

| Subtask | 범위 | Exit |
| --- | --- | --- |
| M8-1 포맷 로더 | XYZ/PLY(ascii,binary)/PCD, LAS(비압축) | fixture 로드 테스트 |
| M8-2 전처리 | voxel downsample, outlier 제거, z-up/단위 정규화 | 1e7점 30초 내 처리 예산 |
| M8-3 점군 뷰어 | WebGL2 POINTS 렌더, 슬라이스/구간 필터 | 2e6점 60fps |
| M8-4 worker 파이프라인 | 로드/전처리 Web Worker 분리 | main thread 블로킹 없음 |

## P3-M9 Point Cloud Structure Extraction v2

| Subtask | 범위 | Exit |
| --- | --- | --- |
| M9-1 층 검출 | z-히스토그램 + 수평면 RANSAC→story levels | 합성 점군 층 오차 허용치 내 |
| M9-2 기둥 검출 | xy 투영 클러스터 + 수직 연속성→기둥 축 | recall/precision 리포트 |
| M9-3 보/벽 검출 | 수평 선형 클러스터→보, 수직 평면→벽 패널 | 합성 벤치마크 통과 |
| M9-4 확정 워크플로 | 후보+confidence→검토 UI→모델 확정 | 점군→해석 가능 모델 e2e |
| M9-5 합성 fixture 생성기 | 대표건물 모델→표면 샘플+노이즈 점군 | ground-truth 비교 harness |

## P3-M10 Material And Section Library

| Subtask | 범위 | Exit |
| --- | --- | --- |
| M10-1 커스텀 재료 | E/G/ν/ρ/강도 + 비선형 곡선 파라미터 | schema+migration+검증 |
| M10-2 단면 DB/커스텀 | KS 형강 DB, RC/강관 파라메트릭, 직접 입력 | 단면 특성 계산 검증 |
| M10-3 versioned registry | `id@version`, 계산서 버전 표기, project/global 스코프 | registry 계약 테스트 |
| M10-4 라이브러리 UI/저장 | 편집 UI, 서버 저장 연동 | e2e + agent action |

## P3-M11 Nonlinear Engine v1 (Geometric)

| Subtask | 범위 | Exit |
| --- | --- | --- |
| M11-1 상태/증분 구조 | analysis state, incremental step, restart | 상태 스냅샷 테스트 |
| M11-2 기하비선형 요소 | corotational 3D beam + KG | 요소 단위 검증 |
| M11-3 Newton-Raphson | full NR + line search, 수렴 norm 계약 | 수렴 로그 trace |
| M11-4 benchmark | Euler 좌굴 ±2%, cantilever 대변위 vs elastica | benchmark gate 등록 |

## P3-M12 Nonlinear Engine v2 (Material + Control)

| Subtask | 범위 | Exit |
| --- | --- | --- |
| M12-1 소성힌지 | M-θ backbone(bilinear/수정계수), 힌지 상태 trace | 힌지 상태 회귀 테스트 |
| M12-2 displacement control | 제어 절점 변위 증분 | post-peak 추적 |
| M12-3 arc-length | Crisfield arc-length | von Mises truss snap-through 통과 |
| M12-4 pushover 정식화 | preliminary pushover 대체, 성능점 산정 계약 | 대표건물 pushover 회귀 + trace |

## P3-M13 Integrated Results And Report

| Subtask | 범위 | Exit |
| --- | --- | --- |
| M13-1 비선형 후처리 | 스텝별 결과, 힌지 분포, capacity curve 표 | 결과 계약 테스트 |
| M13-2 계산서 통합 | 비선형 장 추가, method/limitation 표기 | practiceValidation 연결 |
| M13-3 P2 잔여 흡수 | torsion amplification, workflow lock(T44-45) | 해당 계약 구현 |
| M13-4 검증 확대 | 전체 benchmark + 대표건물 회귀 갱신 | full suite 통과 |

## P3-M14 Launch Readiness

| Subtask | 범위 | Exit |
| --- | --- | --- |
| M14-1 packaging | 웹(정적+서버 단일 배포), 데스크톱(Electron) 결정/구현 | 설치→실행→해석 smoke |
| M14-2 라이선스/과금 준비 | 라이선스 키 검증 v1, 플랜 구분 자리 | 키 검증 테스트 |
| M14-3 온보딩 | 샘플 프로젝트, 튜토리얼 문서, user-manual 전면 갱신 | 신규 사용자 시나리오 통과 |
| M14-4 성능/보안 점검 | `QA_RELEASE_PLAN.md` 예산/체크리스트 전체 | 출시 게이트 통과 |
| M14-5 베타 파일럿 | 실제 사무소 시나리오 10종 검증 | 파일럿 리포트 + 이슈 반영 |

## Phase 2 Carry-Over Placement

| P2 잔여 | Phase 3 위치 |
| --- | --- |
| torsion amplification | P3-M13 |
| wind/seismic v2 (standard registry 상세) | P3-M10 이후 backlog (P3-T57) |
| RC/steel/기초 상세 설계 모듈 (T34-T40) | Phase 3 범위 외 유지, 출시 후 Phase 4 후보. 단 계산서 'not checked' 표기 유지 |
| workflow lock (T44-T45) | P3-M13 |

## Development Principles

Phase 2 원칙을 계승하고 추가한다.

1. 기능보다 trace를 우선한다.
2. import 결과는 반드시 human-in-loop 확정을 거친다. 자동 인식은 후보일 뿐이다.
3. 비선형 해석은 수렴 로그와 방법 한계를 계산서에 남긴다.
4. 서버/계정 코드는 해석 코드와 폴더 수준에서 분리한다.
5. 외부 의존성은 기본 zero-dependency를 유지하고, 도입 시 `ARCHITECTURE.md`에 결정 기록을 남긴다.
6. 대표 모델과 benchmark 없이 기능 완료로 보지 않는다.
