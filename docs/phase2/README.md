# Phase 2 Development Hub

phase: 2
status: 준비

Phase 2는 현재의 선형 탄성해석 제품 흐름을 구조설계사무소용 실무 플랫폼으로 키우는 단계다. 목표는 기능을 더 붙이기 전에 파일 위치, 문서 위치, API 계약, 검증 산출물, 기준식 trace를 분리해서 장기 개발이 가능한 구조를 만드는 것이다.

## Current Baseline

현재 baseline은 다음 흐름이다.

```text
index.html native modeler
-> schema-versioned model
-> 3D linear elastic solver
-> load combinations and envelopes
-> preliminary design checks
-> load derivation and member trace
-> detailed report / calculation package
-> agent API and stabilization harness
```

비선형은 아직 정식 Phase 2 baseline이 아니다. pushover 예비 기능은 유지하되, tangent stiffness, hinge degradation, convergence, load/displacement control이 정식화되기 전까지는 preliminary로 분리한다.

## Phase 2 Tracks

| Track | 목적 | 주요 폴더 |
| --- | --- | --- |
| P2-A Import Pipeline | 도면 이미지, MGT, JSON 변환 입력을 같은 model schema로 수렴 | `src/import/` 예정, `src/core/`, `tests/` |
| P2-B Code Standard Engine | KDS-style preset을 실제 기준식 registry와 audit trail로 확장 | `src/core/`, `src/design/`, `tests/` |
| P2-C Detailed Design | RC, steel, connection, foundation 검토를 예비에서 상세 trace로 확장 | `src/design/`, `src/report/` |
| P2-D Report Review Workflow | 계산서, action item, 누락 항목 closure, revision 기록 | `src/report/`, `src/ui/` |
| P2-E AI Control Contract | agent가 화면/API를 안정적으로 조작하고 검증 결과를 읽는 계약 유지 | `src/ui/`, `docs/user-manual/` |
| P2-F Nonlinear Engine Prep | 정식 비선형 해석을 위한 상태 구조와 검증 harness 준비 | `src/nonlinear/`, `src/solver/`, `src/verification/` |

## Active Phase 2 Documents

| 문서 | 역할 |
| --- | --- |
| `ROADMAP.md` | P2-M0부터 P2-M14까지 전체 개발 로드맵 |
| `IMPLEMENTATION_BACKLOG.md` | 50개 티켓 단위 실행 백로그 |
| `ELASTIC_PRACTICE_MVP.md` | 1차 목표인 탄성해석 실무 검토 MVP 범위와 실행 순서 |
| `STANDARD_ENGINE_PLAN.md` | solver와 기준 엔진 분리, versioned registry 계획 |
| `DEVELOPMENT_FILE_MAP.md` | 코드와 문서의 위치 지도 |
| `DOCUMENTATION_GOVERNANCE.md` | 문서/생성물/계획 파일 분리 규칙 |

## Phase 2 Gate

새 기능을 Phase 2 baseline에 넣기 전 최소 조건은 다음과 같다.

1. public API 또는 UI action이 있으면 `agent-contract.json` 갱신.
2. 사용자 흐름이 바뀌면 `user-manual/` 갱신.
3. 새 계산 로직은 단위 테스트와 대표 workflow 테스트 추가.
4. 보고서에 표시되는 값은 source trace 또는 limitation을 함께 둔다.
5. 생성 파일은 `reports/` 또는 `output/`로만 보낸다.
6. milestone 기록은 `docs/milestones/`에 남기되, 현재 사용법은 `user-manual/`로 승격한다.

## Immediate Preparation Tasks

| 우선순위 | 작업 | 완료 기준 |
| --- | --- | --- |
| P0 | 문서 구조 분리 | `docs/README.md`와 phase2 문서가 있고 루트에 loose milestone 문서가 없음 |
| P0 | 문서 패키지 추적 방지 | `docs/*.zip`은 source doc으로 추적하지 않음 |
| P0 | 탄성해석 실무 검토 MVP 착수 | `ELASTIC_PRACTICE_MVP.md`의 P2-MVP-S1부터 진행 |
| P0 | 기준식 registry 확장 계획 | `STANDARD_ENGINE_PLAN.md`에 따라 solver와 standard registry 분리 |
| P1 | import 입력 폴더 설계 | `src/import/` 계획과 model mapping contract 작성 |
| P1 | 보고서 action item workflow | 계산서의 미완 항목을 issue-like checklist로 추적 |
| P2 | 정식 비선형 TRD 보강 | 현재 pushover preliminary와 정식 nonlinear engine 요구사항 분리 |
