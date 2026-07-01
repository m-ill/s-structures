# Phase 3 Development Hub

phase: 3
status: active planning
source: user direction 2026-07-02

Phase 3의 목표는 현재의 탄성해석 실무 검토 플랫폼(Phase 2 MVP 완료)을 **출시 직전 수준의 완전한 구조해석 제품**으로 만드는 것이다.

## Vision

```text
입력:  DWG/DXF 도면, 3D point cloud, 기존 JSON 모델
  -> 자동 3D 모델링 + human-in-loop 검토 확정
  -> 커스텀 재료/단면 라이브러리
  -> 탄성해석 ~ 정식 비선형해석
  -> 계산서 / 검토 workflow / 승인
플랫폼: 로그인 + 프로젝트 저장 + 서버 + 프론트 앱
```

## Five Pillars

| Pillar | 내용 | 관련 문서 |
| --- | --- | --- |
| 1. 도면 import | DXF 직접 파싱, DWG 변환 경로, 2D 평면→3D 조립 | `IMPORT_DXF_DWG_PLAN.md` |
| 2. Point cloud import | 점군 로드/시각화, 층/기둥/보/벽 추출, 검토 확정 | `IMPORT_POINT_CLOUD_PLAN.md` |
| 3. 재료/단면 커스텀 | versioned 라이브러리, 비선형 재료 파라미터 | `MATERIAL_SECTION_LIBRARY_PLAN.md` |
| 4. 비선형 해석 정식화 | 기하/재료 비선형, NR/arc-length, 검증 benchmark | `NONLINEAR_ENGINE_PLAN.md` |
| 5. 제품 플랫폼 | 서버, 로그인, 저장, 프론트 앱, 출시 준비 | `ARCHITECTURE.md`, `SERVER_API_PLAN.md`, `AUTH_ACCOUNT_PLAN.md`, `PERSISTENCE_PLAN.md`, `FRONTEND_PLAN.md`, `QA_RELEASE_PLAN.md` |

## Baseline From Phase 2

Phase 2 MVP(T01-T50)는 완료 상태다. Phase 3는 아래를 그대로 물려받는다.

1. schema-versioned model + migration + validation gate.
2. 3D 선형 solver + benchmark gate + analysis audit.
3. story/release/diaphragm 모델링, 하중 산정 trace, 조합/envelope.
4. 계산서/practice validation/issue registry/대표건물 10종 pilot gate.
5. agent API 계약 (`agent-contract.json`, capability manifest).

Phase 2 잔여 항목(torsion amplification, wind/seismic v2, 상세 설계 모듈 T34-T40, workflow lock T44-T45)은 Phase 3 마일스톤에 흡수한다. 위치는 `ROADMAP.md`에 명시한다.

## Phase 3 Tracks

| Track | 목적 | 주요 폴더 |
| --- | --- | --- |
| P3-A Platform Backbone | 서버, 계정, 프로젝트 저장, 프론트 앱 shell | `server/`, `src/app/` |
| P3-B Geometry Import | DXF/DWG/point cloud를 model schema로 수렴 | `src/import/`, `src/viewer/` |
| P3-C Material Library | 커스텀 재료/단면 versioned registry | `src/materials/` |
| P3-D Nonlinear Engine | 정식 기하/재료 비선형 해석 | `src/nonlinear/`, `src/solver/` |
| P3-E Product Hardening | 성능, 보안, packaging, 베타 파일럿 | 전체 |

## Active Phase 3 Documents

| 문서 | 역할 |
| --- | --- |
| `ROADMAP.md` | P3-M0부터 P3-M14까지 마일스톤 로드맵 |
| `IMPLEMENTATION_BACKLOG.md` | P3-T## 티켓 백로그 |
| `PRODUCT_REQUIREMENTS.md` | Phase 3 제품 요구사항 (PRD) |
| `ARCHITECTURE.md` | 전체 시스템 아키텍처와 기술 결정 |
| `FRONTEND_PLAN.md` | 앱 shell, 라우팅, 뷰어, import 검토 UI |
| `SERVER_API_PLAN.md` | REST API 명세와 서버 구조 |
| `AUTH_ACCOUNT_PLAN.md` | 회원/로그인/권한 설계 |
| `PERSISTENCE_PLAN.md` | 저장, autosave, revision, 마이그레이션 |
| `IMPORT_DXF_DWG_PLAN.md` | 도면 import 파이프라인 명세 |
| `IMPORT_POINT_CLOUD_PLAN.md` | 점군 import 파이프라인 명세 |
| `MATERIAL_SECTION_LIBRARY_PLAN.md` | 재료/단면 라이브러리 명세 |
| `NONLINEAR_ENGINE_PLAN.md` | 비선형 엔진 명세와 검증 계획 |
| `QA_RELEASE_PLAN.md` | 테스트 전략, 성능/보안, 출시 게이트 |
| `DEVELOPMENT_FILE_MAP.md` | Phase 3 폴더/파일 지도 |

## Reading Order

1. `PRODUCT_REQUIREMENTS.md`
2. `ROADMAP.md`
3. `ARCHITECTURE.md`
4. 착수할 마일스톤의 상세 계획 문서
5. `IMPLEMENTATION_BACKLOG.md`에서 티켓 선택
6. `DEVELOPMENT_FILE_MAP.md`로 파일 위치 확인

## Phase 3 Gate

기능을 Phase 3 baseline에 넣기 전 최소 조건. Phase 2 gate를 계승하고 두 항목을 추가한다.

1. public API/UI action 변경 시 `agent-contract.json` 갱신.
2. 사용자 흐름 변경 시 `user-manual/` 갱신.
3. 새 계산 로직은 단위 테스트 + workflow 테스트.
4. 보고서 표시 값은 source trace 또는 limitation 동반.
5. 생성 파일은 `reports/` 또는 `output/`로만.
6. (신규) import 결과 모델은 validation을 통과해야 저장 가능.
7. (신규) 서버 API 변경은 `SERVER_API_PLAN.md`와 API 계약 테스트 동시 갱신.

## Repository And Material Hygiene

| 항목 | 규칙 |
| --- | --- |
| 개발 저장소 | `s-structures-review/`가 유일한 소스 저장소 |
| 상위 `dcr/` 폴더의 원본 추출물 | `_app`, `_asar_*`, `_extract`, `DCR-Setup.exe`, `restored-dcr`, `일본구조계산프로그램output`은 분석 참고자료. 소스로 취급하지 않고, 백업 후 별도 보관(archive) 권장 |
| 서버 런타임 데이터 | `data/` (git 추적 제외) |
| 업로드 원본(도면/점군) | `data/projects/<id>/files/` (git 추적 제외) |
| 대용량 테스트 fixture | `tests/fixtures/` 소형 결정적 파일만. 대형 점군은 생성 스크립트로 합성 |
